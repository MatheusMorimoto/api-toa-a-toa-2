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
app.get('/toa-toa-api-supabase/:id', async (req, res) => {
    const { id } = req.params;
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
        // Lógica de Upload para o Storage
        if (req.file) {
            const fileExt = path.extname(req.file.originalname);
            const fileName = `${Date.now()}${fileExt}`;
            const filePath = `produtos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('produtos')
                .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('produtos').getPublicUrl(filePath);
            urlImagem = publicUrlData.publicUrl;
        }

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

// 3. Rota para Deletar (DELETE)
app.delete('/toa-toa-api-supabase/:id', async (req, res) => {
    const { id } = req.params;
    const chaveRecebida = req.headers['x-api-key'];

    if (!chaveRecebida || chaveRecebida.trim() !== CHAVE_MESTRA.trim()) {
        return res.status(401).json({ status: "erro", mensagem: "Acesso negado." });
    }

    try {
        // 1. Busca o produto para pegar o link da imagem
        const { data: produto } = await supabase.from('produtos').select('imagem').eq('id', id).single();

        if (produto && produto.imagem && produto.imagem.includes('supabase.co')) {
            // 2. Extrai o nome do arquivo da URL para deletar do Storage
            const nomeArquivo = produto.imagem.split('/').pop();
            await supabase.storage.from('produtos').remove([`produtos/${nomeArquivo}`]);
        }

        // 3. Deleta do banco
        const { error } = await supabase.from('produtos').delete().eq('id', id);
        if (error) throw error;

        res.json({ status: "sucesso", mensagem: "Produto e imagem removidos!" });
    } catch (error) {
        res.status(500).json({ status: "erro", detalhe: error.message });
    }
});

// Inicialização para Render (0.0.0.0 é essencial)
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 API TOA-TOA Online na porta ${port}`);
    console.log(`🔗 URL de produção: https://api-toa-a-toa-2.onrender.com`);
});