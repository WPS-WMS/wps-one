## Práticas de programação usadas no projeto (para estudo)

Este documento é um guia de estudo com as práticas que usamos para manter o sistema estável, evolutivo e mais seguro.

---

### 1) Organização e responsabilidade por camada

- **Frontend**
  - UI e interação (components/pages)
  - Chamar a API via `apiFetch` / `apiFetchBlob`
  - Tratamento de estado local, loading, erros e UX
- **Backend**
  - Autenticação e autorização (JWT/cookies + permissões)
  - Regras de negócio (ex.: quem pode ver um ticket)
  - Persistência via Prisma
  - Auditoria e histórico (ex.: `TicketHistory`)
- **Banco**
  - Modelagem relacional
  - Índices e integridade referencial (FK, cascade quando fizer sentido)

---

### 2) Boas práticas de API (backend)

- **Validar entrada sempre**
  - tipos, formatos, limites (tamanho de arquivo, texto mínimo etc.)
- **Autorização “por recurso”, não só por tela**
  - não basta “ser admin”; tem que confirmar tenant e acesso ao registro
- **Erros previsíveis**
  - `400` (validação), `401` (sem login), `403` (sem permissão), `404` (não existe)
- **Defesa em profundidade**
  - checar `tenantId` mesmo quando a UI “já garante”

---

### 3) Multi-tenant (padrões práticos)

- Preferir buscar registros com `where` que inclua tenant (direto ou via relação).
- Se for `findUnique({ where: { id } })`, **sempre** confirme `tenantId` (ou use `findFirst` com `tenantId`).
- Evitar endpoints que aceitam IDs de outros tenants sem checagem.

---

### 4) Uploads e arquivos

- Guardar no banco apenas o **caminho público** (ex.: `/uploads/...`) e metadados (tipo, tamanho).
- Validar:
  - extensão permitida
  - mime type efetivo
  - tamanho máximo
- Preferir rotas autenticadas para downloads de arquivos sensíveis.

---

### 5) Segurança no frontend (práticas reais)

- **Não confiar em HTML vindo do banco**
  - sanitização no backend e também no client (defesa em profundidade)
- **Evitar token em localStorage quando possível**
  - cookie HttpOnly reduz impacto de XSS
- **CSP no hosting**
  - reduz a chance de execução de scripts injetados

---

### 6) Qualidade e manutenção

- Commits pequenos e descritivos (fáceis de reverter).
- Sempre rodar typecheck (`npx tsc --noEmit`) depois de mudanças maiores.
- Mudanças de segurança:
  - preferir “modo compatível” (não quebrar clientes)
  - migrar por fases e medir impacto

---

### 7) Como estudar isso (roteiro)

- Estude primeiro:
  - HTTP (requests, status codes)
  - JWT e cookies HttpOnly (diferenças e riscos)
  - CORS (o que é e o que não é)
  - XSS e sanitização (por que regex falha)
- Depois:
  - modelagem relacional (PK/FK, índices, cardinalidade)
  - padrões de autorização (RBAC/ABAC, “resource-based authorization”)

