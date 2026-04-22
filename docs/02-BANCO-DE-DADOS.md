## Banco de dados (Neon / PostgreSQL / Prisma)

Este documento é a **leitura completa do banco**: tabelas, colunas, chaves e cardinalidades, com foco em entendimento e estudo.

> Fonte de verdade: `backend/prisma/schema.prisma` (models do Prisma) e as migrations em `backend/prisma/migrations/`.

---

### 1) Como ler o modelo

- **PK (Primary Key)**: coluna que identifica o registro (ex.: `id`).
- **FK (Foreign Key)**: coluna que aponta para outra tabela (ex.: `tenantId`).
- **Cardinalidade**
  - 1 → N: um registro “pai” tem muitos “filhos”
  - N → N: relação via tabela intermediária

---

### 2) Resumo das áreas do banco

- **Multi-tenant**: `Tenant` como raiz do isolamento
- **Identidade e acesso**: `User`, permissões e vínculos com clientes
- **Operação**: `Client` → `Project` → `Ticket` → `TimeEntry`
- **Portal**: `PortalSection`, `PortalItem`, `PortalEvent`
- **Auditoria**: `TicketHistory`, comentários e anexos

---

### 3) Leitura completa das tabelas (tabelas, colunas e relações)

A documentação detalhada (com todas as tabelas, colunas e cardinalidades) está aqui:

- `docs/DATABASE-OVERVIEW-NEON.md`

Esse arquivo já descreve:
- cada tabela/model
- campos principais
- PK/FK e indexes
- cardinalidades e propósito funcional

---

### 4) Como gerar/atualizar esta documentação (quando o schema mudar)

Quando vocês alterarem o `schema.prisma`, a prática recomendada é:

- Atualizar o `schema.prisma` e migrations.
- Regerar Prisma Client:
  - `npm run db:generate` (em `backend/`)
- Atualizar a documentação:
  - editar `docs/DATABASE-OVERVIEW-NEON.md` com as mudanças (novas colunas/relacionamentos).

---

### 5) Regras de ouro (para não “quebrar” multi-tenant)

- Toda tabela “de negócio” deve ter vínculo indireto ou direto com `tenantId`.
- Toda rota deve filtrar por `tenantId` do `req.user`.
- Evitar “buscar por `id` puro” sem confirmar tenant (defesa em profundidade).

