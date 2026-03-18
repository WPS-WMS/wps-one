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
      limiteHorasDiarias?: number | null;
      limiteHorasPorDia?: string | null;
      permitirMaisHoras?: boolean;
      permitirFimDeSemana?: boolean;
      permitirOutroPeriodo?: boolean;
      diasPermitidos?: string | null;
      mustChangePassword?: boolean;
      ativo?: boolean;
      inativadoEm?: Date | null;
    };
  }
}

