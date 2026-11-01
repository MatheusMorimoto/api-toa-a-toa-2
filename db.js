require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'toa-toa-moda-festa';
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 5 * 1024 * 1024);
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_COOKIE = 'toa_toa_session';
const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_SECONDS || 12 * 60 * 60);
const PRODUCT_FIELDS = {
    codProduto: 'cod',
    nomeProduto: 'nome',
    categoria: 'categoria',
    validade: 'validade',
    quantidade: 'quantidade',
    precoUnitario: 'preco_unitario',
    precoPacote: 'preco_pacote',
    descricao: 'descricao'
};
const CLIENT_FIELDS = [
    'nome_completo', 'cpf', 'rg', 'whatsapp', 'tipo_contato_1',
    'telefone_secundario', 'tipo_contato_2', 'email', 'cep',
    'endereco', 'data_evento', 'preferencias'
];

function apiError(status, mensagem, code = 'VALIDATION_ERROR') {
    const error = new Error(mensagem);
    error.status = status;
    error.code = code;
    return error;
}

function safeEqual(received, expected) {
    if (typeof received !== 'string' || typeof expected !== 'string') return false;
    const left = Buffer.from(received.trim());
    const right = Buffer.from(expected.trim());
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sessionToken(apiKey, now = Date.now()) {
    const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
    const payload = `${expiresAt}.${crypto.randomBytes(24).toString('base64url')}`;
    const signature = crypto.createHmac('sha256', apiKey).update(`toa-toa-admin-session-v2.${payload}`).digest('base64url');
    return `${payload}.${signature}`;
}

function validSessionToken(token, apiKey, now = Date.now()) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
    const expiresAt = Number(parts[0]);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', apiKey).update(`toa-toa-admin-session-v2.${payload}`).digest('base64url');
    return safeEqual(parts[2], expected);
}

function cookieValue(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
        const separator = cookie.indexOf('=');
        if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
        try {
            return decodeURIComponent(cookie.slice(separator + 1).trim());
        } catch {
            return '';
        }
    }
    return '';
}

function positiveId(value, field = 'ID') {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw apiError(400, `${field} inválido.`);
    return id;
}

function text(value, field, options = {}) {
    if (value === undefined) {
        if (options.required) throw apiError(422, `${field} é obrigatório.`);
        return undefined;
    }
    if (value === null && options.nullable) return null;
    if (typeof value !== 'string') throw apiError(422, `${field} deve ser texto.`);
    const normalized = value.trim();
    if (options.required && !normalized) throw apiError(422, `${field} é obrigatório.`);
    if (normalized.length > (options.max || 1000)) throw apiError(422, `${field} excede o limite permitido.`);
    return normalized || (options.nullable ? null : '');
}

function number(value, field, options = {}) {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw apiError(422, `${field} deve ser numérico.`);
    if (options.integer && !Number.isInteger(parsed)) throw apiError(422, `${field} deve ser inteiro.`);
    if (options.min !== undefined && parsed < options.min) throw apiError(422, `${field} não pode ser menor que ${options.min}.`);
    return parsed;
}

function date(value, field) {
    if (value === undefined || value === '') return value === '' ? null : undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw apiError(422, `${field} deve usar o formato AAAA-MM-DD.`);
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw apiError(422, `${field} inválida.`);
    }
    return value;
}

function validateProduct(body, partial = false) {
    const payload = {};
    for (const [input, column] of Object.entries(PRODUCT_FIELDS)) {
        if (partial && body[input] === undefined) continue;
        let value;
        if (input === 'nomeProduto') value = text(body[input], 'Nome do produto', { required: !partial, max: 200 });
        else if (input === 'codProduto') value = text(body[input], 'Código', { max: 100 });
        else if (input === 'categoria') value = text(body[input], 'Categoria', { max: 120 });
        else if (input === 'descricao') value = text(body[input], 'Descrição', { max: 5000 });
        else if (input === 'validade') value = date(body[input], 'Validade');
        else if (input === 'quantidade') value = number(body[input], 'Quantidade', { integer: true, min: 0 });
        else value = number(body[input], input === 'precoUnitario' ? 'Preço unitário' : 'Preço do pacote', { min: 0 });
        if (value !== undefined) payload[column] = value;
    }
    if (!partial && !payload.nome) throw apiError(422, 'Nome do produto é obrigatório.');
    return payload;
}

function validateClient(body, partial = false) {
    const payload = {};
    for (const field of CLIENT_FIELDS) {
        if (partial && body[field] === undefined) continue;
        let value;
        if (field === 'data_evento') value = date(body[field], 'Data do evento');
        else value = text(body[field], field, {
            required: !partial && ['nome_completo', 'cpf', 'whatsapp'].includes(field),
            nullable: !['nome_completo', 'cpf', 'whatsapp'].includes(field),
            max: ['endereco', 'preferencias'].includes(field) ? 2000 : 255
        });
        if (value !== undefined) payload[field] = value;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        throw apiError(422, 'E-mail inválido.');
    }
    if (!partial && (!payload.nome_completo || !payload.cpf || !payload.whatsapp)) {
        throw apiError(422, 'Nome completo, CPF e WhatsApp são obrigatórios.');
    }
    if (payload.cpf) {
        payload.cpf = payload.cpf.replace(/\D/g, '');
        const digit = (base, factor) => {
            let total = 0;
            for (const character of base) total += Number(character) * factor--;
            const remainder = (total * 10) % 11;
            return remainder === 10 ? 0 : remainder;
        };
        const base = payload.cpf.slice(0, 9);
        const valid = payload.cpf.length === 11
            && !/^(\d)\1{10}$/.test(payload.cpf)
            && digit(base, 10) === Number(payload.cpf[9])
            && digit(base + payload.cpf[9], 11) === Number(payload.cpf[10]);
        if (!valid) throw apiError(422, 'CPF inválido.');
    }
    return payload;
}

function validateSale(body) {
    const clienteId = positiveId(body.cliente_id, 'Cliente');
    if (!Array.isArray(body.itens) || body.itens.length === 0) {
        throw apiError(422, 'Adicione ao menos um item à venda.');
    }
    if (body.itens.length > 100) throw apiError(422, 'A venda excede o limite de 100 itens.');
    const itens = body.itens.map((item, index) => {
        if (!item || typeof item !== 'object') throw apiError(422, `Item ${index + 1} inválido.`);
        const tipo = text(item.tipo, `Tipo do item ${index + 1}`, { required: true, max: 20 });
        if (!['venda', 'aluguel'].includes(tipo)) throw apiError(422, `Tipo do item ${index + 1} inválido.`);
        return {
            produto_id: positiveId(item.produto_id, `Produto do item ${index + 1}`),
            tipo,
            quantidade: number(item.quantidade ?? 1, `Quantidade do item ${index + 1}`, { integer: true, min: 1 })
        };
    });
    const formaPagamento = text(body.forma_pagamento, 'Forma de pagamento', { required: true, max: 50 });
    const pagamentos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
    if (!pagamentos.includes(formaPagamento)) throw apiError(422, 'Forma de pagamento inválida.');
    const cartao = formaPagamento === 'cartao_debito' || formaPagamento === 'cartao_credito';
    const bandeira = text(body.bandeira_cartao, 'Bandeira do cartão', { nullable: true, max: 30 });
    const bandeiras = ['visa', 'mastercard', 'elo', 'american_express', 'hipercard', 'outra'];
    if (cartao && !bandeiras.includes(bandeira)) throw apiError(422, 'Uma bandeira de cartão válida é obrigatória.');
    if (!cartao && bandeira) throw apiError(422, 'Bandeira de cartão só pode ser informada para pagamentos com cartão.');
    const retirada = date(body.data_retirada, 'Data de retirada') ?? null;
    const devolucao = date(body.data_devolucao, 'Data de devolução') ?? null;
    if (itens.some((item) => item.tipo === 'aluguel') && (!retirada || !devolucao)) {
        throw apiError(422, 'Data de retirada e data de devolução são obrigatórias para aluguel.');
    }
    if (retirada && devolucao && devolucao < retirada) throw apiError(422, 'A devolução não pode ser anterior à retirada.');
    return {
        p_cliente_id: clienteId,
        p_forma_pagamento: formaPagamento,
        p_bandeira_cartao: cartao ? bandeira : null,
        p_valor_costura: number(body.valor_costura ?? 0, 'Valor da costura', { min: 0 }),
        p_desconto_valor: number(body.desconto_valor ?? 0, 'Desconto', { min: 0 }),
        p_data_retirada: retirada,
        p_data_devolucao: devolucao,
        p_observacoes: text(body.observacoes, 'Observações', { nullable: true, max: 5000 }),
        p_itens: itens
    };
}

function parseCsv(value, field, parser = (item) => item) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim()) throw apiError(422, `${field} inválido.`);
    const values = value.split(',').map((item) => parser(item.trim()));
    return [...new Set(values)];
}

function saleFilters(query) {
    const start = query.data_inicio === undefined ? undefined : date(query.data_inicio, 'Data inicial');
    const end = query.data_fim === undefined ? undefined : date(query.data_fim, 'Data final');
    if (start && end && end < start) throw apiError(422, 'A data final não pode ser anterior à data inicial.');
    const payments = parseCsv(query.forma_pagamento, 'Forma de pagamento');
    const allowed = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
    if (payments?.some((payment) => !allowed.includes(payment))) throw apiError(422, 'Forma de pagamento inválida.');
    return {
        start,
        endExclusive: end ? new Date(`${end}T00:00:00Z`).getTime() + 86_400_000 : undefined,
        payments,
        clienteId: query.cliente_id === undefined ? undefined : positiveId(query.cliente_id, 'Cliente'),
        ids: parseCsv(query.ids, 'IDs', (id) => positiveId(id, 'ID'))
    };
}

function formatSale(sale) {
    const snapshot = sale.cliente_snapshot || {};
    const items = sale.itens_venda || sale.itens || [];
    return {
        id: sale.id,
        venda_id: sale.id,
        cliente_id: sale.cliente_id,
        cliente_nome: snapshot.nome_completo ?? null,
        cliente_cpf: snapshot.cpf ?? null,
        cliente_snapshot: snapshot,
        cliente_detalhes: snapshot,
        forma_pagamento: sale.forma_pagamento,
        bandeira_cartao: sale.bandeira_cartao ?? null,
        subtotal: Number(sale.total_bruto),
        total_bruto: Number(sale.total_bruto),
        valor_costura: Number(sale.valor_costura || 0),
        desconto_valor: Number(sale.desconto_valor || 0),
        valor_final: Number(sale.total_final),
        total_final: Number(sale.total_final),
        data_retirada: sale.data_retirada ?? null,
        data_devolucao: sale.data_devolucao ?? null,
        observacoes: sale.observacoes || '',
        realizada_em: sale.data_venda,
        data_venda: sale.data_venda,
        itens: items.map((item) => ({
            id: item.id,
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            tipo: item.tipo,
            quantidade: item.quantidade,
            preco: Number(item.preco_unitario),
            preco_unitario: Number(item.preco_unitario),
            subtotal: Number(item.subtotal),
            data_retirada: item.data_retirada ?? null,
            data_devolucao: item.data_devolucao ?? null
        }))
    };
}

function detectImage(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { ext: 'jpg', mime: 'image/jpeg' };
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
    return null;
}

function storagePathFromUrl(url) {
    if (typeof url !== 'string' || url === 'placeholder.jpg') return null;
    try {
        const parsed = new URL(url);
        const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
        const index = parsed.pathname.indexOf(marker);
        if (!parsed.hostname.endsWith('.supabase.co') || index < 0) return null;
        const objectPath = decodeURIComponent(parsed.pathname.slice(index + marker.length));
        return objectPath.startsWith('produtos/') && !objectPath.includes('..') ? objectPath : null;
    } catch {
        return null;
    }
}

function mapDatabaseError(error) {
    if (error?.code === '23505') return apiError(409, 'Já existe um registro com os dados informados.', 'CONFLICT');
    if (error?.code === 'P0001') {
        const message = String(error.message || '');
        if (message.includes('ESTOQUE_INSUFICIENTE')) return apiError(409, 'Estoque insuficiente.', 'INSUFFICIENT_STOCK');
        if (message.includes('NAO_ENCONTRADO')) return apiError(404, 'Cliente ou produto não encontrado.', 'NOT_FOUND');
        return apiError(422, 'Não foi possível processar a venda.', 'SALE_REJECTED');
    }
    return error;
}

function normalizeProduct(product) {
    if (!product || typeof product !== 'object') return product;
    return {
        ...product,
        imagem: product.imagem || product.url_imagem_completa || product.path_original || 'placeholder.jpg',
        quantidade: product.quantidade ?? product.estoque ?? 0,
        preco_unitario: product.preco_unitario ?? product.valor_venda ?? 0,
        preco_pacote: product.preco_pacote ?? product.valor_aluguel ?? 0
    };
}

function createApp({ supabase, apiKey, allowedOrigins = [], isProduction = false } = {}) {
    if (!supabase) throw new Error('Cliente Supabase não informado.');
    if (!apiKey) throw new Error('CHAVE_MESTRA não configurada.');

    const app = express();
    const sessionCookie = isProduction ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https://*.supabase.co'],
                styleSrc: ["'self'"],
                scriptSrc: ["'self'"],
                baseUri: ["'none'"],
                frameAncestors: ["'none'"]
            }
        },
        referrerPolicy: { policy: 'no-referrer' }
    }));
    app.use(cors({
        origin(origin, callback) {
            if (!origin || (!isProduction && allowedOrigins.length === 0) || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(apiError(403, 'Origem não autorizada.'));
        }
    }));
    app.use(rateLimit({
        windowMs: 60_000,
        limit: 120,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({ status: 'erro', mensagem: 'Muitas requisições. Tente novamente em instantes.' })
    }));
    const authLimiter = rateLimit({
        windowMs: 15 * 60_000,
        limit: 20,
        skipSuccessfulRequests: true,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({ status: 'erro', mensagem: 'Muitas tentativas de autenticação.' })
    });
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: false, limit: '1mb' }));
    app.use(express.static(PUBLIC_DIR, { dotfiles: 'deny', index: false, fallthrough: true }));

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 20 },
        fileFilter(req, file, callback) {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
                return callback(apiError(422, 'Formato de imagem não permitido.'));
            }
            callback(null, true);
        }
    });

    const authenticate = (req, res, next) => {
        const validHeader = safeEqual(req.get('x-api-key'), apiKey);
        const validSession = validSessionToken(cookieValue(req, sessionCookie), apiKey);
        if (!validHeader && !validSession) {
            return res.status(401).json({ status: 'erro', mensagem: 'Acesso negado: chave API inválida.' });
        }
        if (!validHeader && validSession && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
            && req.get('x-csrf-protection') !== '1') {
            return res.status(403).json({ status: 'erro', mensagem: 'Proteção CSRF ausente.' });
        }
        if (validHeader) {
            res.cookie(sessionCookie, sessionToken(apiKey), {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict',
                maxAge: SESSION_MAX_AGE_SECONDS * 1000,
                path: '/'
            });
        }
        res.set('Cache-Control', 'no-store');
        next();
    };

    async function uploadImage(file) {
        const type = detectImage(file.buffer);
        if (!type) throw apiError(422, 'O arquivo enviado não é uma imagem JPEG, PNG ou WebP válida.');
        const objectPath = `produtos/${crypto.randomUUID()}.${type.ext}`;
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(objectPath, file.buffer, {
            cacheControl: '3600', upsert: false, contentType: type.mime
        });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath);
        return { url: data.publicUrl, objectPath };
    }

    async function removeImage(objectPath) {
        if (!objectPath) return;
        const { error } = await supabase.storage.from(BUCKET_NAME).remove([objectPath]);
        if (error) console.error('[storage] Falha ao remover imagem não referenciada.');
    }

    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
    app.get('/auth/status', authLimiter, authenticate, (req, res) => res.json({ status: 'sucesso', autenticado: true }));
    app.post('/auth/logout', (req, res) => {
        res.clearCookie(sessionCookie, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
        res.json({ status: 'sucesso' });
    });

    app.use(['/toa-toa-api-supabase', '/toa-toa-api-supabase/*', '/toa-toa-clientes', '/toa-toa-clientes/*', '/toa-toa-vendas', '/toa-toa-vendas/*'], authLimiter, authenticate);

    app.get('/toa-toa-api-supabase', async (req, res, next) => {
        try {
            const { data, error } = await supabase.from('v_produtos_detalhados').select('*');
            if (error) throw error;
            res.json({
                status: 'sucesso',
                projeto: 'toa-toa-api-supabase',
                origem: 'Supabase via Node.js',
                dados: (data || []).map(normalizeProduct)
            });
        } catch (error) { next(error); }
    });

    app.get('/toa-toa-api-supabase/:id', async (req, res, next) => {
        try {
            const id = positiveId(req.params.id);
            const { data, error } = await supabase.from('v_produtos_detalhados').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) throw apiError(404, 'Produto não encontrado.', 'NOT_FOUND');
            res.json({ status: 'sucesso', dados: normalizeProduct(data) });
        } catch (error) { next(error); }
    });

    app.post('/toa-toa-api-supabase', upload.single('imagem'), async (req, res, next) => {
        let uploaded;
        try {
            const payload = validateProduct(req.body);
            if (req.file) {
                uploaded = await uploadImage(req.file);
                payload.imagem = uploaded.url;
            } else {
                payload.imagem = 'placeholder.jpg';
            }
            const { data, error } = await supabase.from('produtos').insert([payload]).select();
            if (error) throw error;
            res.status(201).json({ status: 'sucesso', mensagem: 'Produto salvo com sucesso!', dados: data });
        } catch (error) {
            if (uploaded) await removeImage(uploaded.objectPath);
            next(mapDatabaseError(error));
        }
    });

    app.put('/toa-toa-api-supabase/:id', upload.single('imagem'), async (req, res, next) => {
        let uploaded;
        try {
            const id = positiveId(req.params.id);
            const { data: oldProduct, error: fetchError } = await supabase.from('produtos').select('id,imagem').eq('id', id).maybeSingle();
            if (fetchError) throw fetchError;
            if (!oldProduct) throw apiError(404, 'Produto não encontrado.', 'NOT_FOUND');
            const payload = validateProduct(req.body, true);
            if (req.file) {
                uploaded = await uploadImage(req.file);
                payload.imagem = uploaded.url;
            }
            if (Object.keys(payload).length === 0) throw apiError(422, 'Nenhum campo válido foi informado.');
            const { data, error } = await supabase.from('produtos').update(payload).eq('id', id).select();
            if (error) throw error;
            if (!data?.length) throw apiError(404, 'Produto não encontrado.', 'NOT_FOUND');
            if (uploaded) await removeImage(storagePathFromUrl(oldProduct.imagem));
            res.json({ status: 'sucesso', mensagem: 'Produto atualizado com sucesso!', dados: data });
        } catch (error) {
            if (uploaded) await removeImage(uploaded.objectPath);
            next(mapDatabaseError(error));
        }
    });

    app.delete('/toa-toa-api-supabase/:id', async (req, res, next) => {
        try {
            const id = positiveId(req.params.id);
            const { data: product, error: fetchError } = await supabase.from('produtos').select('id,imagem').eq('id', id).maybeSingle();
            if (fetchError) throw fetchError;
            if (!product) throw apiError(404, 'Produto não encontrado.', 'NOT_FOUND');
            const { data, error } = await supabase.from('produtos').delete().eq('id', id).select('id');
            if (error) throw error;
            if (!data?.length) throw apiError(404, 'Produto não encontrado.', 'NOT_FOUND');
            await removeImage(storagePathFromUrl(product.imagem));
            res.json({ status: 'sucesso', mensagem: 'Produto removido com sucesso!' });
        } catch (error) { next(mapDatabaseError(error)); }
    });

    app.get('/toa-toa-clientes', async (req, res, next) => {
        try {
            const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            res.json({ status: 'sucesso', dados: data });
        } catch (error) { next(error); }
    });

    app.get('/toa-toa-clientes/:id', async (req, res, next) => {
        try {
            const id = positiveId(req.params.id);
            const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) throw apiError(404, 'Cliente não encontrado.', 'NOT_FOUND');
            res.json({ status: 'sucesso', dados: data });
        } catch (error) { next(error); }
    });

    app.post('/toa-toa-clientes', async (req, res, next) => {
        try {
            const payload = validateClient(req.body);
            const { data, error } = await supabase.from('clientes').insert([payload]).select();
            if (error) throw error;
            res.status(201).json({ status: 'sucesso', mensagem: 'Cliente cadastrado com sucesso!', dados: data });
        } catch (error) { next(mapDatabaseError(error)); }
    });

    app.put('/toa-toa-clientes/:id', async (req, res, next) => {
        try {
            const id = positiveId(req.params.id);
            const payload = validateClient(req.body, true);
            if (Object.keys(payload).length === 0) throw apiError(422, 'Nenhum campo válido foi informado.');
            const { data, error } = await supabase.from('clientes').update(payload).eq('id', id).select();
            if (error) throw error;
            if (!data?.length) throw apiError(404, 'Cliente não encontrado.', 'NOT_FOUND');
            res.json({ status: 'sucesso', mensagem: 'Dados do cliente atualizados!', dados: data });
        } catch (error) { next(mapDatabaseError(error)); }
    });

    app.delete('/toa-toa-clientes/:id', async (req, res, next) => {
        try {
            const id = positiveId(req.params.id);
            const { data, error } = await supabase.from('clientes').delete().eq('id', id).select('id');
            if (error) throw error;
            if (!data?.length) throw apiError(404, 'Cliente não encontrado.', 'NOT_FOUND');
            res.json({ status: 'sucesso', mensagem: 'Cliente removido com sucesso!' });
        } catch (error) { next(mapDatabaseError(error)); }
    });

    app.post('/toa-toa-vendas', async (req, res, next) => {
        try {
            const payload = validateSale(req.body);
            const { data, error } = await supabase.rpc('registrar_venda_atomica', payload);
            if (error) throw error;
            res.status(201).json({ ok: true, ...data });
        } catch (error) { next(mapDatabaseError(error)); }
    });

    app.get('/toa-toa-vendas', async (req, res, next) => {
        try {
            const filters = saleFilters(req.query);
            let query = supabase.from('vendas').select('*,itens_venda(*)').order('data_venda', { ascending: false });
            if (filters.start) query = query.gte('data_venda', `${filters.start}T00:00:00.000Z`);
            if (filters.endExclusive) query = query.lt('data_venda', new Date(filters.endExclusive).toISOString());
            if (filters.payments) query = query.in('forma_pagamento', filters.payments);
            if (filters.clienteId) query = query.eq('cliente_id', filters.clienteId);
            if (filters.ids) query = query.in('id', filters.ids);
            const { data, error } = await query;
            if (error) throw error;
            res.json({ dados: (data || []).map(formatSale) });
        } catch (error) { next(error); }
    });

    app.get('/toa-toa-vendas/:id', async (req, res, next) => {
        try {
            const id = positiveId(req.params.id, 'Venda');
            const { data, error } = await supabase.from('vendas').select('*,itens_venda(*)').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) throw apiError(404, 'Venda não encontrada.', 'NOT_FOUND');
            res.json({ dados: formatSale(data) });
        } catch (error) { next(error); }
    });

    app.use((req, res) => res.status(404).json({ status: 'erro', mensagem: 'Rota não encontrada.' }));
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (error instanceof multer.MulterError) {
            const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
            return res.status(status).json({ status: 'erro', mensagem: status === 413 ? 'Imagem excede o tamanho permitido.' : 'Upload inválido.' });
        }
        const status = Number.isInteger(error.status) ? error.status : 500;
        if (status >= 500) console.error(`[api] ${error.code || 'INTERNAL_ERROR'}`);
        res.status(status).json({
            status: 'erro',
            mensagem: status >= 500 ? 'Erro interno do servidor.' : error.message,
            codigo: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR')
        });
    });
    return app;
}

function start() {
    const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'CHAVE_MESTRA'];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
        console.error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
        process.exit(1);
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
    const app = createApp({
        supabase,
        apiKey: process.env.CHAVE_MESTRA,
        allowedOrigins,
        isProduction: process.env.NODE_ENV === 'production'
    });
    const port = Number(process.env.PORT || 3000);
    app.listen(port, '0.0.0.0', () => console.log(`API TOA-TOA ativa na porta ${port}.`));
}

if (require.main === module) start();

module.exports = {
    createApp,
    validateProduct,
    validateClient,
    validateSale,
    detectImage,
    storagePathFromUrl,
    safeEqual,
    normalizeProduct,
    saleFilters,
    formatSale,
    sessionToken,
    validSessionToken
};
