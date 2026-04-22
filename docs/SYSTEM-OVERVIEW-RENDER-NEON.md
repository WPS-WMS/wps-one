## (Legado) Visão geral do sistema FLOWA

> Este documento foi substituído por arquivos separados em `docs/`:
> - `docs/01-ARQUITETURA-DO-SISTEMA.md`
> - `docs/02-BANCO-DE-DADOS.md`
> - `docs/03-PRATICAS-DE-PROGRAMACAO.md`
> - `docs/04-ANALISE-E-ROADMAP.md`

Este documento descreve **como o sistema está funcionando hoje** após a migração para **Render + Neon**, incluindo tecnologias usadas, arquitetura, deploy e operações básicas (migrar banco, criar usuário admin, etc.).

---

### 1. Arquitetura geral

- **Frontend**
  - Framework: **Next.js (React + TypeScript)**
  - Pasta: `frontend/`
  - Deploy: **Firebase Hosting** (projeto Firebase: **`wps-one-frontend`**)
  - URL padrão do Hosting: `https://wps-one-frontend.web.app` (domínio customizado, se houver, entra no `CORS_ORIGIN`)
  - Configuração da API: variável `NEXT_PUBLIC_API_URL` em `frontend/.env.local`

- **Backend**
  - Runtime: **Node.js >= 18**
  - Framework: **Express** (TypeScript)
  - ORM: **Prisma**
  - Pasta: `backend/`
  - Deploy: **Render** — URL alvo da API: **`https://wps-one-backend.onrender.com`** (só existe após criar um **novo** Web Service com esse nome na criação; renomear o antigo não muda o `onrender.com`).
  - Build: `tsc` (CommonJS, saída em `backend/dist`)
  - Start: `node dist/index.js` (via script `npm run start`)
  - CORS configurado manualmente em `backend/src/index.ts`

- **Banco de dados**
  - Engine: **PostgreSQL**
  - Provedor: **Neon** (projeto no console: **`wps-one`**)
  - Conexão: `DATABASE_URL` (e `DIRECT_URL`) no arquivo `backend/.env` e nas envs do Render (hostname continua `*.neon.tech`; o nome do projeto no Neon é só organização no painel)

- **Autenticação**
  - Tipo: **JWT próprio** (não usa Firebase Auth)
  - Login por **e-mail + senha** em `/api/auth/login`
  - Perfis principais: `ADMIN`, `GESTOR_PROJETOS`, `CONSULTOR`, `CLIENTE`
  - Multi-tenant: cada usuário pertence a um `Tenant` (`tenantId` no token)

---

### 2. Repositório e estrutura de pastas

- Repositório GitHub: `https://github.com/WPS-WMS/wps-one`

Estrutura relevante:

```text
wps-one/
├── backend/           # API Express + Prisma
│   ├── src/           # Código TypeScript do backend
│   ├── dist/          # Saída compilada (gerada por tsc)
│   ├── prisma/        # Client gerado e seed
│   ├── package.json
│   └── tsconfig.json
├── frontend/          # App Next.js (React)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── .env.local
├── prisma/            # Migrations antigas (não usadas para o Neon)
└── docs/              # Documentação de deploy e arquitetura
```

---

### 3. Backend – detalhes (Render)

#### 3.x. Guardrails (QA/PROD): não perder uploads + envs estáveis

Esta seção existe para reduzir o risco de “sumir arquivo” após deploy.

##### 3.x.1. Regra de ouro sobre uploads

- O backend serve arquivos de `UPLOADS_ROOT` em `GET /uploads/*` e grava uploads em subpastas (portal, tickets, users, projects).
- **Se `UPLOADS_ROOT` não apontar para um volume persistente**, os arquivos podem sumir em redeploy/recriação do serviço.
- No Render, o mais comum é montar um **Persistent Disk** em um path como `/var/data` e configurar:
  - `UPLOADS_ROOT=/var/data` (ou `/var/data/wps-uploads`).

##### 3.x.2. Modelo recomendado: 2 serviços (QA e PROD) + 2 discos

- **Render PROD**: Web Service próprio + **Persistent Disk PROD**
  - `DATABASE_URL` → banco/branch **PROD** no Neon
  - `UPLOADS_ROOT` → mount path do **disk PROD**
- **Render QA**: Web Service próprio + **Persistent Disk QA**
  - `DATABASE_URL` → banco/branch **QA** no Neon
  - `UPLOADS_ROOT` → mount path do **disk QA**

Evite “reaproveitar” o mesmo serviço para QA/PROD apenas trocando envs: é a forma mais fácil de cruzar dados ou perder uploads.

##### 3.x.3. Checklist antes de qualquer deploy (QA/PROD)

No serviço correto (QA ou PROD), confirme:

- **Volume**: o Persistent Disk está **montado** no serviço (o mount path existe).
- **`UPLOADS_ROOT`**: aponta exatamente para o mount path do disk.
- **`DATABASE_URL`**: aponta para o banco do ambiente correto (QA vs PROD).
- **`JWT_SECRET`**: está presente (produção) e não foi apagado.

Depois disso, faça o deploy.

##### 3.x.4. Mini “runbook” quando “sumiu PDF/foto/anexo”

1. Verifique no Render se o serviço que você está olhando é o **ambiente correto** (QA vs PROD).
2. Confirme se o **Persistent Disk** continua montado no serviço e se o mount path não mudou.
3. Confirme se `UPLOADS_ROOT` continua igual ao mount path do disk.
4. Se `UPLOADS_ROOT` estiver vazio ou apontando para dentro do diretório da aplicação, os uploads podem ter ido para o filesystem efêmero.
5. Se o disco foi removido/trocado, trate como incidente: recuperar a partir de backup/cópia (se existir).

#### 3.0. Ter a URL `https://wps-one-backend.onrender.com`

O Render **não** altera o subdomínio depois que o serviço foi criado. Renomear no painel ≠ mudar `*.onrender.com`.

Para ficar com **`wps-one-backend.onrender.com`**:

1. No Render: **New +** → **Web Service** (não é “rename”).
2. Conecte o mesmo repo **`WPS-WMS/wps-one`**, branch **`main`**.
3. No passo de nome, use exatamente **`wps-one-backend`** (define o host `https://wps-one-backend.onrender.com`).  
   Se o Render disser que o nome já existe, **renomeie o serviço antigo** para algo como `wps-flowa-legacy` e tente de novo, ou use outro nome único (ex.: `wps-one-api`) — o slug será esse nome.
4. **Root Directory:** `backend`  
   **Build:** `npm install && npm run build`  
   **Start:** `npm run start`
5. Copie **todas** as variáveis de ambiente do serviço antigo (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV`, etc.).
6. Faça deploy; teste `https://wps-one-backend.onrender.com/health`.
7. No Firebase / `.env` do front: `NEXT_PUBLIC_API_URL=https://wps-one-backend.onrender.com` e novo deploy do Hosting.
8. Quando estiver estável, **suspenda ou exclua** o serviço antigo (`wps-flowa-backend.onrender.com`) para não pagar/duplicar à toa.

**Alternativa:** domínio próprio (`api.wpsone.com.br`) no serviço que você quiser manter — aí a URL “oficial” deixa de depender do slug Render.

#### 3.1. Configuração do serviço no Render

- **Tipo de serviço**: Web Service
- **Root Directory**: `backend`
- **Build Command**:

```bash
npm install && npm run build
```

- **Start Command**:

```bash
npm run start
```

- **Scripts em `backend/package.json`** (resumo):

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

#### 3.2. Variáveis de ambiente no Render

Exemplo de configuração mínima para produção:

- `DATABASE_URL` → connection string do Neon, por exemplo:

  ```text
  postgresql://usuario:senha@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
  ```

- `NODE_ENV=production`

- `CORS_ORIGIN` → origens permitidas para o frontend (inclua domínio customizado se usar):

  ```text
  https://wps-one-frontend.web.app,https://wps-one-frontend.firebaseapp.com,http://localhost:3000
  ```

- Segredos de autenticação (exemplos — ajustar conforme o projeto):
  - `JWT_SECRET`
  - qualquer outra env usada em `backend/src/lib/auth.ts` ou rotas.

#### 3.3. CORS no backend

Em `backend/src/index.ts` existe um middleware manual de CORS logo no início da app:

- Lê `CORS_ORIGIN` (lista separada por vírgula) e monta `allowedOrigins`.
- Para cada requisição:
  - Define `Access-Control-Allow-Origin` com a origem atual, se estiver na lista, ou com o fallback `https://wps-one-frontend.web.app` (sobrescrevível com `CORS_FALLBACK_ORIGIN`).
  - Define `Access-Control-Allow-Credentials`, `Allow-Methods`, `Allow-Headers` e `Max-Age`.
  - Responde `204` para requisições `OPTIONS` (preflight).

Isso garante que chamadas a partir do Hosting (`https://wps-one-frontend.web.app` ou origens listadas em `CORS_ORIGIN`) funcionem sem erro de CORS, desde que o backend esteja saudável.

---

### 4. Banco de dados – Neon + Prisma

#### 4.1. Configuração do Neon

No painel do **Neon**:

- Projeto no console Neon: **`wps-one`**.
- Postgres version: 17.
- Região: algo como `AWS US East 1 (N. Virginia)`.
- Auth do Neon desligado (não usado).
- A conexão é obtida na aba **Connection Details**, no formato URI.

#### 4.2. Variáveis no `backend/.env` (ambiente local)

Exemplo de `.env` em `backend/` apontando para o Neon (desenvolvimento local contra o banco de produção ou um branch do Neon):

```env
DATABASE_URL=postgresql://usuario:senha@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://usuario:senha@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=algum_segredo_forte_aqui
CORS_ORIGIN=http://localhost:3000,https://wpsone.com.br,https://www.wpsone.com.br,https://wps-one-frontend.web.app,https://wps-one-frontend.firebaseapp.com
```

- `DIRECT_URL` é usado internamente pelo Prisma; para simplificar, manter o mesmo valor de `DATABASE_URL`.

#### 4.3. Aplicar schema no Neon

Por causa de uma migration antiga com tipo incorreto (`DATETIME`), **não usamos mais `migrate deploy` em bancos novos**. Para criar/atualizar o schema no Neon usamos:

No seu computador (com `.env` apontando para o Neon):

```bash
cd backend
npm install
npx prisma db push
```

Isso lê apenas o `prisma/schema.prisma` e cria todas as tabelas/campos diretamente no banco, ignorando o histórico de migrations.

> Importante: **não** rodar `npx prisma migrate deploy` em bancos novos, para evitar o erro de `type "datetime" does not exist` daquela migration antiga.

---

### 5. Frontend – Next.js + Firebase Hosting

#### 5.1. Configuração da API no frontend

Em `frontend/.env.local` (desenvolvimento e referência para produção):

```env
NEXT_PUBLIC_API_URL=https://wps-one-backend.onrender.com
```

Essa variável é usada pelo código do frontend (módulo `@/lib/api` e afins) para montar as URLs das chamadas à API.

#### 5.2. Build local do frontend

```bash
cd frontend
npm install
npm run dev      # desenvolvimento local (http://localhost:3000)

# para build de produção:
npm run build
```

#### 5.3. Deploy no Firebase Hosting (resumo)

Consulte também `docs/DEPLOY-FIREBASE-FRONTEND.md` para mais detalhes. Em geral:

```bash
cd frontend
npm run build
firebase deploy --only hosting
```

O Firebase serve os arquivos gerados e o frontend chama a API no Render usando `NEXT_PUBLIC_API_URL`.

---

### 6. Fluxos importantes de operação

#### 6.1. Criar/atualizar o schema no banco (Neon)

Sempre que o schema Prisma mudar (`prisma/schema.prisma`):

1. Atualize o schema.
2. Com `.env` do backend apontando para o Neon:

   ```bash
   cd backend
   npx prisma db push
   ```

3. Faça commit das alterações de código.
4. Render fará o build e passará a usar o banco com o schema novo.

#### 6.2. Criar o usuário administrador padrão

O projeto já possui um script de seed que cria o tenant inicial e usuários de teste (incluindo o admin).

Com `DATABASE_URL`/`DIRECT_URL` apontando para o Neon:

```bash
cd backend
npm run db:seed
```

Isso executa `prisma/seed.ts`, que cria pelo menos:

- Tenant principal (por exemplo: `"WPS Consult"`).
- Usuário administrador com:
  - **E-mail**: `admin@wpsconsult.com.br`
  - **Senha**: `123456`
  - Perfil/role: `ADMIN`

Após rodar o seed, você pode usar esse usuário para acessar a aplicação em produção.

> Se o seed for rodado mais de uma vez, verifique se o script trata duplicidade (e-mails únicos). Em caso de erro de "unique constraint", ajuste o seed antes de rodar novamente.

#### 6.3. Testar se o backend está saudável

Com o serviço do Render no ar:

1. Acesse no navegador:

   ```text
   https://wps-one-backend.onrender.com/health
   ```

2. Espera-se uma resposta JSON simples (ex.: `{ "ok": true }`).
3. Se houver erro 500 ou timeout, ver os logs no painel do Render.

#### 6.4. Verificar chamadas da aplicação em produção

No navegador (DevTools → Network) ao usar `https://wps-one-frontend.web.app` (ou seu domínio customizado):

- Verifique se as chamadas da API vão para:

  ```text
  https://wps-one-backend.onrender.com/api/...
  ```

- Se ainda apontarem para uma URL antiga, o `NEXT_PUBLIC_API_URL` usado no build do Firebase Hosting não foi atualizado.

---

### 7. Resumo para novos desenvolvedores

1. **Clonar o repositório** e instalar dependências:

   ```bash
   git clone https://github.com/WPS-WMS/wps-one.git
   cd wps-one

   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. **Configurar `.env` do backend** (`backend/.env`) com `DATABASE_URL`/`DIRECT_URL` do Neon e segredos de JWT.

3. **Aplicar schema no banco** (se necessário):

   ```bash
   cd backend
   npx prisma db push
   npm run db:seed   # para criar tenant e usuários iniciais (admin: admin@wpsconsult.com.br / 123456)
   ```

4. **Rodar localmente**:

   - Backend:

     ```bash
     cd backend
     npm run dev
     ```

   - Frontend:

     ```bash
     cd frontend
     npm run dev
     ```

   - Acessar `http://localhost:3000` e testar login.

5. **Produção**

   - Backend: Render (`backend/`, build/start configurados conforme seção 3.1).
   - Banco: Neon (connection string em `DATABASE_URL` no Render).
   - Frontend: Firebase Hosting (`NEXT_PUBLIC_API_URL` apontando para o Render).

Com esse documento, qualquer pessoa consegue entender **como o FLOWA está rodando hoje**, quais provedores estão em uso, e como executar as tarefas básicas de manutenção (deploy, migração de schema, criação de usuário admin e testes). 

