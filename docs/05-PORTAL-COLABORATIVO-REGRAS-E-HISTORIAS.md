## Portal Colaborativo — histórias de usuário e regras de negócio (estado atual)

Este documento descreve **como o Portal Colaborativo funciona hoje**, do ponto de vista de **histórias de usuário** e **regras de negócio**, baseado na implementação atual do frontend e backend.

---

### 1) Onde isso está no código

- **Frontend (UI do portal):** `frontend/src/components/PortalCollaborativeDashboard.tsx`
- **Componente de biblioteca de PDFs:** `frontend/src/components/PortalPdfLibrary.tsx`
- **Backend (API do portal):** `backend/src/routes/portal.ts`
- **Permissões:** `backend/src/lib/permissions.ts`

---

### 2) Permissões e perfis (quem pode ver / quem pode editar)

No sistema existem duas features principais do portal:

- **`portal.corporativo`**: permite **acessar e visualizar** o portal
  - Padrão (matriz default): `SUPER_ADMIN`, `ADMIN_PORTAL`, `GESTOR_PROJETOS`, `CONSULTOR` = allow; `CLIENTE` = deny
- **`portal.corporativo.editar`**: permite **criar/editar/excluir** conteúdo do portal
  - Padrão (matriz default): `SUPER_ADMIN`, `ADMIN_PORTAL` = allow; demais = deny

**Regra prática na UI:**
- Usuários sem `portal.corporativo.editar` veem o portal **somente leitura**.
- Usuários com `portal.corporativo.editar` veem botões de **gerenciar** e ações de edição (upload, editar nome, excluir etc.).

---

### 3) Estrutura do Portal (seções e slugs)

O portal organiza conteúdo por **seções** (`PortalSection`) e **itens** (`PortalItem`), com slugs estáveis:

- `noticias`
- `newsletter`
- `colaborador-do-mes` (WPSer do mês)
- `premios` (Pontos de Inspiração / pódio 1º/2º/3º)
- `manuais`
- `politica-despesa`
- `politica-lgpd`
- `documentos-rh`
- `institucional`
- `templates`
- `biblioteca`

Essas seções podem ser criadas automaticamente via:
- `POST /api/portal/bootstrap-sections` (somente `portal.corporativo.editar`)

---

### 4) Histórias de usuário (visão funcional)

#### 4.1 Acesso geral

- **Como usuário com acesso ao portal (`portal.corporativo`)**
  - Quero entrar no portal e ver as áreas “Empresa”, “Manuais”, “Templates” e “Biblioteca”
  - Para consultar informações e documentos internos do tenant.

- **Como usuário sem acesso (`portal.corporativo` negado)**
  - Não devo acessar a rota/tela do portal.

#### 4.2 Usuário leitor (sem editar)

- **Como usuário leitor**
  - Quero ver o carrossel de **Notícias**
  - Quero abrir PDF anexado a uma notícia (quando existir)
  - Quero ver **Agenda de eventos** e **Aniversariantes do mês**
  - Quero ver **WPSer do mês**
  - Quero ver o **Pódio** (1º/2º/3º) com foto/nome/cargo/pontos
  - Quero abrir PDFs em:
    - **Manuais**
    - **Templates**
    - **Biblioteca**
  - Sem conseguir editar nada.

#### 4.3 Usuário editor (SUPER_ADMIN / ADMIN_PORTAL com `portal.corporativo.editar`)

- **Como usuário editor**
  - Quero criar as seções padrão do portal com um clique (bootstrap)
  - Quero anexar/editar/excluir:
    - notícias (imagem + marcador + foco + PDF opcional)
    - newsletter
    - WPSer do mês (imagem única)
    - pódio (3 posições com foto + meta)
    - bibliotecas de PDFs (manuais/templates/biblioteca)
    - sub-seções administrativas (políticas e institucionais)
  - Para manter o conteúdo interno sempre atualizado.

---

### 5) Regras por área / seção (como funciona hoje)

> Terminologia: `PortalItem` tem `title`, `content`, `type`, `metadata`.

#### 5.1 Notícias (`noticias`)

- **Conteúdo principal**: `content` é uma **imagem** (URL /uploads, data URL ou link externo).
- **Ordenação**:
  - No backend, a seção “noticias” é ordenada por `createdAt` **asc** (a primeira anexada fica como primeira do carrossel).
  - Outras seções usam `createdAt` **desc**.
- **Metadados suportados (via `metadata`)**:
  - `marker` (marcador / texto de referência)
  - `focalX` / `focalY` (posicionamento do recorte da imagem em %)
  - `pdfUrl` (opcional): link/arquivo PDF relacionado à notícia
- **Abertura**:
  - Se houver `pdfUrl`, clicar na notícia abre o PDF em nova guia.
  - Caso contrário, abre o “lightbox” com a imagem.

#### 5.2 Newsletter (`newsletter`)

- Seção carregada como itens do portal.
- Na UI “Empresa” ela aparece como bloco/área do portal (dependendo do layout atual).
- Pode reutilizar o padrão de mídia do portal (upload via `/api/portal/media`).

#### 5.3 WPSer do mês (`colaborador-do-mes`)

- Tratado como **seção de imagem única** (modal simples de substituição).
- `content` guarda a imagem.
- O título padrão exibido na UI é “WPSer do mês”.

#### 5.4 Pontos de Inspiração / Pódio (`premios`)

- O pódio possui **3 posições** (rank 1/2/3).
- Cada posição é representada por um `PortalItem` do tipo `inspiration`:
  - `title` = nome do colaborador
  - `content` = URL da foto
  - `metadata` contém:
    - `rank` (1/2/3)
    - `points` (número)
    - `cargo` (texto)
- A UI consolida os itens por `rank`.

#### 5.5 Agenda e aniversariantes

- **Eventos:** `GET /api/portal/events?month=&year=` retorna eventos do mês.
- **Aniversariantes:** o backend consulta usuários do tenant:
  - filtra pelo mês (`extract(month from birthDate)`)
  - exclui `role = CLIENTE`
  - apenas usuários `ativo = true`

#### 5.6 Manuais / Templates / Biblioteca (bibliotecas de PDFs)

Essas telas usam o componente `PortalPdfLibrary`.

**Regra de leitura (todos os usuários com acesso ao portal):**
- Clicar no **título** abre o PDF em nova guia.

**Regra de edição (somente quem tem `portal.corporativo.editar`):**
- A lista fica em modo leitura, e cada linha tem um ícone de **lápis**.
- Ao clicar no lápis, abre o modo edição da linha com ações por ícone (tooltip no hover) na ordem:
  1) Substituir PDF
  2) Excluir
  3) Salvar (nome)
  4) Fechar edição (X)

**Criação de PDF:**
- Upload do arquivo: `POST /api/portal/media` (admin)
- Criação do item: `POST /api/portal/items` com:
  - `content` = `fileUrl` retornado
  - `type` = `"pdf"`

**Substituição/edição:**
- Substituir: `PATCH /api/portal/items/:id` (troca `content`)
- Renomear: `PATCH /api/portal/items/:id` (troca `title`)
- Excluir: `DELETE /api/portal/items/:id`

---

### 6) Regras de arquivos (uploads, links e segurança)

#### 6.1 Upload de mídia do portal

- Endpoint: `POST /api/portal/media` (somente editor)
- Permite:
  - imagens: `.png .jpg .jpeg .webp .gif`
  - PDF: `.pdf`
- Tamanho: máximo 15MB (validação no backend)
- Armazenamento em disco: `/uploads/portal/<tenantId>/<timestamp>-<safeName>`

#### 6.2 Download/autorização de arquivos do portal

- Endpoint autenticado: `GET /api/portal/items/:id/file`
  - `variant=content` (padrão): usa `item.content`
  - `variant=metadata`: usa `metadata.pdfUrl` (notícias)
- O backend valida que o arquivo está em `/uploads/portal/<tenantId>/...`.

#### 6.3 Exposição pública de `/uploads` (produção)

No backend, em produção, os uploads foram restringidos:
- `GET /uploads/users/**` permanece público (avatares)
- `GET /uploads/portal/**` só responde **imagens** (PDFs não)
- `GET /uploads/tickets/**` e `GET /uploads/projects/**` não são públicos

---

### 7) Regras de exclusão (o que acontece quando apaga conteúdo)

- Ao **editar** ou **excluir** um item do portal, o backend tenta remover o arquivo do disco (`unlink`) quando ele é um arquivo do tenant em `/uploads/portal/<tenantId>/...`.
- Isso significa que excluir um item de PDF/Imagem remove o arquivo do servidor (sem lixeira).

---

### 8) Observações e limitações (do estado atual)

- O portal depende das seções existirem. Para ambientes novos, o editor deve rodar o bootstrap das seções padrão.
- Ordem de notícias é especial (ascendente), para manter “primeira anexada” como destaque.
- PDFs e anexos sensíveis são preferencialmente servidos por rotas autenticadas.

