# WPSone — Gestão de Projetos

**WPSone** (também exibido como **WPS One** na interface) é o sistema de gestão de projetos, chamados, apontamento de horas e operação de serviços da WPS. A aplicação usa arquitetura separada (API + frontend) para escalar e evoluir por módulos.

> O repositório e algumas pastas ainda usam o nome legado `wps-flowa`; o produto em produção é **WPSone**.

## Estrutura

```
wps-one/
├── backend/     → API Express + Prisma (deploy: Render)
├── frontend/    → Next.js (deploy: Firebase Hosting)
└── docs/        → Arquitetura, banco, práticas e roadmap
```

## Tecnologias

| Camada    | Stack |
|-----------|--------|
| Backend   | Express, Prisma, PostgreSQL (Neon) |
| Frontend  | Next.js, React, Tailwind |
| Auth      | JWT (Bearer token) |
| E-mail    | Microsoft Graph e/ou SMTP (configurável) |

## Multi-tenant

O sistema é **multi-tenant**: cada organização (tenant) tem usuários, clientes, projetos, chamados e apontamentos isolados. O `tenantId` vem no token JWT após o login; a API filtra todas as consultas por esse tenant.

## Deploy (produção / QA)

| Componente | Provedor |
|------------|----------|
| **Frontend** | Firebase Hosting (`wps-one-frontend`) |
| **Backend** | Render (`wps-one-backend.onrender.com`) |
| **Banco** | Neon (PostgreSQL) |

Domínio público: [wpsone.com.br](https://wpsone.com.br)

Detalhes operacionais (env vars, migrações, CORS): ver `docs/SYSTEM-OVERVIEW-RENDER-NEON.md` e `docs/01-ARQUITETURA-DO-SISTEMA.md`.

---

## Desenvolvimento local

### 1. Instalar e configurar

```bash
# Backend
cd backend
npm install
npm run db:generate
npm run db:push   # ou: npx prisma migrate dev
npm run db:seed   # tenant "WPS Consult" + usuários de teste

# Frontend (outro terminal)
cd ../frontend
npm install
```

Arquivos `.env` (backend) e `.env.local` (frontend) devem existir com valores para local.

### 2. Rodar

**Terminal 1 — Backend (porta 4000):**

```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend (porta 3000):**

```bash
cd frontend
npm run dev
```

Acesse: **http://localhost:3000**

### Usuários de teste (após `npm run db:seed`)

O seed (`backend/prisma/seed.ts`) cria os usuários abaixo com a **mesma senha definida no seed** (por padrão `123456`). Válido **apenas** para base local recém-semeada.

| E-mail | Perfil |
|--------|--------|
| admin@wpsconsult.com.br | Admin |
| gestor@wpsconsult.com.br | Gestor de Projetos |
| andre.nunes@wpsconsult.com.br | Consultor |
| almir@dellamed.com.br | Cliente |

**Produção e QA** usam banco próprio: senhas são independentes e podem ter sido alteradas. **Não** commite senhas reais.

### Teste de carga leve (opcional)

Na raiz do projeto:

```powershell
# Windows PowerShell
$env:LOADTEST_API_BASE="http://localhost:4000"
$env:LOADTEST_USERS_JSON='[{"email":"...","password":"..."}]'
$env:LOADTEST_CONCURRENCY="15"
$env:LOADTEST_DURATION_SEC="60"
npm run load:test:lite
```

Variáveis: ver comentários em `scripts/load-test-lite.mjs`.

---

## Variáveis de ambiente

### Backend (`.env`)

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | PostgreSQL (Neon pooler) |
| `DIRECT_URL` | Conexão direta (migrações Prisma) |
| `JWT_SECRET` | Segredo dos tokens JWT |
| `CORS_ORIGIN` | Origens permitidas (ex.: `http://localhost:3000`, `https://wpsone.com.br`) |
| `PORT` | Porta da API (padrão: `4000`) |
| `GRAPH_*` / `SMTP_*` | Envio de e-mail (Graph Microsoft ou SMTP) |

### Frontend (`.env.local`)

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | URL da API (ex.: `http://localhost:4000` ou URL do Render) |

---

## Perfis e visões principais

| Perfil | Visões |
|--------|--------|
| **Consultor** | Home, Projetos, Apontamento, Banco de horas, Chamados |
| **Gestor** | Consultor + gestão de equipe e permissões |
| **Admin** | Configurações, usuários, relatórios, projetos |
| **Cliente** | Chamados, consumo de horas, acompanhamento |

---

## Roadmap (próximas entregas)

- **Integração SharePoint / Microsoft Teams** — ver `Admin → Configurações → SharePoint`. Pastas por projeto/tarefa; sync bidirecional de anexos.

### SharePoint (variáveis opcionais)

| Variável | Descrição |
|----------|-----------|
| `SHAREPOINT_SYNC_INTERVAL_MS` | Intervalo do polling SharePoint→WPSone (padrão 300000 = 5 min; mínimo 60000) |
| Graph (`TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`) | Mesmas do e-mail + permissões `Sites.ReadWrite.All` e `Files.ReadWrite.All` |

---

## Documentação adicional

| Arquivo | Conteúdo |
|---------|----------|
| `docs/01-ARQUITETURA-DO-SISTEMA.md` | Arquitetura e módulos |
| `docs/02-BANCO-DE-DADOS.md` | Schema e migrations |
| `docs/SYSTEM-OVERVIEW-RENDER-NEON.md` | Deploy Render + Neon + Firebase |
| `TROUBLESHOOTING.md` | Problemas comuns (nome legado FLOWA em alguns títulos) |
