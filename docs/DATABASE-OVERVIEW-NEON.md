## (Legado) Visão geral do banco de dados (Neon / Prisma)

> Este documento continua como referência detalhada das tabelas/colunas.
> Para o “índice” principal de banco, veja `docs/02-BANCO-DE-DADOS.md`.

Este documento descreve o **modelo relacional** atual do FLOWA: nomes das tabelas, propósito, campos principais, chaves primárias (PK), estrangeiras (FK) e cardinalidades, com foco em entendimento funcional.

> Observação: os nomes abaixo seguem os **models do Prisma**; alguns têm `@@map` para nomes físicos levemente diferentes (por exemplo, `User` → tabela `users`).

---

### 1. Tabela `Tenant`

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

### 2. Tabela `User` (mapeada como `users`)

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

**Relações principais:**
- N usuários de um tenant: `Tenant (1) ──< (N) User`.
- `User` cria projetos (`createdProjects` → `Project` via `createdById`).
- `User` aponta horas (`timeEntries` → `TimeEntry.userId`).
- `User` pode ser responsável por tickets (`assignedTickets`, `ticketResponsibles`) e projetos (`projectResponsibles`).
- `User` faz comentários (`ticketComments`), histórico (`ticketHistory`), anexos (`ticketAttachments`).
- `User` possui tokens de reset de senha (`passwordResetTokens`).
- `User` tem registros de banco de horas (`hourBankRecords`).
- `User` pode ter acesso como cliente (`clientAccess` via `ClientUser`).
- `User` realiza solicitações de permissão de apontamento (`timeEntryPermissionRequests`). 

---

### 3. Tabela `Client`

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
- 1 **Client** → N **ClientContact** (`contacts` – contatos internos do cliente).

---

### 4. Tabela `ClientContact`

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

### 5. Tabela `ClientUser` (ligação Cliente ↔ User)

**Model Prisma:** `ClientUser`

**Propósito:**  
Tabela de junção (N:N) entre `User` e `Client`, usada para definir quais usuários têm acesso como cliente a um determinado cliente.

**Campos:**
- `id` (`String`, PK).
- `userId` (`String`, FK → `User.id`).
- `clientId` (`String`, FK → `Client.id`).

**Índices:**
- `@@unique([userId, clientId])` → um mesmo par usuário/cliente não pode ser duplicado.

**Cardinalidade:**  
`User (N) ──< (N:N via ClientUser) >── (N) Client`

---

### 6. Enum `TipoProjeto`

**Enum Prisma:** `TipoProjeto`

Valores possíveis:
- `INTERNO`
- `FIXED_PRICE`
- `AMS`
- `TIME_MATERIAL`

Usado em `Project.tipoProjeto` para classificar o tipo de contrato.

---

### 7. Tabela `Project`

**Model Prisma:** `Project`

**Propósito:**  
Projetos vinculados a um cliente (e, indiretamente, a um tenant). Cada projeto agrupa tickets (tarefas/tópicos) e apontamentos de horas.

**Campos principais:**
- `id` (`String`, PK).
- `name` (`String`).
- `description` (`String?`).
- `clientId` (`String`, FK → `Client.id`).
- `createdById` (`String`, FK → `User.id`).
- `createdAt` (`DateTime`, default `now()`).
- Datas: `dataInicio?`, `dataFimPrevista?`.
- `prioridade?` (string).
- `totalHorasPlanejadas?` (`Float?`).
- `statusInicial` (`String`, default `"PLANEJADO"`).

**Configurações por tipo de projeto:**
- `tipoProjeto` (`TipoProjeto?`, default `INTERNO`).
- Fixed Price: `valorContrato`, `escopoInicial`, `limiteHorasEscopo`, `changeRequestsAtivo`.
- AMS: `tipoContratoAMS`, `horasMensaisAMS`, `bancoHorasInicial`, `slaAMS`.
- Time & Material: `periodoAprovacaoTM`, `aprovacaoAutomaticaTM`, `estimativaInicialTM`.

**Anexos de proposta/escopo:**
- `anexoNomeArquivo`, `anexoUrl`, `anexoTipo`, `anexoTamanho`.

**Arquivamento:**
- `arquivado` (`Boolean`, default `false`).
- `arquivadoEm` (`DateTime?`).

**Relações:**
- `client` (`Client`) → cada projeto pertence a um **cliente**.
- `createdBy` (`User`) → usuário criador.
- `tickets` (`Ticket[]`) → tópicos e tarefas do projeto.
- `timeEntries` (`TimeEntry[]`) → apontamentos de horas ligados ao projeto.
- `responsibles` (`ProjectResponsible[]`) → usuários responsáveis pelo projeto.
- `timeEntryPermissionRequests` (`TimeEntryPermissionRequest[]`) → solicitações de permissão ligadas a este projeto.

Cardinalidade típica:  
`Client (1) ──< (N) Project`  
`Project (1) ──< (N) Ticket`  
`Project (1) ──< (N) TimeEntry`

---

### 8. Tabela `ProjectResponsible`

**Model Prisma:** `ProjectResponsible`

**Propósito:**  
Define usuários responsáveis por um projeto (N:N entre `Project` e `User`).

**Campos:**
- `id` (`String`, PK).
- `projectId` (`String`, FK → `Project.id`).
- `userId` (`String`, FK → `User.id`).

**Índice:**
- `@@unique([projectId, userId])` → um usuário não pode ser registrado duas vezes para o mesmo projeto.

---

### 9. Tabela `Ticket`

**Model Prisma:** `Ticket`

**Propósito:**  
Representa **tópicos**, **tarefas** e possivelmente **subtarefas** dentro de um projeto. Usa `type` e `parentTicketId` para indicar hierarquia.

**Campos principais:**
- `id` (`String`, PK).
- `code` (`String`) → código da tarefa/ticket (ex.: `#21`).
- `title` (`String`).
- `description` (`String?`).
- `type` (`String`) → por exemplo: `SUBPROJETO`, `TAREFA`, `SUBTAREFA` (nomenclatura usada no frontend).
- `criticidade` (`String?`) → prioridade/criticidade.
- `status` (`String`, default `"ABERTO"`).
- `projectId` (`String`, FK → `Project.id`).
- `parentTicketId` (`String?`, FK → `Ticket.id`) → para hierarquia (tarefa filha de um tópico).
- `createdById` (`String?`, FK → `User.id`).
- `assignedToId` (`String?`, FK → `User.id`) → consultor responsável principal.
- Datas: `dataInicio?`, `dataFimPrevista?`.
- `estimativaHoras?` (`Float?`).
- `progresso?` (`Int?`, default 0).
- `createdAt`, `updatedAt`.

**Relações:**
- `project` (`Project`) → dono do ticket.
- `parentTicket` (`Ticket?`) / `childTickets` (`Ticket[]`) → auto-relacionamento `TicketHierarchy` (tópico → tarefas filhas).
- `createdBy` (`User?`) → criador.
- `assignedTo` (`User?`) → consultor principal.
- `timeEntries` (`TimeEntry[]`) → horas apontadas para esse ticket.
- `responsibles` (`TicketResponsible[]`) → outros responsáveis.
- `comments` (`TicketComment[]`).
- `history` (`TicketHistory[]`).
- `attachments` (`TicketAttachment[]`).
- `timeEntryPermissionRequests` (`TimeEntryPermissionRequest[]`).

**Cardinalidade:**  
`Project (1) ──< (N) Ticket`  
`Ticket (1) ──< (N) TimeEntry`  
`Ticket (1) ──< (N) TicketComment`, `TicketHistory`, `TicketAttachment`

---

### 10. Tabela `TicketResponsible`

**Model Prisma:** `TicketResponsible`

**Propósito:**  
Tabela N:N ligando `Ticket` e `User`, para múltiplos responsáveis por uma tarefa.

**Campos:**
- `id` (`String`, PK).
- `ticketId` (`String`, FK → `Ticket.id`).
- `userId` (`String`, FK → `User.id`).

**Índice:**  
- `@@unique([ticketId, userId])`

---

### 11. Tabela `Activity`

**Model Prisma:** `Activity`

**Propósito:**  
Tipo de atividade usada nos apontamentos (ex.: Análise, Desenvolvimento, Testes).

**Campos:**
- `id` (`String`, PK).
- `name` (`String`).
- `tenantId` (`String`, FK → `Tenant.id`).

**Relações:**  
- 1 **Activity** → N **TimeEntry** (`timeEntries`).  

---

### 12. Tabela `TimeEntry`

**Model Prisma:** `TimeEntry`

**Propósito:**  
Registro de horas apontadas por usuário para um projeto/tarefa/atividade em um dia específico.

**Campos principais:**
- `id` (`String`, PK).
- `date` (`DateTime`) → data do apontamento.
- `horaInicio` (`String`) → horário inicial (`HH:MM`).
- `horaFim` (`String`).
- `intervaloInicio?`, `intervaloFim?` (`String?`).
- `totalHoras` (`Float`) → horas em decimal (ex.: 1.5 = 1h30).
- `description?` (`String?`) → descrição do trabalho.
- `userId` (`String`, FK → `User.id`).
- `projectId` (`String`, FK → `Project.id`).
- `ticketId?` (`String?`, FK → `Ticket.id`).
- `activityId?` (`String?`, FK → `Activity.id`).
- `createdAt`, `updatedAt`.

**Relações:**  
`User (1) ──< (N) TimeEntry`  
`Project (1) ──< (N) TimeEntry`  
`Ticket (1) ──< (N) TimeEntry` (opcional)  
`Activity (1) ──< (N) TimeEntry` (opcional)

---

### 13. Tabela `TicketComment`

**Model Prisma:** `TicketComment`

**Propósito:**  
Comentários em tickets (histórico de comunicação).

**Campos:**
- `id` (`String`, PK).
- `ticketId` (`String`, FK → `Ticket.id`).
- `userId` (`String`, FK → `User.id`).
- `content` (`String`) → conteúdo HTML.
- `createdAt`, `updatedAt`.

**Relações:**  
`Ticket (1) ──< (N) TicketComment`  
`User (1) ──< (N) TicketComment`

---

### 14. Tabela `TicketHistory`

**Model Prisma:** `TicketHistory`

**Propósito:**  
Histórico de ações em tickets (mudança de status, prioridade, atribuição etc.).

**Campos principais:**
- `id` (`String`, PK).
- `ticketId` (`String`, FK → `Ticket.id`).
- `userId` (`String`, FK → `User.id`).
- `action` (`String`) → tipo de ação (`CREATE`, `STATUS_CHANGE`, etc.).
- `field?` (`String?`) → campo alterado (quando aplicável).
- `oldValue?`, `newValue?` (`String?`) → valores antes/depois (JSON quando complexo).
- `details?` (`String?`) → detalhes extras.
- `createdAt` (`DateTime`, default `now()`).

**Índices:**  
- `@@index([ticketId])`, `@@index([createdAt])`.

---

### 15. Tabelas de anexos

#### 15.1. `TicketCommentAttachment`

- Anexos associados a comentários (`TicketComment`).
- Campos: `id`, `commentId` (FK), `filename`, `fileUrl`, `fileType`, `fileSize`, `createdAt`.

#### 15.2. `TicketAttachment`

- Anexos associados diretamente ao ticket.
- Campos: `id`, `ticketId` (FK), `userId` (FK), `filename`, `fileUrl`, `fileType`, `fileSize`, `createdAt`.

---

### 16. Tabela `TimeEntryPermissionRequest`

**Model Prisma:** `TimeEntryPermissionRequest`

**Propósito:**  
Solicitações de permissão para apontamento fora das regras normais (ex.: fora do horário permitido, acima do limite diário, datas específicas). Usada no fluxo onde o usuário pede aprovação de um gestor/admin.

**Campos principais:**
- `id` (`String`, PK).
- `userId` (`String`, FK → `User.id`).
- `status` (`String`, default `"PENDING"`) → `PENDING`, `APPROVED`, `REJECTED`.
- `justification` (`String`) → justificativa do usuário para o pedido.
- `date` (`DateTime`) → data do apontamento solicitado.
- `horaInicio`, `horaFim` (`String`).
- `intervaloInicio?`, `intervaloFim?` (`String?`).
- `totalHoras` (`Float`).
- `description?` (`String?`).
- `projectId` (`String`, FK → `Project.id`).
- `ticketId?` (`String?`, FK → `Ticket.id`).
- `activityId?` (`String?`, FK → `Activity.id`).
- `createdAt` (`DateTime`, default `now()`).
- `reviewedAt?` (`DateTime?`) → quando foi aprovada/reprovada.
- `reviewedById?` (`String?`) → ID do usuário que aprovou/reprovou.
- `rejectionReason?` (`String?`) → motivo da reprovação.

**Fluxo típico:**
- Usuário cria uma solicitação (`status = PENDING`).
- Admin/gestor aprova (`status = APPROVED`) e a API cria um `TimeEntry` correspondente, ou rejeita (`status = REJECTED`).

---

### 17. Tabela `PasswordResetToken`

**Model Prisma:** `PasswordResetToken`

**Propósito:**  
Gerenciar tokens de recuperação de senha.

**Campos:**
- `id` (`String`, PK).
- `userId` (`String`, FK → `User.id`).
- `token` (`String`, `@unique`).
- `expiresAt` (`DateTime`).
- `used` (`Boolean`, default `false`).
- `createdAt` (`DateTime`, default `now()`).

---

### 18. Tabela `HourBankRecord`

**Model Prisma:** `HourBankRecord`

**Propósito:**  
Registros de banco de horas mensal por usuário.

**Campos principais:**
- `id` (`String`, PK).
- `month` (`Int`) → mês (1–12).
- `year` (`Int`) → ano (ex.: 2026).
- `horasPrevistas` (`Float`) → total de horas esperadas no mês.
- `horasTrabalhadas` (`Float`) → total de horas efetivamente apontadas.
- `horasComplementares?` (`Float?`) → ajustes adicionais.
- `observacao?` (`String?`).
- `userId` (`String`, FK → `User.id`).
- `createdAt`, `updatedAt`.

**Índice/constraint:**  
- `@@unique([userId, month, year])` → um único registro por usuário/mês/ano.

---

### 19. Resumo das principais relações (alto nível)

- **Tenant**
  - 1 Tenant → N Users, N Clients, N Activities.
- **User**
  - pertence a 1 Tenant.
  - 1 User → N Projects (como criador).
  - 1 User → N TimeEntries.
  - 1 User → N TicketHistory, TicketComments, TicketAttachments, HourBankRecords.
- **Client**
  - pertence a 1 Tenant.
  - 1 Client → N Projects, N ClientContacts, N ClientUsers.
- **Project**
  - pertence a 1 Client.
  - 1 Project → N Tickets, N TimeEntries, N ProjectResponsibles, N TimeEntryPermissionRequests.
- **Ticket**
  - pertence a 1 Project.
  - pode ter 1 Ticket pai (`parentTicket`) e N filhos (`childTickets`).
  - 1 Ticket → N TimeEntries, N TicketComments, N TicketHistory, N TicketAttachments, N TicketResponsibles.
- **TimeEntry**
  - pertence a 1 User e 1 Project; opcionalmente a 1 Ticket e 1 Activity.
- **TimeEntryPermissionRequest**
  - pertence a 1 User e 1 Project; opcionalmente a 1 Ticket e 1 Activity.
- **HourBankRecord**
  - pertence a 1 User (único por mês/ano).

Este documento deve servir como referência rápida para entender o modelo de dados atual do FLOWA e o relacionamento entre as entidades principais ao trabalhar com backend, relatórios, migrações ou integrações.*** End Patch```} ***!
