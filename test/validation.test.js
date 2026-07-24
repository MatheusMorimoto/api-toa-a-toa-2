'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateProduct, validateClient, validateSale, detectImage,
    storagePathFromUrl, safeEqual
} = require('../db');

test('autenticação compara chaves sem aceitar prefixos ou valores ausentes', () => {
    assert.equal(safeEqual('segredo', 'segredo'), true);
    assert.equal(safeEqual('segredo-x', 'segredo'), false);
    assert.equal(safeEqual(undefined, 'segredo'), false);
});

test('produto preserva zero válido e rejeita números inválidos', () => {
    const product = validateProduct({ nomeProduto: 'Vestido', quantidade: '0', precoUnitario: '0' });
    assert.equal(product.quantidade, 0);
    assert.equal(product.preco_unitario, 0);
    assert.throws(() => validateProduct({ nomeProduto: 'Vestido', quantidade: 'texto' }), /numérico/);
    assert.throws(() => validateProduct({ nomeProduto: 'Vestido', quantidade: '-1' }), /menor/);
});

test('atualização parcial não apaga campos ausentes', () => {
    assert.deepEqual(validateProduct({ descricao: 'Nova' }, true), { descricao: 'Nova' });
    assert.deepEqual(validateClient({ email: 'cliente@example.com' }, true), { email: 'cliente@example.com' });
});

test('cliente valida CPF e e-mail', () => {
    const client = validateClient({
        nome_completo: 'Cliente',
        cpf: '529.982.247-25',
        whatsapp: '65999999999',
        email: 'cliente@example.com'
    });
    assert.equal(client.cpf, '52998224725');
    assert.throws(() => validateClient({ nome_completo: 'X', cpf: '111.111.111-11', whatsapp: '1' }), /CPF/);
    assert.throws(() => validateClient({ nome_completo: 'X', cpf: '52998224725', whatsapp: '1', email: 'x' }), /E-mail/);
    assert.throws(() => validateClient({}), /obrigatório/);
});

test('venda exige itens e valida preço/tipo', () => {
    assert.throws(() => validateSale({ cliente_id: 1, forma_pagamento: 'pix', itens: [] }), /ao menos um item/);
    assert.throws(() => validateSale({
        cliente_id: 1, forma_pagamento: 'pix',
        itens: [{ produto_id: 2, tipo: 'troca', preco: 10 }]
    }), /Tipo/);
    assert.throws(() => validateSale({
        cliente_id: 1, forma_pagamento: 'pix',
        itens: [{ produto_id: 2, tipo: 'venda', preco: -1 }]
    }), /menor/);
    assert.throws(() => validateSale({
        cliente_id: 1,
        itens: [{ produto_id: 2, tipo: 'venda', preco: 1 }]
    }), /Forma de pagamento/);
});

test('assinatura real do arquivo determina o tipo da imagem', () => {
    assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])).mime, 'image/jpeg');
    assert.equal(detectImage(Buffer.from('não é imagem')), null);
});

test('somente URLs do bucket e pasta esperados podem ser removidas', () => {
    const valid = 'https://projeto.supabase.co/storage/v1/object/public/toa-toa-moda-festa/produtos/foto.jpg';
    assert.equal(storagePathFromUrl(valid), 'produtos/foto.jpg');
    assert.equal(storagePathFromUrl('https://example.com/produtos/foto.jpg'), null);
    assert.equal(storagePathFromUrl('placeholder.jpg'), null);
});
