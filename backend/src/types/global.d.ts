import type { Request as ExpressRequest } from "express";

declare global {
  // Muitos arquivos do backend usam o identificador `Request` sem importar de `express`.
  // Isso faz o TypeScript cair no `Request` global (Fetch API) e quebra o build.
  // Este alias garante que `Request` aponte para `express.Request`.
  type Request = ExpressRequest;
}

export {};

