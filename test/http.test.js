'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../db');

function stubSupabase() {
    return {
        from() { throw new Error('Banco não deve ser acessado neste teste.'); },
        rpc() { throw new Error('RPC não deve ser acessada neste teste.'); },
        storage: { from() { throw new Error('Storage não deve ser acessado neste teste.'); } }
    };
}

function app() {
    return createApp({ supabase: stubSupabase(), apiKey: 'chave-teste', allowedOrigins: [], isProduction: false });
}

test('health check não depende do Supabase', async () => {
    const response = await request(app()).get('/health').expect(200);
    assert.equal(response.body.status, 'ok');
});

test('endpoint protegido rejeita chave ausente', async () => {
    const response = await request(app()).get('/toa-toa-api-supabase').expect(401);
    assert.match(response.body.mensagem, /Acesso negado/);
});

test('arquivos privados não são publicados', async () => {
    await request(app()).get('/.env').expect(404);
    await request(app()).get('/README.md').expect(404);
    await request(app()).get('/db.js').expect(404);
    await request(app()).get('/package.json').expect(404);
    await request(app()).get('/salvar_produto.php').expect(404);
});

test('venda vazia retorna 422 sem chamar RPC', async () => {
    const response = await request(app())
        .post('/toa-toa-vendas')
        .set('x-api-key', 'chave-teste')
        .send({ cliente_id: 1, forma_pagamento: 'pix', itens: [] })
        .expect(422);
    assert.match(response.body.mensagem, /ao menos um item/);
});

test('upload com MIME proibido retorna 422 sem acessar Storage', async () => {
    const response = await request(app())
        .post('/toa-toa-api-supabase')
        .set('x-api-key', 'chave-teste')
        .field('nomeProduto', 'Produto')
        .attach('imagem', Buffer.from('script'), { filename: 'arquivo.svg', contentType: 'image/svg+xml' })
        .expect(422);
    assert.match(response.body.mensagem, /não permitido/);
});

test('upload acima do limite retorna 413', async () => {
    const previous = process.env.MAX_IMAGE_BYTES;
    // O limite é lido ao carregar o módulo; o teste usa o limite padrão de 5 MiB.
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
    await request(app())
        .post('/toa-toa-api-supabase')
        .set('x-api-key', 'chave-teste')
        .field('nomeProduto', 'Produto')
        .attach('imagem', oversized, { filename: 'grande.jpg', contentType: 'image/jpeg' })
        .expect(413);
    if (previous === undefined) delete process.env.MAX_IMAGE_BYTES;
});
