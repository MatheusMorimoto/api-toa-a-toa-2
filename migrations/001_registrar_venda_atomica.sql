-- NÃO execute automaticamente em produção.
-- Faça backup lógico, revise nomes/tipos de colunas e aplique primeiro em homologação.
begin;

create or replace function public.registrar_venda_atomica(
    p_cliente_id bigint,
    p_forma_pagamento text,
    p_valor_costura numeric default 0,
    p_desconto_valor numeric default 0,
    p_observacoes text default null,
    p_itens jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_venda_id bigint;
    v_item record;
    v_produto record;
begin
    if p_cliente_id is null or not exists (
        select 1 from public.clientes where id = p_cliente_id
    ) then
        raise exception using message = 'CLIENTE_NAO_ENCONTRADO', errcode = 'P0001';
    end if;

    if p_forma_pagamento is null or btrim(p_forma_pagamento) = '' then
        raise exception using message = 'FORMA_PAGAMENTO_INVALIDA', errcode = 'P0001';
    end if;

    if coalesce(p_valor_costura, 0) < 0 or coalesce(p_desconto_valor, 0) < 0 then
        raise exception using message = 'VALORES_INVALIDOS', errcode = 'P0001';
    end if;

    if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
        raise exception using message = 'ITENS_INVALIDOS', errcode = 'P0001';
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(p_itens) as item(produto_id bigint, tipo text, preco numeric)
        where item.produto_id is null
           or item.tipo not in ('venda', 'aluguel')
           or item.preco is null
           or item.preco < 0
    ) then
        raise exception using message = 'ITEM_INVALIDO', errcode = 'P0001';
    end if;

    -- O bloqueio em ordem estável evita corrida de estoque e reduz risco de deadlock.
    for v_produto in
        select p.id, p.quantidade, solicitados.quantidade as quantidade_solicitada
        from (
            select item.produto_id, count(*)::integer as quantidade
            from jsonb_to_recordset(p_itens) as item(produto_id bigint, tipo text, preco numeric)
            where item.tipo = 'venda'
            group by item.produto_id
        ) solicitados
        join public.produtos p on p.id = solicitados.produto_id
        order by p.id
        for update of p
    loop
        if coalesce(v_produto.quantidade, 0) < v_produto.quantidade_solicitada then
            raise exception using
                message = 'ESTOQUE_INSUFICIENTE',
                detail = format('Produto %s sem estoque suficiente.', v_produto.id),
                errcode = 'P0001';
        end if;
    end loop;

    if exists (
        select 1
        from jsonb_to_recordset(p_itens) as item(produto_id bigint, tipo text, preco numeric)
        left join public.produtos p on p.id = item.produto_id
        where p.id is null
    ) then
        raise exception using message = 'PRODUTO_NAO_ENCONTRADO', errcode = 'P0001';
    end if;

    insert into public.vendas (
        cliente_id, forma_pagamento, valor_costura, desconto_valor, observacoes
    ) values (
        p_cliente_id, p_forma_pagamento, coalesce(p_valor_costura, 0),
        coalesce(p_desconto_valor, 0), p_observacoes
    )
    returning id into v_venda_id;

    for v_item in
        select * from jsonb_to_recordset(p_itens)
            as item(produto_id bigint, tipo text, preco numeric)
    loop
        insert into public.itens_venda (venda_id, produto_id, tipo, preco)
        values (v_venda_id, v_item.produto_id, v_item.tipo, v_item.preco);
    end loop;

    update public.produtos p
    set quantidade = p.quantidade - solicitados.quantidade
    from (
        select item.produto_id, count(*)::integer as quantidade
        from jsonb_to_recordset(p_itens) as item(produto_id bigint, tipo text, preco numeric)
        where item.tipo = 'venda'
        group by item.produto_id
    ) solicitados
    where p.id = solicitados.produto_id;

    return jsonb_build_object('venda_id', v_venda_id);
end;
$$;

revoke all on function public.registrar_venda_atomica(bigint, text, numeric, numeric, text, jsonb) from public;
grant execute on function public.registrar_venda_atomica(bigint, text, numeric, numeric, text, jsonb) to service_role;

commit;

-- Rollback da função (não remove nem altera dados):
-- drop function if exists public.registrar_venda_atomica(bigint, text, numeric, numeric, text, jsonb);
