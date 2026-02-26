import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    user: {
      id: string;
      email?: string;
      name?: string;
      role: string;
      tenantId: string;
      cargo?: string | null;
      cargaHorariaSemanal?: number | null;
      permitirMaisHoras?: boolean;
      permitirFimDeSemana?: boolean;
      permitirOutroPeriodo?: boolean;
      diasPermitidos?: string | null;
      mustChangePassword?: boolean;
    };
  }
}

