# TOA-TOA API - Gestão de Estoque e Imagens 🚀

API híbrida (PHP + Node.js) integrada ao **Supabase DB** e **Supabase Storage**.

## 🔗 URL de Produção
A API está ativa em: [https://api-toa-a-toa-2.onrender.com](https://api-toa-a-toa-2.onrender.com)

**Supabase Host:** `https://idxyfkeodaettqbjuiak.supabase.co`

## 🛠️ Novidades da Versão
- **Integração com Storage:** Upload automático de fotos para o bucket `toa-toa-moda-festa`.
- **Processamento Binário:** Suporte a `multipart/form-data` para envio de arquivos reais via PHP (CURLFile) ou Formulários.
- **Ciclo CRUD Completo:** Rotas para Listar, Buscar, Salvar, Atualizar e Deletar com persistência de dados e arquivos (Produtos).
- **Gestão de Clientes:** Novo módulo CRUD para gerenciamento de clientes com suporte a múltiplos contatos via JSONB.
- **Módulo de Vendas:** Registro de vendas complexas com múltiplos itens e baixa automática de estoque.
- **Gestão de Ativos:** Limpeza automática de arquivos físicos no Storage ao excluir ou substituir fotos de produtos.

## 🖥️ Painel Administrativo (index.html)
O projeto conta com uma interface de gestão integrada acessível na raiz (`/`).

- **Gestão Unificada:** Controle de Produtos e Clientes em uma única página.
- **Guia Técnico Local:** Manual de operações HTTP embutido no final da interface.
- **Comunicação Segura:** Chave API configurada internamente para facilitar o uso administrativo.
  > **Atenção:** A chave API está embutida no `index.html` para conveniência administrativa. Em um ambiente de produção, considere injetá-la de forma mais segura (ex: via variáveis de ambiente do servidor web ou autenticação de usuário).

## ⚙️ Estrutura do Projeto
- **`db.js`**: Arquivo principal da API Node.js, contendo toda a lógica de CRUD e integração com Supabase DB/Storage. É o ponto de entrada (`npm start`).
- **`app.js`**: (Opcional/Exemplo) Uma versão simplificada da API, atualmente não utilizada como ponto de entrada principal.
- **`index.html`**: Painel administrativo frontend para gerenciar produtos e clientes.
- **`salvar_produto.php`**: Script PHP que atua como proxy para o envio de `multipart/form-data` para a API Node.js.
- **`.env`**: Arquivo para configuração de variáveis de ambiente sensíveis.

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

### Vendas
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| **POST** | `/toa-toa-vendas` | Registra venda, salva itens e abate estoque de produtos vendidos |

## 🔐 Segurança
Todas as requisições exigem o header:
`x-api-key: [VALOR_DA_CHAVE_MESTRA]`

A **Chave Mestra** é o segredo compartilhado entre o cliente (PHP/Frontend) e o servidor (Node.js). Ela garante que apenas requisições autorizadas manipulem o estoque.

## 📂 Estrutura de Storage
- **Bucket:** `toa-toa-moda-festa`

| Característica           | Detalhe                                                              |
| :----------------------- | :------------------------------------------------------------------- |
| **Bucket**               | `toa-toa-moda-festa`                                                 |
| **Nomenclatura**         | `timestamp_vestido.ext` (evita conflitos de nomes)                   |
| **Pasta de Destino**     | `produtos/`                                                          |
| **Caminho Completo**     | `produtos/timestamp_vestido.ext`                                     |
| **Configurações Upload** | `cacheControl: '3600'`, `upsert: false`                              |
| **Endpoint S3 (API)**    | `https://idxyfkeodaettqbjuiak.storage.supabase.co/storage/v1/s3`     |
| **Região Física**        | `sa-east-1` (São Paulo)                                              |

## 🚀 Comandos Úteis de Manutenção

```bash
# Instalar novas dependências
npm install

# Iniciar servidor local
npm start

# Atualizar repositório com segurança
git add .
git commit -m "Update: Implementação de Vendas e Baixa de Estoque"
git push origin main
```
## ⚙️ Configuração do Ambiente (.env)
Atualize as variáveis de ambiente no seu painel do Render ou arquivo `.env` local com os novos dados:

```ini
SUPABASE_URL=https://idxyfkeodaettqbjuiak.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkeHlma2VvZGFldHRxYmp1aWFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYyNTE5MCwiZXhwIjoyMDk0MjAxMTkwfQ.NHpC4HgxdbxUMYUJSu10rPKdss4jHZZa3IK_ojjFBIM
# Chave Pública (para referência se necessário)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkeHlma2VvZGFldHRxYmp1aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjUxOTAsImV4cCI6MjA5NDIwMTE5MH0.okEGTUsCvLfB4CCb3p_apul0QcI_VPwhuSYO-uxU1_k
CHAVE_MESTRA=sua_chave_de_comunicacao_php_node
```

> **Nota Técnica:** A `SUPABASE_KEY` configurada é a **Service Role Key**, garantindo que a API tenha permissão total para gerenciar fotos no Storage.

---
**URL de Produção:** `https://api-toa-a-toa-2.onrender.com`
**Endpoint Local:** http://festa:3000/toa-toa-api-supabase
