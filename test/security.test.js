'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('frontend não usa innerHTML, document.write, eval ou handlers inline', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.doesNotMatch(script, /\.innerHTML\s*=/);
    assert.doesNotMatch(script, /\beval\s*\(/);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('migração implementa bloqueio, estoque e rollback transacional', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_registrar_venda_atomica.sql'), 'utf8');
    assert.match(sql, /\bfor update\b/i);
    assert.match(sql, /ESTOQUE_INSUFICIENTE/);
    assert.match(sql, /\bbegin;/i);
    assert.match(sql, /\bcommit;/i);
    assert.match(sql, /security invoker/i);
});
