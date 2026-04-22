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

> A partir daqui, este documento passa a conter **toda a leitura completa** (antes em `DATABASE-OVERVIEW-NEON.md`),
> para ficar autocontido.

---

### 3.1) Tabela `Tenant`

**Model Prisma:** `Tenant`

**Propósito:**  
Representa uma empresa/organização (tenant). Todo usuário, cliente, projeto e atividade está ligado a um único `Tenant`, garantindo multi-tenant.

**Campos principais:**
- `id` (`String`, PK, `cuid()`) → identificador do tenant.
- `name` (`String`) → nome da empresa.
- `slug` (`String`, `@unique`) → identificador curto/slug (ex.: `wps-consult`).
- `createdAt` (`DateTime`, default `now()`).
- `updatedAt` (`DateTime`, `@updatedAt`).

**Relações:**
- 1 **Tenant** → N **User** (`Tenant.users` / `User.tenant` via `tenantId`).
- 1 **Tenant** → N **Client** (`Tenant.clients` / `Client.tenant` via `tenantId`).
- 1 **Tenant** → N **Activity** (`Tenant.activities` / `Activity.tenant` via `tenantId`).

**Cardinalidade:**  
`Tenant (1) ──< (N) User`  
`Tenant (1) ──< (N) Client`  
`Tenant (1) ──< (N) Activity`

---

### 3.2) Tabela `User` (mapeada como `users`)

**Model Prisma:** `User` com `@@map("users")`

**Propósito:**  
Usuários do sistema (admin, gestores, consultores, clientes) vinculados a um `Tenant`.

**Campos principais:**
- `id` (`String`, PK, `cuid()`).
- `email` (`String`).
- `name` (`String`).
- `passwordHash` (`String`) → senha já com hash (bcrypt).
- `role` (`String`) → perfil (`ADMIN`, `GESTOR_PROJETOS`, `CONSULTOR`, `CLIENTE`, etc.).
- `tenantId` (`String`, FK → `Tenant.id`).
- Dados de configuração e regras de apontamento:
  - `cargaHorariaSemanal` (`Float?`, default 40).
  - `limiteHorasDiarias` (`Float?`, default 8).
  - `limiteHorasPorDia` (`String?`, JSON com horas por dia da semana).
  - `permitirMaisHoras` (`Boolean`, default `false`).
  - `permitirFimDeSemana` (`Boolean`, default `false`).
  - `permitirOutroPeriodo` (`Boolean`, default `false`).
  - `diasPermitidos` (`String?`).  
  - `dataInicioAtividades` (`DateTime?`).
- Segurança e status:
  - `mustChangePassword` (`Boolean`, default `true`).
  - `ativo` (`Boolean`, default `true`).
  - `inativadoEm` (`DateTime?`).
  - `inativacaoMotivo` (`String?`).

**Índices/constraints:**
- `@@unique([email, tenantId])` → o mesmo e-mail pode existir em tenants diferentes, mas é único **dentro do tenant**.

**Relações principais (exemplos):**
- `Tenant (1) ──< (N) User`.
- `User` cria projetos (`Project.createdById`).
- `User` aponta horas (`TimeEntry.userId`).
- `User` pode ser responsável por tickets/projetos, comentar, anexar arquivos, etc.

---

### 3.3) Tabela `Client`

**Model Prisma:** `Client`

**Propósito:**  
Clientes de um tenant (empresas contratantes).

**Campos principais:**
- `id` (`String`, PK).
- `name` (`String`).
- `tenantId` (`String`, FK → `Tenant.id`).
- Contatos básicos: `email`, `telefone`, endereço (`cep`, `endereco`, `numero`, `complemento`, `bairro`, `cidade`, `estado`).
- `createdAt`, `updatedAt`.

**Relações:**
- 1 **Tenant** → N **Client**.
- 1 **Client** → N **Project** (`projects`).
- 1 **Client** → N **ClientUser** (`users` – vincula usuários que representam esse cliente).
- 1 **Client** → N **ClientContact** (`contacts`).

---

### 3.4) Tabela `ClientContact`

**Model Prisma:** `ClientContact`

**Propósito:**  
Contatos individuais de um cliente (nome, email, telefone).

**Campos:**
- `id` (`String`, PK).
- `clientId` (`String`, FK → `Client.id`).
- `name`, `email?`, `telefone?`.
- `createdAt`, `updatedAt`.

**Relação:**  
`Client (1) ──< (N) ClientContact`

---

### 3.5) Tabela `ClientUser` (ligação Cliente ↔ User)

**Model Prisma:** `ClientUser`

**Propósito:**  
Tabela de junção (N:N) entre `User` e `Client`, usada para definir quais usuários têm acesso como cliente a um determinado cliente.

**Campos:**
- `id` (`String`, PK).
- `userId` (`String`, FK → `User.id`).
- `clientId` (`String`, FK → `Client.id`).

**Índices:**
- `@@unique([userId, clientId])`.

**Cardinalidade:**  
`User (N) ──< (N:N via ClientUser) >── (N) Client`

---

### 3.6) Enum `TipoProjeto`

Valores possíveis:
- `INTERNO`
- `FIXED_PRICE`
- `AMS`
- `TIME_MATERIAL`

---

### 3.7) Tabela `Project`

**Model Prisma:** `Project`

**Propósito:**  
Projetos vinculados a um cliente (e, indiretamente, a um tenant). Cada projeto agrupa tickets e apontamentos de horas.

**Campos principais (resumo):**
- Identidade: `id`, `name`, `description?`
- Vínculos: `clientId` (FK), `createdById` (FK)
- Datas/prioridade: `dataInicio?`, `dataFimPrevista?`, `prioridade?`
- Planejamento: `totalHorasPlanejadas?`, `statusInicial`
- Tipo de contrato: `tipoProjeto` + campos específicos (Fixed Price / AMS / T&M)
- Anexo: `anexoNomeArquivo`, `anexoUrl`, `anexoTipo`, `anexoTamanho`
- Arquivamento: `arquivado`, `arquivadoEm?`

**Relações:**  
`Client (1) ──< (N) Project`  
`Project (1) ──< (N) Ticket`  
`Project (1) ──< (N) TimeEntry`

---

### 3.8) Tabela `ProjectResponsible`

N:N entre `Project` e `User` (responsáveis do projeto).

Campos: `id`, `projectId` (FK), `userId` (FK) + `@@unique([projectId, userId])`.

---

### 3.9) Tabela `Ticket`

**Propósito:** tópico/tarefa/subtarefa dentro de um projeto (hierarquia por `parentTicketId`).

Campos principais (resumo):
- Identidade: `id`, `code`, `title`, `description?`, `type`
- Estado: `status`, `criticidade?`, `progresso?`
- Vínculos: `projectId` (FK), `parentTicketId?` (FK), `createdById?` (FK), `assignedToId?` (FK)
- Datas/estimativa: `dataInicio?`, `dataFimPrevista?`, `estimativaHoras?`
- `createdAt`, `updatedAt`

Relações: comentários, histórico, anexos, apontamentos de horas, responsáveis (N:N).

---

### 3.10) Tabela `TicketResponsible`

N:N entre `Ticket` e `User`.

Campos: `id`, `ticketId` (FK), `userId` (FK) + `@@unique([ticketId, userId])`.

---

### 3.11) Tabela `Activity`

Tipos de atividades (por tenant) usados nos apontamentos.

Campos: `id`, `name`, `tenantId` (FK).

---

### 3.12) Tabela `TimeEntry`

Apontamento de horas.

Campos principais (resumo): `date`, `horaInicio`, `horaFim`, intervalos, `totalHoras`, `description?`, `userId`, `projectId`, `ticketId?`, `activityId?`, `createdAt`, `updatedAt`.

---

### 3.13) Tabela `TicketComment`

Comentários em tickets (HTML).

Campos: `id`, `ticketId` (FK), `userId` (FK), `content`, `createdAt`, `updatedAt`.

---

### 3.14) Tabela `TicketHistory`

Histórico de ações em tickets.

Campos principais: `ticketId`, `userId`, `action`, `field?`, `oldValue?`, `newValue?`, `details?`, `createdAt`.

---

### 3.15) Tabelas de anexos

- `TicketCommentAttachment`: anexos associados a comentários
- `TicketAttachment`: anexos associados diretamente ao ticket

Campos típicos: `filename`, `fileUrl`, `fileType`, `fileSize`, `createdAt` + FKs.

---

### 3.16) Tabela `TimeEntryPermissionRequest`

Solicitações de permissão para apontamento fora das regras.

Campos (resumo): `userId`, `projectId`, `ticketId?`, `activityId?`, horários, `totalHoras`, `status`, `reviewedAt?`, `reviewedById?`, `rejectionReason?`, `createdAt`.

---

### 3.17) Tabela `PasswordResetToken`

Reset de senha.

Campos: `userId`, `token` (unique), `expiresAt`, `used`, `createdAt`.

---

### 3.18) Tabela `HourBankRecord`

Banco de horas mensal por usuário.

Campos: `userId`, `month`, `year`, `horasPrevistas`, `horasTrabalhadas`, `horasComplementares?`, `observacao?`, `createdAt`, `updatedAt` + `@@unique([userId, month, year])`.

---

### 3.19) Resumo das principais relações (alto nível)

- `Tenant (1) ──< (N) User / Client / Activity`
- `Client (1) ──< (N) Project`
- `Project (1) ──< (N) Ticket / TimeEntry`
- `Ticket (1) ──< (N) TicketComment / TicketHistory / TicketAttachment / TimeEntry`

> Para detalhes adicionais de campos/índices menos usados, consulte o `schema.prisma`.

---

### 4) Como gerar/atualizar esta documentação (quando o schema mudar)

Quando vocês alterarem o `schema.prisma`, a prática recomendada é:

- Atualizar o `schema.prisma` e migrations.
- Regerar Prisma Client:
  - `npm run db:generate` (em `backend/`)
- Atualizar a documentação:
  - editar este arquivo (`docs/02-BANCO-DE-DADOS.md`) com as mudanças (novas colunas/relacionamentos).

---

### 5) Regras de ouro (para não “quebrar” multi-tenant)

- Toda tabela “de negócio” deve ter vínculo indireto ou direto com `tenantId`.
- Toda rota deve filtrar por `tenantId` do `req.user`.
- Evitar “buscar por `id` puro” sem confirmar tenant (defesa em profundidade).

