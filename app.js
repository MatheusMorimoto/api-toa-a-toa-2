require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve arquivos estáticos da pasta raiz (permite carregar o index.html e outros assets)
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

// Rota para servir a tela de teste (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. Rota para Listar (GET)
app.get('/toa-toa-api-supabase', async (req, res) => {
    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida !== CHAVE_MESTRA) {
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

// 2. Rota para Salvar (POST)
app.post('/toa-toa-api-supabase', async (req, res) => {
    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida !== CHAVE_MESTRA) {
        console.log("⚠️ Tentativa de POST negada: Chave inválida.");
        return res.status(401).json({
            status: "erro",
            mensagem: "Acesso negado: Chave API inválida."
        });
    }

    const {
        codProduto, nomeProduto, categoria,
        validade, quantidade, precoUnitario,
        precoPacote, descricao, imagem
    } = req.body;

    try {
        const { data, error } = await supabase
            .from('produtos')
            .insert([
                {
                    cod: codProduto,
                    nome: nomeProduto,
                    categoria: categoria,
                    validade: validade,
                    quantidade: parseInt(quantidade) || 0,
                    preco_unitario: parseFloat(precoUnitario) || 0.00,
                    preco_pacote: parseFloat(precoPacote) || 0.00,
                    descricao: descricao,
                    imagem: imagem
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

// Inicialização para Render (0.0.0.0 é essencial)
app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Servidor TOA-TOA ativo na porta ${port}`);
    console.log(`🏠 Interface: http://0.0.0.0:${port}`);
});