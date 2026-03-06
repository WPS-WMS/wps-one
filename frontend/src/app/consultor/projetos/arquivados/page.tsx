"use client";

import { ProjetosArquivadosContent } from "@/components/ProjetosArquivadosContent";

// Consultor vê apenas projetos arquivados onde ele tem visibilidade
// (regra já aplicada pelo backend em /api/projects?arquivado=true).
export default function ProjetosArquivadosConsultorPage() {
  return <ProjetosArquivadosContent basePath="/consultor" />;
}

