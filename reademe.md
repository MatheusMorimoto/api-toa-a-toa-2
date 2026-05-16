# TOA-TOA API - Gestão de Estoque e Imagens 🚀

API híbrida (PHP + Node.js) integrada ao **Supabase DB** e **Supabase Storage**.

## 🛠️ Novidades da Versão
- **Integração com Storage:** Upload automático de fotos para o bucket `produtos`.
- **Processamento Binário:** Migração de JSON para `multipart/form-data` no envio PHP -> Node.js.
- **Ciclo CRUD Completo:** Implementação de rotas para Listar, Buscar por ID, Salvar (com foto) e Deletar (com limpeza de Storage).

## 🔗 Endpoints da API

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| **GET** | `/toa-toa-api-supabase` | Lista todos os produtos |
| **GET** | `/toa-toa-api-supabase/:id` | Busca detalhes de um produto específico |
| **POST** | `/toa-toa-api-supabase` | Cadastra produto e faz upload da imagem |
| **DELETE** | `/toa-toa-api-supabase/:id` | Remove o produto e apaga a foto do Storage |

## 🔐 Segurança
Todas as requisições exigem o header:
`x-api-key: [SUA_CHAVE_MESTRA]`

## 📂 Estrutura de Storage
- **Bucket:** `produtos`
- **Pasta:** `produtos/`
- **Nomenclatura:** `timestamp-nomeoriginal.ext` (para evitar duplicidade).

## 🚀 Comandos Úteis de Manutenção

```bash
# Instalar novas dependências
npm install

# Iniciar servidor local
npm start

# Atualizar repositório com segurança
git add .
git commit -m "Update: Implementação de Storage e CRUD completo"
git push origin main
```
## ⚙️ Configuração do Ambiente (.env)
Atualize as variáveis de ambiente no seu painel do Render ou arquivo `.env` local com os novos dados:

```ini
SUPABASE_URL=https://idxyfkeodaettqbjuiak.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkeHlma2VvZGFldHRxYmp1aWFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYyNTE5MCwiZXhwIjoyMDk0MjAxMTkwfQ.NHpC4HgxdbxUMYUJSu10rPKdss4jHZZa3IK_ojjFBIM
CHAVE_MESTRA=sua_chave_de_comunicacao_php_node
```

> **Nota Técnica:** A `SUPABASE_KEY` configurada é a **Service Role Key**, garantindo que a API tenha permissão total para gerenciar fotos no Storage.

---
**URL de Produção:** `https://api-toa-a-toa-2.onrender.com`
**Endpoint Local:** http://festa:3000/toa-toa-api-supabase
