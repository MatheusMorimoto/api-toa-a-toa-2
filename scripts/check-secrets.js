'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const ignored = new Set(['package-lock.json', '.env.example', 'scripts/check-secrets.js']);
const patterns = [
    /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/,
    /gh[opusr]_[A-Za-z0-9]{30,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/
];

const findings = [];
for (const file of files) {
    if (ignored.has(file)) continue;
    const absolute = path.resolve(file);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000) continue;
    const content = fs.readFileSync(absolute, 'utf8');
    if (patterns.some((pattern) => pattern.test(content))) findings.push(file);
}

if (findings.length) {
    console.error(`Possível segredo encontrado em: ${findings.join(', ')}`);
    process.exit(1);
}
console.log('Nenhum padrão de segredo encontrado nos arquivos versionados.');
