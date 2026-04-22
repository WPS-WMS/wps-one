## Arquitetura do sistema (WPS One / FLOWA)

Este documento descreve, em linguagem prática, **o que o sistema faz**, **como ele funciona**, **onde cada parte está hospedada** e **como as camadas se conectam**.

---

### 1) Para que serve o sistema

O WPS One (FLOWA) é um sistema de **gestão de projetos e operação de serviços** com:

- **Projetos** (internos, Fixed Price, AMS, Time & Material)
- **Chamados / tarefas** por projeto (com responsáveis, histórico e comentários)
- **Apontamento de horas** (lançamentos, regras por usuário, relatórios)
- **Portal corporativo** (Notícias, Manuais, Templates, Biblioteca etc.)
- **Multi-tenant**: cada empresa/organização (tenant) tem seus próprios dados

---

### 2) Linguagens e tecnologias

- **Frontend**
  - **Next.js + React + TypeScript**
  - UI com Tailwind/CSS utilitário (classes no JSX)
  - Hospedagem: **Firebase Hosting**
- **Backend**
  - **Node.js + TypeScript**
  - API **Express**
  - ORM: **Prisma**
  - Hospedagem: **Render**
- **Banco**
  - **PostgreSQL**
  - Hospedagem: **Neon**

---

### 3) Onde está hospedado (hoje)

- **Frontend (site/app)**
  - Firebase Hosting (targets: `qa` e `prod`)
  - O bundle do frontend chama a API via `NEXT_PUBLIC_API_URL` (build-time).
- **Backend (API)**
  - Render (Web Service)
  - Rotas principais em `backend/src/routes/*`
- **Banco (Postgres)**
  - Neon
  - Conexão via `DATABASE_URL` (e `DIRECT_URL` para Prisma).

---

### 4) Fluxos principais (visão de “como funciona”)

#### 4.1 Login e sessão

- O usuário faz login em `POST /api/auth/login`.
- O backend valida e devolve:
  - dados do usuário + permissões
  - (compat) token JWT
  - e **cookie HttpOnly `wps_token`** (produção) para reduzir impacto de XSS
- O frontend valida sessão chamando `GET /api/auth/me`.

#### 4.2 Multi-tenant (isolamento)

- Quase toda consulta no backend filtra por `tenantId` (via `req.user.tenantId`).
- Chaves/relacionamentos usam `tenantId` nas tabelas principais (Tenant, User, Client, Activity…).

#### 4.3 Projetos → Chamados → Horas

- **Client** (empresa cliente) agrupa projetos.
- **Project** agrupa tickets e time entries.
- **Ticket** representa tarefa/chamado (status, responsável, histórico, comentários, anexos).
- **TimeEntry** registra apontamento de horas ligado a um Ticket (e por consequência ao Project).

#### 4.4 Portal corporativo

- Seções (`PortalSection`) e itens (`PortalItem`) por tenant.
- Uploads do portal são guardados em `/uploads/portal/<tenantId>/...`.
- PDFs do portal (manuais/templates/biblioteca/notícias) são abertos pelo frontend, preferindo rotas autenticadas.

---

### 5) Estrutura do repositório

`backend/`
- `src/index.ts`: bootstrap da API, CORS, middlewares, rotas, uploads.
- `src/routes/*`: endpoints REST.
- `src/lib/*`: auth, permissões, helpers e infraestrutura.
- `prisma/`: schema/migrations/seed.

`frontend/`
- `src/app/*`: rotas do Next.
- `src/components/*`: componentes (inclui portal, tarefas, modais).
- `firebase.json`: regras do Hosting (rewrites e headers).

`docs/`
- Documentos de arquitetura, banco, práticas e roadmap.

---

### 6) Deploy (resumo operacional)

- **Backend (Render)**
  - Build: `npm install && npm run build`
  - Start: `npm run start`
  - Variáveis críticas: `DATABASE_URL`, `JWT_SECRET`, `UPLOADS_ROOT`, `CORS_ORIGIN`
- **Frontend (Firebase Hosting)**
  - Scripts em `frontend/package.json` (`deploy:qa`, `deploy:prod`)
  - Variáveis críticas no build: `NEXT_PUBLIC_API_URL` (e opcional `NEXT_PUBLIC_ASSET_PUBLIC_ORIGIN`)

---

### 7) Documentos relacionados

- Banco de dados: `docs/02-BANCO-DE-DADOS.md`
- Práticas de programação: `docs/03-PRATICAS-DE-PROGRAMACAO.md`
- Análise e melhorias futuras: `docs/04-ANALISE-E-ROADMAP.md`

