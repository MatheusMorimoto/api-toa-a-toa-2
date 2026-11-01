-- Aplique primeiro em homologacao. Qualquer erro na funcao faz rollback integral.
begin;

drop function if exists public.registrar_venda_atomica(bigint, text, numeric, numeric, text, jsonb);

create or replace function public.registrar_venda_atomica(
    p_cliente_id bigint, p_forma_pagamento text, p_bandeira_cartao text default null,
    p_valor_costura numeric default 0, p_desconto_valor numeric default 0,
    p_data_retirada date default null, p_data_devolucao date default null,
    p_observacoes text default null, p_itens jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
    v_venda_id bigint;
    v_cliente public.clientes%rowtype;
    v_item record;
    v_total_bruto numeric := 0;
    v_total_final numeric;
begin
    select * into v_cliente from public.clientes where id = p_cliente_id;
    if not found then raise exception using message = 'CLIENTE_NAO_ENCONTRADO', errcode = 'P0001'; end if;

    if p_forma_pagamento not in ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito') then
        raise exception using message = 'FORMA_PAGAMENTO_INVALIDA', errcode = 'P0001';
    end if;
    if p_forma_pagamento in ('cartao_debito', 'cartao_credito') and
       coalesce(p_bandeira_cartao, '') not in ('visa', 'mastercard', 'elo', 'american_express', 'hipercard', 'outra') then
        raise exception using message = 'BANDEIRA_INVALIDA', errcode = 'P0001';
    end if;
    if p_forma_pagamento in ('dinheiro', 'pix') and p_bandeira_cartao is not null then
        raise exception using message = 'BANDEIRA_NAO_PERMITIDA', errcode = 'P0001';
    end if;
    if coalesce(p_valor_costura, 0) < 0 or coalesce(p_desconto_valor, 0) < 0 then
        raise exception using message = 'VALORES_INVALIDOS', errcode = 'P0001';
    end if;
    if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
        raise exception using message = 'ITENS_INVALIDOS', errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
               where produto_id is null or tipo not in ('venda', 'aluguel') or coalesce(quantidade, 1) < 1) then
        raise exception using message = 'ITEM_INVALIDO', errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
               where tipo = 'aluguel') and (p_data_retirada is null or p_data_devolucao is null) then
        raise exception using message = 'DATAS_ALUGUEL_OBRIGATORIAS', errcode = 'P0001';
    end if;
    if p_data_retirada is not null and p_data_devolucao is not null and p_data_devolucao < p_data_retirada then
        raise exception using message = 'DATAS_ALUGUEL_INVALIDAS', errcode = 'P0001';
    end if;

    -- Ordem estavel e FOR UPDATE evitam corrida de estoque e precos divergentes.
    perform p.id from public.produtos p join (
        select distinct produto_id from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
    ) s on s.produto_id = p.id order by p.id for update of p;

    if (select count(distinct produto_id) from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)) <>
       (select count(*) from public.produtos p where p.id in
          (select distinct produto_id from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer))) then
        raise exception using message = 'PRODUTO_NAO_ENCONTRADO', errcode = 'P0001';
    end if;
    if exists (
        select 1 from (
            select produto_id, sum(coalesce(quantidade, 1))::integer quantidade
            from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
            where tipo = 'venda' group by produto_id
        ) s join public.produtos p on p.id = s.produto_id
        where coalesce(p.quantidade, 0) < s.quantidade
    ) then raise exception using message = 'ESTOQUE_INSUFICIENTE', errcode = 'P0001'; end if;

    select coalesce(sum(coalesce(i.quantidade, 1) *
        case when i.tipo = 'venda' then p.preco_unitario else p.preco_pacote end), 0)
    into v_total_bruto
    from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
    join public.produtos p on p.id = i.produto_id;
    if p_desconto_valor > v_total_bruto + p_valor_costura then
        raise exception using message = 'DESCONTO_INVALIDO', errcode = 'P0001';
    end if;
    v_total_final := v_total_bruto + coalesce(p_valor_costura, 0) - coalesce(p_desconto_valor, 0);

    insert into public.vendas (
        cliente_id, total_bruto, desconto_valor, valor_costura, total_final, forma_pagamento,
        observacoes, cliente_snapshot, bandeira_cartao, data_retirada, data_devolucao, data_venda
    ) values (
        p_cliente_id, v_total_bruto, coalesce(p_desconto_valor, 0), coalesce(p_valor_costura, 0),
        v_total_final, p_forma_pagamento, p_observacoes, to_jsonb(v_cliente),
        case when p_forma_pagamento in ('dinheiro', 'pix') then null else p_bandeira_cartao end,
        p_data_retirada, p_data_devolucao, now()
    ) returning id into v_venda_id;

    for v_item in
        select i.produto_id, i.tipo, coalesce(i.quantidade, 1)::integer quantidade, p.nome produto_nome,
               case when i.tipo = 'venda' then p.preco_unitario else p.preco_pacote end preco_unitario
        from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
        join public.produtos p on p.id = i.produto_id
    loop
        insert into public.itens_venda (
            venda_id, produto_id, tipo, quantidade, preco_unitario, produto_nome, subtotal,
            data_retirada, data_devolucao
        ) values (
            v_venda_id, v_item.produto_id, v_item.tipo, v_item.quantidade, v_item.preco_unitario,
            v_item.produto_nome, v_item.quantidade * v_item.preco_unitario,
            case when v_item.tipo = 'aluguel' then p_data_retirada end,
            case when v_item.tipo = 'aluguel' then p_data_devolucao end
        );
    end loop;

    update public.produtos p set quantidade = p.quantidade - s.quantidade from (
        select produto_id, sum(coalesce(quantidade, 1))::integer quantidade
        from jsonb_to_recordset(p_itens) i(produto_id bigint, tipo text, quantidade integer)
        where tipo = 'venda' group by produto_id
    ) s where p.id = s.produto_id;

    return jsonb_build_object('venda_id', v_venda_id, 'total_bruto', v_total_bruto,
        'desconto_valor', coalesce(p_desconto_valor, 0), 'valor_costura', coalesce(p_valor_costura, 0),
        'total_final', v_total_final);
end;
$$;

revoke all on function public.registrar_venda_atomica(bigint,text,text,numeric,numeric,date,date,text,jsonb) from public;
grant execute on function public.registrar_venda_atomica(bigint,text,text,numeric,numeric,date,date,text,jsonb) to service_role;
commit;

-- Rollback: drop function if exists public.registrar_venda_atomica(bigint,text,text,numeric,numeric,date,date,text,jsonb);
