# TOA-TOA API - Gestão de Estoque e Imagens 🚀

API híbrida (PHP + Node.js) integrada ao **Supabase DB** e **Supabase Storage**.

## 🛠️ Novidades da Versão
- **Integração com Storage:** Upload automático de fotos para o bucket `toa-toa-moda-festa`.
- **Processamento Binário:** Suporte a `multipart/form-data` para envio de arquivos reais via PHP (CURLFile) ou Formulários.
- **Ciclo CRUD Completo:** Rotas para Listar, Buscar, Salvar, Atualizar e Deletar com persistência de dados e arquivos (Produtos).
- **Gestão de Clientes:** Novo módulo CRUD para gerenciamento de clientes com suporte a múltiplos contatos via JSONB.
- **Gestão de Ativos:** Limpeza automática de arquivos físicos no Storage ao excluir ou substituir fotos de produtos.

## 🔗 Endpoints da API

### Produtos
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| **GET** | `/toa-toa-api-supabase` | Lista todos os produtos |
| **GET** | `/toa-toa-api-supabase/:id?` | Busca detalhes por ID (URL ou Query String) |
| **POST** | `/toa-toa-api-supabase` | Cadastra produto e faz upload da imagem |
| **PUT** | `/toa-toa-api-supabase/:id?` | Atualiza dados e substitui imagem se necessário |
| **DELETE** | `/toa-toa-api-supabase/:id?` | Remove o produto e apaga a foto do Storage |

### Clientes
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| **GET** | `/toa-toa-clientes` | Lista todos os clientes |
| **GET** | `/toa-toa-clientes/:id?` | Busca detalhes de um cliente |
| **POST** | `/toa-toa-clientes` | Cadastra novo cliente |
| **PUT** | `/toa-toa-clientes/:id?` | Atualiza dados do cliente |
| **DELETE** | `/toa-toa-clientes/:id?` | Remove o cliente do banco |

## 🔐 Segurança
Todas as requisições exigem o header:
`x-api-key: [VALOR_DA_CHAVE_MESTRA]`

A **Chave Mestra** é o segredo compartilhado entre o cliente (PHP/Frontend) e o servidor (Node.js). Ela garante que apenas requisições autorizadas manipulem o estoque.

## 📂 Estrutura de Storage
- **Bucket:** `toa-toa-moda-festa`
- **Nomenclatura:** `timestamp_vestido.ext` (evita conflitos de nomes).

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
