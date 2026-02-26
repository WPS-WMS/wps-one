"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Link com prefetch desativado para evitar 404 de RSC no export estático (Firebase Hosting).
 * O cliente Next tenta buscar __next.*.txt com notação de ponto; no export os arquivos usam barra.
 */
export function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
