# Passo a passo: configurar o backend no Railway

Este guia é para quem vai configurar o **backend** do projeto wps-flowa no **Railway**. O banco de dados continua no **Supabase**; apenas a API Node.js roda no Railway.

---

## Pré-requisitos

- Conta no [Railway](https://railway.app) (login com GitHub).
- Acesso ao repositório do projeto (GitHub).
- As **variáveis de ambiente** do banco (Supabase): `DATABASE_URL` e `DIRECT_URL`. Quem tem o projeto já deve ter isso no `.env` do backend.

---

## 1. Criar o projeto no Railway

1. Acesse **https://railway.app** e faça login (com GitHub).
2. Clique em **"New Project"**.
3. Escolha **"Deploy from GitHub repo"**.
4. Selecione o repositório **wps-flowa** (ou o nome correto do repo). Autorize o Railway a acessar a organização/repositório se pedir.
5. Depois que o projeto for criado, clique no **serviço** (o retângulo que representa o app) para abrir as configurações.

---

## 2. Pasta do backend (quando não há "Root Directory")

O backend está na pasta **`backend`** do repositório. Em algumas contas o Railway só mostra **"Source Repo"** (caminho do repositório), **sem** campo "Root Directory".

**Solução:** deixar o repositório na raiz e colocar **`cd backend &&`** no início dos comandos de build e de start. Assim o Railway usa a raiz do repo, mas os comandos rodam dentro da pasta `backend`.

- Não é necessário procurar Root Directory.
- Nos passos 3 e 4 abaixo, use exatamente os comandos que começam com **`cd backend &&`**.

---

## 3. Comando de build

1. Em **Settings** → **Build**, no campo **"Build Command"**, use **um** dos dois:

   **Se você conseguiu definir Root Directory = `backend`:**
   ```bash
   npm install && npx prisma generate && npm run build
   ```

   **Se só aparece "Source Repo" (sem Root Directory), use:**
   ```bash
   cd backend && npm install && npx prisma generate && npm run build
   ```

---

## 4. Comando de start

1. Em **Settings** → **Deploy** (ou **Start**), no campo **"Start Command"**, use **um** dos dois:

   **Se você definiu Root Directory = `backend`:**
   ```bash
   npx prisma migrate deploy && npm start
   ```

   **Se só aparece "Source Repo" (sem Root Directory), use:**
   ```bash
   cd backend && npx prisma migrate deploy && npm start
   ```

   Assim as migrations do Prisma rodam em todo deploy e o banco no Supabase fica atualizado.

---

## 5. Variáveis de ambiente

Na aba **"Variables"** do serviço, adicione **todas** as variáveis abaixo. Use o **"+ New Variable"** ou **"Raw Editor"** para colar várias de uma vez.

| Variável       | Obrigatória | Exemplo / descrição |
|----------------|-------------|----------------------|
| `DATABASE_URL` | Sim         | URL do Supabase (pooler, porta **6543**). Ex.: `postgresql://postgres:SENHA@db.xxx.supabase.co:6543/postgres?sslmode=require` |
| `DIRECT_URL`   | Sim         | URL direta do Supabase (porta **5432**). Ex.: `postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres?sslmode=require` |
| `JWT_SECRET`   | Sim         | Uma string longa e aleatória **só para produção**. Ex.: gere com `openssl rand -base64 32` ou use um gerador online. **Não** use `dev-secret-mude-em-producao`. |
| `CORS_ORIGIN`  | Sim         | URL do frontend. Quando o front estiver no Firebase: `https://wps-flowa.web.app` (ou a URL que o Firebase mostrar). Para aceitar mais de uma origem, separe por vírgula: `https://wps-flowa.web.app,http://localhost:3000` |

**Não** é necessário definir `PORT`: o Railway define automaticamente.

### Onde pegar DATABASE_URL e DIRECT_URL

- Quem já tem o projeto: estão no arquivo **`backend/.env`** (não commitar esse arquivo).
- Supabase: **Project Settings** → **Database** → **Connection string** (URI). Use a senha do banco; para pooler use a porta **6543**, para conexão direta use **5432**.

---

## 6. (Opcional) Comando de release (migrations)

Se **não** tiver usado `npx prisma migrate deploy` no Start Command:

1. Em **Settings**, procure **"Release Command"** (ou similar).
2. Defina:
   ```bash
   npx prisma migrate deploy
   ```
   Assim as migrations rodam antes do start em cada deploy.

Se já tiver colocado `prisma migrate deploy` no Start Command, pode deixar o Release Command em branco.

---

## 7. Fazer o deploy

1. Salve todas as configurações.
2. Clique em **"Deploy"** (ou faça um novo commit no repositório; o Railway pode estar configurado para deploy automático).
3. Acompanhe os **logs** (aba "Deployments" ou "Logs"). O build deve rodar `npm install`, `prisma generate`, `npm run build` e depois o start.

---

## 8. Obter a URL do backend

1. Depois do deploy concluído, vá em **"Settings"** do serviço.
2. Em **"Networking"** ou **"Public Networking"**, ative **"Generate Domain"** (ou "Public URL").
3. Copie a URL gerada (ex.: `https://wps-flowa-api-production-xxxx.up.railway.app`).

Essa URL é a **base da API**. O frontend deve usar ela em:

- **Variável no build do front:** `NEXT_PUBLIC_API_URL=https://SUA-URL-RAILWAY`

Exemplo: se a URL do Railway for `https://wps-flowa-api.up.railway.app`, no build do frontend use:

```bash
NEXT_PUBLIC_API_URL=https://wps-flowa-api.up.railway.app
```

---

## 9. Conferir se está funcionando

1. No navegador ou Postman: **`https://SUA-URL-RAILWAY/health`** (se o backend tiver rota `/health`).
2. Ou: **`https://SUA-URL-RAILWAY/api/...`** (alguma rota que não exija login).

Se aparecer erro de CORS ao abrir o front no Firebase, confira se `CORS_ORIGIN` no Railway está exatamente com a URL do front (ex.: `https://wps-flowa.web.app`), sem barra no final.

---

## Resumo rápido

| Onde       | O que fazer |
|-----------|-------------|
| Railway   | New Project → Deploy from GitHub → repo wps-flowa |
| Settings  | Se houver Root Directory: **`backend`**. Se só tiver "Source Repo", pule esta etapa. |
| Build     | Com Root Directory: `npm install && npx prisma generate && npm run build` — Sem Root Directory: `cd backend && npm install && npx prisma generate && npm run build` |
| Start     | Com Root Directory: `npx prisma migrate deploy && npm start` — Sem Root Directory: `cd backend && npx prisma migrate deploy && npm start` |
| Variables | `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CORS_ORIGIN` |
| Networking| Gerar domínio público e copiar a URL para o frontend |

Depois disso, quem for configurar o **frontend** no Firebase deve usar essa URL do Railway em **`NEXT_PUBLIC_API_URL`** no build e colocar a URL do front no **`CORS_ORIGIN`** do backend (já descrito acima).
