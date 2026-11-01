'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createApp, validateSale, saleFilters, formatSale } = require('../db');

const item = { produto_id: 10, tipo: 'venda' };
const base = { cliente_id: 1, forma_pagamento: 'pix', itens: [item] };

test('PIX e dinheiro válidos não levam bandeira para a RPC', () => {
    assert.equal(validateSale(base).p_bandeira_cartao, null);
    assert.equal(validateSale({ ...base, forma_pagamento: 'dinheiro' }).p_bandeira_cartao, null);
});

test('débito e crédito exigem bandeira permitida', () => {
    assert.equal(validateSale({ ...base, forma_pagamento: 'cartao_debito', bandeira_cartao: 'visa' }).p_bandeira_cartao, 'visa');
    assert.equal(validateSale({ ...base, forma_pagamento: 'cartao_credito', bandeira_cartao: 'elo' }).p_bandeira_cartao, 'elo');
    assert.throws(() => validateSale({ ...base, forma_pagamento: 'cartao_credito' }), /bandeira/i);
    assert.throws(() => validateSale({ ...base, bandeira_cartao: 'visa' }), /só pode/i);
});

test('aluguel exige datas válidas e aceita período correto', () => {
    const aluguel = { ...base, itens: [{ produto_id: 10, tipo: 'aluguel' }] };
    assert.throws(() => validateSale(aluguel), /obrigatórias/i);
    assert.throws(() => validateSale({ ...aluguel, data_retirada: '2026-11-05', data_devolucao: '2026-11-04' }), /anterior/i);
    assert.equal(validateSale({ ...aluguel, data_retirada: '2026-11-04', data_devolucao: '2026-11-05' }).p_data_devolucao, '2026-11-05');
});

test('filtros aceitam data, PIX, dinheiro e cartões combinados', () => {
    const filters = saleFilters({ data_inicio: '2026-11-01', data_fim: '2026-11-01', forma_pagamento: 'cartao_debito,cartao_credito', ids: '1,2' });
    assert.deepEqual(filters.payments, ['cartao_debito', 'cartao_credito']);
    assert.deepEqual(filters.ids, [1, 2]);
    assert.equal(new Date(filters.endExclusive).toISOString(), '2026-11-02T00:00:00.000Z');
    assert.deepEqual(saleFilters({ forma_pagamento: 'pix' }).payments, ['pix']);
    assert.deepEqual(saleFilters({ forma_pagamento: 'dinheiro' }).payments, ['dinheiro']);
});

test('formatação entrega snapshot, totais e itens no contrato legado', () => {
    const result = formatSale({ id: 123, cliente_id: 1, cliente_snapshot: { nome_completo: 'Ana', cpf: '1' },
        forma_pagamento: 'pix', total_bruto: '500', valor_costura: '0', desconto_valor: '50', total_final: '450',
        data_venda: '2026-11-01T14:30:00Z', itens_venda: [{ id: 1, produto_id: 10, produto_nome: 'Vestido', tipo: 'venda', quantidade: 1, preco_unitario: '500', subtotal: '500' }] });
    assert.equal(result.venda_id, 123);
    assert.equal(result.cliente_detalhes.nome_completo, 'Ana');
    assert.equal(result.valor_final, 450);
    assert.equal(result.itens[0].preco, 500);
});

test('POST retorna os totais da RPC e não confia no preço enviado', async () => {
    let received;
    const supabase = { rpc(name, payload) { received = { name, payload }; return Promise.resolve({ data: { venda_id: 7, total_bruto: 100, desconto_valor: 10, valor_costura: 5, total_final: 95 }, error: null }); },
        from() { throw new Error('não usado'); }, storage: { from() { throw new Error('não usado'); } } };
    const response = await request(createApp({ supabase, apiKey: 'k' })).post('/toa-toa-vendas').set('x-api-key', 'k')
        .send({ ...base, itens: [{ ...item, preco: 0.01 }], desconto_valor: 10, valor_costura: 5 }).expect(201);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.total_final, 95);
    assert.equal(received.name, 'registrar_venda_atomica');
    assert.equal('preco' in received.payload.p_itens[0], false);
});

test('GET detalhado exige chave e retorna venda completa', async () => {
    const sale = { id: 9, cliente_id: 1, cliente_snapshot: { nome_completo: 'Ana' }, forma_pagamento: 'pix', total_bruto: 10, total_final: 10, data_venda: '2026-11-01T00:00:00Z', itens_venda: [] };
    const builder = { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: sale, error: null }); } };
    const supabase = { from() { return builder; }, rpc() {}, storage: { from() {} } };
    const app = createApp({ supabase, apiKey: 'k' });
    await request(app).get('/toa-toa-vendas/9').expect(401);
    const response = await request(app).get('/toa-toa-vendas/9').set('x-api-key', 'k').expect(200);
    assert.equal(response.body.dados.venda_id, 9);
});

test('RPC cobre preço no banco, snapshot, estoque, desconto e atomicidade', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_registrar_venda_atomica.sql'), 'utf8');
    assert.match(sql, /p\.preco_unitario/);
    assert.match(sql, /p\.preco_pacote/);
    assert.match(sql, /to_jsonb\(v_cliente\)/);
    assert.match(sql, /ESTOQUE_INSUFICIENTE/);
    assert.match(sql, /DESCONTO_INVALIDO/);
    assert.match(sql, /PRODUTO_NAO_ENCONTRADO/);
    assert.match(sql, /CLIENTE_NAO_ENCONTRADO/);
    assert.match(sql, /for update/i);
    assert.match(sql, /begin;[\s\S]*commit;/i);
});
