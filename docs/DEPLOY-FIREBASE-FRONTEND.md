# Passo a passo: publicar o frontend no Firebase Hosting (FREE)

Este guia é para colocar o **frontend (Next.js)** no ar usando o **Firebase Hosting gratuito**.

> Este projeto foi ajustado para **exportar estático** (`output: "export"`), gerando a pasta `frontend/out`.

---

## Pré-requisitos

- Ter acesso ao **projeto do Firebase** (pelo menos permissão de Deploy/Editor).
- Node.js instalado (18+).
- Firebase CLI instalado:

```bash
npm install -g firebase-tools
```

---

## 1. Login no Firebase

No terminal:

```bash
firebase login
```

---

## 2. Entrar na pasta do frontend

O deploy do Hosting foi configurado para rodar a partir da pasta `frontend`.

```bash
cd frontend
```

---

## 3. Conferir projeto do Firebase selecionado

Este repositório já tem `frontend/.firebaserc` apontando para o projeto default:

- `frontend/.firebaserc` → `projects.default = "wps-flowa"`

Para confirmar qual projeto está selecionado:

```bash
firebase projects:list
firebase use
```

Se precisar trocar o projeto:

```bash
firebase use --add
```

---

## 4. Definir a URL do backend (obrigatório para produção)

O frontend chama a API usando a variável `NEXT_PUBLIC_API_URL`.

### 4.1. Obter a URL do backend

Exemplo (Railway):
- URL do serviço: `https://SEU-BACKEND.up.railway.app`
- Teste rápido: `https://SEU-BACKEND.up.railway.app/health` deve retornar `{ "ok": true }`

### 4.2. Fazer o build do frontend com a URL

No **PowerShell (Windows)**:

```powershell
$env:NEXT_PUBLIC_API_URL="https://SEU-BACKEND.up.railway.app"
npm run build
```

No **cmd.exe**:

```bat
set NEXT_PUBLIC_API_URL=https://SEU-BACKEND.up.railway.app
npm run build
```

No **bash** (Git Bash/WSL/macOS/Linux):

```bash
NEXT_PUBLIC_API_URL="https://SEU-BACKEND.up.railway.app" npm run build
```

✅ Ao final do build, deve existir a pasta `frontend/out`.

---

## 5. Conferir configuração do Hosting

O arquivo usado no deploy é:

- `frontend/firebase.json`

Pontos importantes:
- `public` está como `out`
- existem **rewrites** para rotas com IDs (ex.: `/admin/projetos/:id/...`)

> Se alguém marcar “SPA rewrite para /index.html” no `firebase init`, isso quebra rotas do Next exportado.

---

## 6. Deploy no Firebase Hosting

Na pasta `frontend`:

```bash
firebase deploy
```

Ao final, o Firebase mostrará URLs como:
- `https://wps-flowa.web.app`
- `https://wps-flowa.firebaseapp.com`

---

## 7. Ajustar CORS no backend (para o site funcionar)

Depois do frontend no ar, o backend precisa permitir a origem do Firebase Hosting.

No ambiente do backend (ex.: Railway Variables), definir `CORS_ORIGIN` com a URL do front, por exemplo:

```text
CORS_ORIGIN=https://wps-flowa.web.app,http://localhost:3000
```

Depois disso, redeploy/restart do backend.

---

## Troubleshooting (problemas comuns)

### A) Front abre, mas dá erro ao logar / buscar dados (network/CORS)

- Verifique se `NEXT_PUBLIC_API_URL` no build aponta para a URL correta do backend.
- Verifique se o backend está online em `/health`.
- Verifique se `CORS_ORIGIN` no backend contém exatamente a URL do front (sem barra final).

### B) Abrir link direto com ID dá 404 (ex.: `/admin/projetos/abc/kanban`)

- Isso é resolvido pelos **rewrites** em `frontend/firebase.json`.
- Confirme que o deploy foi feito a partir da pasta `frontend` e que `public` está como `out`.

### C) `firebase deploy` pede GitHub workflow

- Responda **não** (No). Deploy automático não é necessário e costuma exigir permissão de organização no GitHub.

---

## Checklist final

- [ ] Backend publicado e respondendo em `/health`
- [ ] Build do frontend feito com `NEXT_PUBLIC_API_URL` correto
- [ ] `frontend/out` gerado
- [ ] `firebase deploy` executado dentro da pasta `frontend`
- [ ] `CORS_ORIGIN` no backend inclui `https://SEU-PROJETO.web.app`

