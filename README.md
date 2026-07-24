# TOA-TOA API

API Node.js e painel administrativo para produtos, clientes e vendas da Tôa Tôa Moda Festa, integrados ao Supabase.

## Segurança

As credenciais ficam exclusivamente em variáveis de ambiente. Nunca coloque uma chave `service_role` no frontend, no README ou no Git. Uma chave administrativa esteve anteriormente versionada neste repositório e deve ser **revogada e rotacionada manualmente no Supabase antes de um novo deploy**.

Somente a pasta `public/` é servida por HTTP. O código-fonte, `.env`, documentação, dependências e arquivos legados não são públicos. Depois do primeiro acesso correto, o painel cria uma sessão persistente em cookie `HttpOnly`; a chave não é gravada no JavaScript nem no armazenamento da página.

## Funcionalidades preservadas

- CRUD de produtos, incluindo código, categoria, validade, estoque, preços, descrição e foto.
- CRUD de clientes com contatos, documentos, endereço, data de evento e preferências.
- Registro transacional de vendas com múltiplos itens.
- Baixa de estoque somente para itens do tipo `venda`.
- Upload de JPEG, PNG e WebP no bucket configurado.
- Limpeza segura das imagens substituídas ou de produtos removidos.

## Requisitos e instalação

- Node.js 20 ou superior.
- Tabelas Supabase `produtos`, `clientes`, `vendas` e `itens_venda`.
- View `v_produtos_detalhados`.
- Bucket público configurado para fotos.

```bash
cp .env.example .env
npm ci
npm run check
npm run lint
npm test
npm start
```

Configure o `.env` local sem versioná-lo, seguindo `.env.example`. Em produção, `CORS_ORIGINS` deve conter as origens autorizadas separadas por vírgula e não pode ficar vazio.

## Endpoints

Todas as rotas administrativas exigem `x-api-key`.

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/health` | Health check sem acessar o banco |
| GET | `/` | Painel administrativo |
| GET/POST | `/toa-toa-api-supabase` | Listar/criar produtos |
| GET/PUT/DELETE | `/toa-toa-api-supabase/:id` | Consultar/alterar/excluir produto |
| GET/POST | `/toa-toa-clientes` | Listar/criar clientes |
| GET/PUT/DELETE | `/toa-toa-clientes/:id` | Consultar/alterar/excluir cliente |
| POST | `/toa-toa-vendas` | Registrar venda atômica |

Produtos usam `multipart/form-data`, com arquivo no campo `imagem`. Clientes e vendas usam JSON.

## Migração transacional de vendas

O arquivo `migrations/001_registrar_venda_atomica.sql` cria a RPC `registrar_venda_atomica`. Ela valida registros, bloqueia produtos, impede estoque negativo e executa venda, itens e baixa de estoque na mesma transação.

Ela **não é executada automaticamente**. Antes de aplicá-la:

1. Revise nomes e tipos das colunas contra o schema real.
2. Faça backup lógico do banco.
3. Aplique e teste em homologação.
4. Só então aplique manualmente em produção.

Rollback da função, sem excluir dados:

```sql
drop function if exists public.registrar_venda_atomica(
  bigint, text, numeric, numeric, text, jsonb
);
```

## Upload e preservação de imagens

- O conteúdo real do arquivo é verificado e o tamanho padrão máximo é 5 MiB.
- Nomes são gerados com UUID.
- Na edição, a imagem antiga só é removida após o update.
- Se o update falhar, a imagem nova é removida.
- Na exclusão, primeiro o registro é removido e depois a imagem.
- URLs externas, caminhos fora de `produtos/` e `placeholder.jpg` não são removidos.

## Testes

```bash
npm run check
npm run lint
npm test
npm audit
```

Os testes usam stubs e não acessam o Supabase. Nunca forneça credenciais de produção aos testes.

## Deploy e rollback no Render

O `render.yaml` usa `npm ci`, Node 20 e `/health`. Cadastre manualmente `SUPABASE_URL`, `SUPABASE_KEY`, `CHAVE_MESTRA` e `CORS_ORIGINS`.

Sequência segura:

1. Rotacione a chave administrativa anteriormente exposta.
2. Faça backup lógico.
3. Aplique e valide a RPC em homologação.
4. Faça deploy e verifique health, autenticação, CRUD e uma venda controlada.

Para rollback, restaure a versão anterior do serviço. Não remova a RPC enquanto alguma instância depender dela. O rollback da aplicação não desfaz vendas confirmadas.

## PHP legado e Git

`salvar_produto.php` é apenas referência de compatibilidade e não faz parte do runtime Node. Ele não é servido publicamente.

`.env` e `node_modules/` devem permanecer locais. Removê-los do índice atual não limpa commits antigos. Reescrever o histórico exige planejamento e autorização explícita.
