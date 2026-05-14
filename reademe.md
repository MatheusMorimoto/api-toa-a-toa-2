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

---
**URL de Produção:** `https://api-toa-a-toa-2.onrender.com`
