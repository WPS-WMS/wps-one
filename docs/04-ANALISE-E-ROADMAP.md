## Análise do sistema + roadmap de melhorias (segurança, qualidade e IA)

Este documento é um guia para você estudar e evoluir o sistema com segurança. Ele lista riscos, por que importam e como melhorar por etapas.

---

### 1) O que já está bom (bases sólidas)

- **Arquitetura separada** (frontend/back/banco) facilita escalar e manter.
- **Prisma + Postgres** dá consistência e modelagem clara.
- **Multi-tenant** implementado por `tenantId` nas rotas.
- **Rotas autenticadas** para PDFs/anexos sensíveis (já existe para portal/tickets/proposta).

---

### 2) Principais riscos (o “porquê” por trás das decisões)

#### 2.1 XSS (HTML em comentários)

- Comentários são HTML e renderizados no frontend.
- Se entrar HTML malicioso, ele roda no browser do usuário.
- Mitigações típicas:
  - sanitizar no backend com allowlist
  - sanitizar no client (defesa em profundidade)
  - CSP forte no hosting
  - preferir Markdown seguro no futuro

#### 2.2 Arquivos “públicos demais”

- Se arquivos ficarem acessíveis via URL pública, qualquer vazamento de link vira vazamento de dados.
- Mitigações:
  - downloads por rotas autenticadas
  - restringir `/uploads` público
  - (futuro) usar storage com URLs assinadas

#### 2.3 Segredos e configuração

- Se `JWT_SECRET` estiver fraco ou ausente em produção, é risco crítico.
- Mitigação: falhar o boot em produção se env estiver insegura (fail-fast).

---

### 3) Melhorias futuras (priorizadas por impacto)

#### 3.1 Segurança (curto prazo)

- **Reduzir superfície do `/uploads`** ainda mais:
  - migrar todas as imagens do portal para carregamento autenticado (blob) ou URLs assinadas
  - remover qualquer exceção “pública” que não seja necessária
- **Rate limit por rota** (login, signup, uploads) com limites diferentes
- **Observabilidade segura**
  - logs estruturados
  - sem conteúdo sensível (tokens, base64, PII desnecessária)

#### 3.2 Segurança (médio prazo)

- **Sessão 100% em cookie HttpOnly**
  - remover compat com token em localStorage
  - adicionar rotação/revogação (ex.: `tokenVersion` no usuário)
- **Autorização centralizada**
  - helpers por recurso: “pode ver ticket?”, “pode baixar anexo?”, etc.
- **RLS real no Postgres**
  - usar role não-superuser para que RLS proteja mesmo se houver bug na app

#### 3.3 Qualidade (médio prazo)

- Testes de segurança “mínimos”
  - teste automatizado de tenant isolation em endpoints críticos
  - teste de upload/paths
- Documentar contratos de API (OpenAPI) para previsibilidade

---

### 4) Como usar IA (engenharia de IA) para evoluir o sistema

Se você quer estudar engenharia de IA “na prática”, use IA como:

- **Revisor de PR**: peça para listar riscos antes de deploy.
- **Gerador de testes**: “crie testes para garantir que tenantId nunca vaza”.
- **Assistente de refatoração**: reduzir duplicação, separar responsabilidades.
- **Modelagem de ameaças**: descrever “quem é o atacante”, “o que pode vazar”, “qual a pior consequência”.

Um prompt útil para você começar:

- “Leia esta rota e me diga: quais inputs entram, qual é a autorização necessária, onde pode haver IDOR/tenant leak, e como eu testo isso.”

---

### 5) Próximos estudos recomendados (roteiro)

- Web security básica: XSS, CSRF, SSRF, IDOR, CORS.
- Autorização: RBAC vs ABAC, resource-based access control.
- Cookies e sessão: HttpOnly, SameSite, Secure, domínio.
- Postgres: índices, constraints, RLS.
- Observabilidade: logging seguro e alertas.

