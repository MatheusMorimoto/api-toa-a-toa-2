require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() }); // Configura multer para memória

// Servir arquivos estáticos (CSS, Imagens, JS do frontend se houver)
app.use(express.static(path.join(__dirname, '.')));

// Validação básica de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CHAVE_MESTRA = process.env.CHAVE_MESTRA;

if (!SUPABASE_URL || !SUPABASE_KEY || !CHAVE_MESTRA) {
    console.error("❌ ERRO: Variáveis de ambiente (SUPABASE_URL, SUPABASE_KEY, CHAVE_MESTRA) não configuradas.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Nome do bucket configurado no painel do Supabase
const BUCKET_NAME = 'toa-toa-moda-festa';

/**
 * Função que recebe o arquivo do Multer (em memória) e joga para o Bucket
 */
async function uploadStorage(file) {
    // 1. Gera um nome único para evitar sobrescrever fotos com o mesmo nome
    const extensao = file.originalname.split('.').pop();
    const novoNomeArquivo = `${Date.now()}_vestido.${extensao}`;

    // 2. Faz o upload seguindo as configurações recomendadas
    const { data, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .upload(novoNomeArquivo, file.buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.mimetype // Mantido para garantir que o arquivo seja lido corretamente pelo navegador
        });

    if (error) {
        throw new Error('Erro ao subir para o Storage: ' + error.message);
    }

    // 3. Pega a URL pública
    const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(novoNomeArquivo);

    return publicUrlData.publicUrl;
}

/**
 * Lógica de exclusão automática
 */
async function deletarFotoStorage(urlCompleta) {
    const nomeArquivo = urlCompleta.split('/').pop();
    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([nomeArquivo]);

    if (error) {
        console.error('Aviso: Não foi possível deletar o arquivo físico:', error.message);
    }
}

// Rota para servir a tela de teste (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. Rota para Listar (GET)
app.get('/toa-toa-api-supabase', async (req, res) => {
    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        console.log("⚠️ Tentativa de acesso negada: Chave inválida ou ausente.");
        return res.status(401).json({
            status: "erro",
            mensagem: "Acesso negado: Chave API inválida."
        });
    }

    try {
        const { data, error } = await supabase.from('produtos').select('*');

        if (error) throw error;

        res.json({
            status: "sucesso",
            projeto: "toa-toa-api-supabase",
            origem: "Supabase via Node.js",
            dados: data
        });
    } catch (error) {
        console.error("❌ Erro no Supabase:", error.message);
        res.status(500).json({
            status: "erro",
            mensagem: "Erro ao buscar dados no banco de dados."
        });
    }
});

// 1.1 Rota para Buscar por ID (GET)
app.get('/toa-toa-api-supabase/:id?', async (req, res) => {
    const id = req.params.id || req.query.id;

    if (!id) {
        return res.status(400).json({
            status: "erro",
            mensagem: "ID do produto não informado."
        });
    }

    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({
            status: "erro",
            mensagem: "Acesso negado: Chave API inválida."
        });
    }

    try {
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .eq('id', id)
            .single(); // .single() garante que retorne apenas um objeto, não um array

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                status: "erro",
                mensagem: "Produto não encontrado."
            });
        }

        res.json({
            status: "sucesso",
            dados: data
        });
    } catch (error) {
        console.error("❌ Erro ao buscar produto:", error.message);
        res.status(500).json({ status: "erro", mensagem: "Erro ao buscar produto." });
    }
});

// 2. Rota para Salvar (POST)
app.post('/toa-toa-api-supabase', upload.single('imagem'), async (req, res) => {
    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        console.log("⚠️ Tentativa de POST negada: Chave inválida.");
        return res.status(401).json({
            status: "erro",
            mensagem: "Acesso negado: Chave API inválida."
        });
    }

    const {
        codProduto, nomeProduto, categoria,
        validade, quantidade, precoUnitario,
        precoPacote, descricao
    } = req.body;

    let urlImagem = req.body.imagem || 'placeholder.jpg';

    try {
        // 1. Envia para o Storage e pega a URL Pública se houver arquivo
        if (req.file) {
            urlImagem = await uploadStorage(req.file);
        }

        // 2. Salva no Banco de Dados (Supabase DB) usando a URL gerada
        const { data, error } = await supabase
            .from('produtos')
            .insert([
                {
                    nome: nomeProduto,
                    categoria: categoria,
                    validade: validade,
                    quantidade: parseInt(quantidade) || 0,
                    preco_unitario: parseFloat(precoUnitario) || 0.00,
                    preco_pacote: parseFloat(precoPacote) || 0.00,
                    descricao: descricao,
                    imagem: urlImagem
                }
            ])
            .select();

        if (error) throw error;

        res.json({
            status: "sucesso",
            mensagem: "Produto salvo com sucesso!",
            dados: data
        });
    } catch (error) {
        console.error("❌ Detalhes do Erro:", error);
        res.status(500).json({
            status: "erro",
            mensagem: "Erro no banco de dados",
            detalhe: error.message || error.details
        });
    }
});

// 2.1 Rota para Atualizar (PUT)
app.put('/toa-toa-api-supabase/:id?', upload.single('imagem'), async (req, res) => {
    const id = req.params.id || req.query.id || req.body.id;

    if (!id) {
        return res.status(400).json({
            status: "erro",
            mensagem: "ID do produto não informado para atualização."
        });
    }

    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ 
            status: "erro", 
            mensagem: "Acesso negado: Chave API inválida." 
        });
    }

    const {
        nomeProduto, categoria, validade,
        quantidade, precoUnitario, precoPacote, descricao
    } = req.body;

    try {
        // 1. Busca o produto atual para verificar a imagem antiga
        const { data: produtoAntigo } = await supabase
            .from('produtos')
            .select('imagem')
            .eq('id', id)
            .single();

        let urlImagem = req.body.imagem || (produtoAntigo ? produtoAntigo.imagem : 'placeholder.jpg');

        // 2. Se um novo arquivo foi enviado, faz upload e remove o antigo
        if (req.file) {
            // Remove a imagem antiga do storage se não for o placeholder
            if (produtoAntigo && produtoAntigo.imagem && produtoAntigo.imagem.includes('supabase.co')) {
                await deletarFotoStorage(produtoAntigo.imagem);
            }
            // Sobe a nova
            urlImagem = await uploadStorage(req.file);
        }

        // 3. Atualiza no banco de dados
        const { data, error } = await supabase
            .from('produtos')
            .update({
                nome: nomeProduto,
                categoria: categoria,
                validade: validade,
                quantidade: parseInt(quantidade) || 0,
                preco_unitario: parseFloat(precoUnitario) || 0.00,
                preco_pacote: parseFloat(precoPacote) || 0.00,
                descricao: descricao,
                imagem: urlImagem
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            status: "sucesso",
            mensagem: "Produto atualizado com sucesso!",
            dados: data
        });
    } catch (error) {
        console.error("❌ Erro ao atualizar:", error);
        res.status(500).json({
            status: "erro",
            mensagem: "Erro ao atualizar produto.",
            detalhe: error.message
        });
    }
});

// 3. Rota para Deletar (DELETE)
app.delete('/toa-toa-api-supabase/:id?', async (req, res) => {
    const id = req.params.id || req.query.id || req.body.id;

    if (!id) {
        return res.status(400).json({
            status: "erro",
            mensagem: "ID do produto não informado para exclusão."
        });
    }

    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ 
            status: "erro", 
            mensagem: "Acesso negado: Chave API inválida." 
        });
    }

    try {
        // 1. Busca o produto para pegar o link da imagem
        const { data: produto } = await supabase.from('produtos').select('imagem').eq('id', id).single();

        if (produto && produto.imagem && produto.imagem.includes('supabase.co')) {
            // 2. Utiliza a função de limpeza de disco para remover o arquivo físico
            await deletarFotoStorage(produto.imagem);
        }

        // 3. Deleta do banco
        const { error } = await supabase.from('produtos').delete().eq('id', id);
        if (error) throw error;

        res.json({ status: "sucesso", mensagem: "Produto e imagem removidos!" });
    } catch (error) {
        res.status(500).json({ status: "erro", detalhe: error.message });
    }
});


// --- ROTAS PARA CLIENTES (SQL BASE: COLUNAS INDIVIDUAIS) ---

// 1. Listar Clientes (GET)
app.get('/toa-toa-clientes', async (req, res) => {
    const chaveRecebida = req.headers['x-api-key'];
    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ status: "erro", mensagem: "Acesso negado: Chave API inválida." });
    }
    try {
        const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ status: "sucesso", dados: data });
    } catch (error) {
        console.error("❌ Erro Clientes:", error.message);
        res.status(500).json({ status: "erro", mensagem: "Erro ao buscar clientes." });
    }
});

// 2. Buscar Cliente por ID (GET)
app.get('/toa-toa-clientes/:id?', async (req, res) => {
    const id = req.params.id || req.query.id;
    if (!id) return res.status(400).json({ status: "erro", mensagem: "ID não informado." });
    
    const chaveRecebida = req.headers['x-api-key'];
    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ status: "erro", mensagem: "Acesso negado." });
    }

    try {
        const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
        if (error) throw error;
        res.json({ status: "sucesso", dados: data });
    } catch (error) {
        res.status(500).json({ status: "erro", mensagem: "Erro ao buscar cliente." });
    }
});

// 3. Salvar Cliente (POST)
app.post('/toa-toa-clientes', async (req, res) => {
    const chaveRecebida = req.headers['x-api-key'];
    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ status: "erro", mensagem: "Acesso negado." });
    }
    try {
        const { data, error } = await supabase.from('clientes').insert([req.body]).select();
        if (error) throw error;
        res.json({ status: "sucesso", mensagem: "Cliente cadastrado com sucesso!", dados: data });
    } catch (error) {
        res.status(500).json({ status: "erro", mensagem: "Erro ao salvar cliente.", detalhe: error.message });
    }
});

// 4. Atualizar Cliente (PUT)
app.put('/toa-toa-clientes/:id?', async (req, res) => {
    const id = req.params.id || req.query.id || req.body.id;
    if (!id) return res.status(400).json({ status: "erro", mensagem: "ID não informado." });
    const chaveRecebida = req.headers['x-api-key'];
    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ status: "erro", mensagem: "Acesso negado." });
    }
    try {
        const { data, error } = await supabase.from('clientes').update(req.body).eq('id', id).select();
        if (error) throw error;
        res.json({ status: "sucesso", mensagem: "Dados do cliente atualizados!", dados: data });
    } catch (error) {
        res.status(500).json({ status: "erro", mensagem: "Erro ao atualizar cliente.", detalhe: error.message });
    }
});

// 5. Deletar Cliente (DELETE)
app.delete('/toa-toa-clientes/:id?', async (req, res) => {
    const id = req.params.id || req.query.id || req.body.id;
    if (!id) return res.status(400).json({ status: "erro", mensagem: "ID não informado." });
    const chaveRecebida = req.headers['x-api-key'];
    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ status: "erro", mensagem: "Acesso negado." });
    }
    try {
        const { error } = await supabase.from('clientes').delete().eq('id', id);
        if (error) throw error;
        res.json({ status: "sucesso", mensagem: "Cliente removido com sucesso!" });
    } catch (error) {
        res.status(500).json({ status: "erro", detalhe: error.message });
    }
});

// Inicialização para Render (0.0.0.0 é essencial)
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 API TOA-TOA Online na porta ${port}`);
    console.log(`🔗 URL de produção: https://api-toa-a-toa-2.onrender.com`);
});