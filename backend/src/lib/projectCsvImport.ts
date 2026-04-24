import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** Maior código puramente numérico (chamados/tarefas; ignora tópicos e formatos não numéricos). */
export function maxNumericTaskCode(codes: Iterable<string>): number {
  let max = 0;
  for (const code of codes) {
    const s = String(code).trim();
    if (!/^\d+$/.test(s)) continue;
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

async function allocateTopicInternalCode(
  tenantId: string,
  ticket: PrismaClient["ticket"],
): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = `tp_${randomBytes(10).toString("hex")}`;
    const clash = await ticket.findFirst({
      where: {
        code,
        project: { client: { tenantId } },
      },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return `tp_${randomBytes(14).toString("hex")}`;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Parser CSV mínimo com suporte a campos entre aspas. */
export function parseCsvRows(raw: string, separator: ";" | ","): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    if (c === separator) {
      row.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

export function detectCsvSeparator(firstLine: string): ";" | "," {
  const sc = (firstLine.match(/;/g) ?? []).length;
  const cc = (firstLine.match(/,/g) ?? []).length;
  return sc >= cc ? ";" : ",";
}

function normalizeHeader(h: string): string {
  return stripAccents(String(h ?? "").trim().toLowerCase())
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Mapeia cabeçalhos PT/EN e variações para chaves canônicas. */
function resolveCanonicalKey(normalized: string): string | null {
  const aliases: Record<string, string> = {
    topico_identificador: "topico_identificador",
    identificador_topico: "topico_identificador",
    identificadordotopic: "topico_identificador",
    identificador_do_topico: "topico_identificador",
    identificadorlogico: "topico_identificador",
    identificador_logic: "topico_identificador",
    identificadorlogicodotopico: "topico_identificador",
    id_topico: "topico_identificador",
    topico_nome: "topico_nome",
    nome_topico: "topico_nome",
    nomedotopic: "topico_nome",
    nome_do_topico: "topico_nome",
    topico_orcado_horas: "topico_orcado_horas",
    orcado_horas: "topico_orcado_horas",
    orcado_horas_topico: "topico_orcado_horas",
    orcadohours: "topico_orcado_horas",
    tarefa_nome: "tarefa_nome",
    nome_tarefa: "tarefa_nome",
    nome_da_tarefa: "tarefa_nome",
    nomedatarefa: "tarefa_nome",
    membros: "membros",
    horas: "horas",
    numero_horas: "horas",
    numerodehoras: "horas",
    prioridade: "prioridade",
    data_inicio: "data_inicio",
    data_de_inicio: "data_inicio",
    datadeinicio: "data_inicio",
    data_entrega: "data_entrega",
    data_de_entrega: "data_entrega",
    datadeentrega: "data_entrega",
    descricao: "descricao",
    descricao_tarefa: "descricao",
  };
  return aliases[normalized] ?? null;
}

export type CsvImportLineError = { line: number; message: string };

function parseFlexibleNumber(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDatePt(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00.000Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizePriority(raw: string): "BAIXA" | "MEDIA" | "ALTA" | "URGENTE" | null {
  const v = stripAccents(String(raw ?? "").trim().toUpperCase());
  if (!v) return null;
  if (v === "BAIXA") return "BAIXA";
  if (v === "MEDIA") return "MEDIA";
  if (v === "ALTA") return "ALTA";
  if (v === "URGENTE" || v === "URGENT") return "URGENTE";
  return null;
}

/** AMS: prioridade interna para SLA (Urgente → CRITICA). */
function toAmsCrit(p: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE"): "BAIXA" | "MEDIA" | "ALTA" | "CRITICA" {
  if (p === "URGENTE") return "CRITICA";
  return p;
}

const TOPIC_TITLE_RE = /^[\p{L}\p{N}\s._\-]+$/u;
const TOPIC_REF_RE = /^[A-Za-z0-9._\-]+$/;

function validateTopicTitle(title: string): string | null {
  const t = title.trim();
  if (!t) return "Nome do tópico é obrigatório.";
  if (!TOPIC_TITLE_RE.test(t)) return "Nome do tópico: use apenas letras, números e espaços (e . _ -).";
  return null;
}

function validateTopicRef(ref: string): string | null {
  const t = ref.trim();
  if (!t) return "Identificador do tópico é obrigatório.";
  if (!TOPIC_REF_RE.test(t)) return "Identificador do tópico: use apenas letras, números, hífen, ponto e sublinhado.";
  return null;
}

export type ProjectCsvImportOutcome =
  | { ok: true; topicsCreated: number; tasksCreated: number }
  | { ok: false; errors: CsvImportLineError[] };

type ParsedRow = {
  line: number;
  topico_identificador: string;
  topico_nome: string;
  topico_orcado_horas: number | null;
  tarefa_nome: string;
  membrosRaw: string;
  memberIds: string[];
  horas: number | null;
  prioridadeRaw: string;
  data_inicio: string;
  data_entrega: string;
  descricao: string;
};

export async function importProjectTicketsFromCsv(params: {
  prisma: PrismaClient;
  tenantId: string;
  userId: string;
  projectId: string;
  csvText: string;
  maxRows?: number;
}): Promise<ProjectCsvImportOutcome> {
  const { prisma, tenantId, userId, projectId, csvText } = params;
  const maxRows = params.maxRows ?? 500;
  const errors: CsvImportLineError[] = [];

  const text = String(csvText ?? "").trim();
  if (!text) {
    return { ok: false, errors: [{ line: 1, message: "Arquivo CSV vazio." }] };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { ok: false, errors: [{ line: 1, message: "CSV deve ter cabeçalho e ao menos uma linha de dados." }] };
  }

  const sep = detectCsvSeparator(lines[0]!);
  const matrix = parseCsvRows(text, sep);
  if (matrix.length < 2) {
    return { ok: false, errors: [{ line: 1, message: "Não foi possível ler linhas do CSV." }] };
  }

  const headerCells = matrix[0]!.map((c) => normalizeHeader(c));
  const colIndex = new Map<string, number>();
  for (let i = 0; i < headerCells.length; i++) {
    const key = resolveCanonicalKey(headerCells[i]!);
    if (key && !colIndex.has(key)) colIndex.set(key, i);
  }

  const required = ["topico_identificador", "topico_nome", "tarefa_nome", "data_entrega"] as const;
  for (const k of required) {
    if (!colIndex.has(k)) {
      errors.push({
        line: 1,
        message: `Cabeçalho obrigatório ausente para "${k}". Inclua colunas equivalentes (ex.: identificador do tópico, nome do tópico, nome da tarefa, data de entrega).`,
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  const getCell = (row: string[], key: string): string => {
    const idx = colIndex.get(key);
    if (idx == null || idx < 0 || idx >= row.length) return "";
    return String(row[idx] ?? "").trim();
  };

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const nameLowerToIds = new Map<string, string[]>();
  for (const u of users) {
    const k = u.name.trim().toLowerCase();
    if (!nameLowerToIds.has(k)) nameLowerToIds.set(k, []);
    nameLowerToIds.get(k)!.push(u.id);
  }

  function resolveMemberIds(raw: string, line: number): string[] | "err" {
    const parts = raw
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return [];
    const ids: string[] = [];
    for (const p of parts) {
      const key = p.toLowerCase();
      const hits = nameLowerToIds.get(key) ?? [];
      if (hits.length === 0) {
        errors.push({ line, message: `Membro não encontrado: "${p}". Use o nome exatamente como cadastrado.` });
        return "err";
      }
      if (hits.length > 1) {
        errors.push({ line, message: `Membro ambíguo: "${p}" (há mais de um usuário com o mesmo nome).` });
        return "err";
      }
      ids.push(hits[0]!);
    }
    return [...new Set(ids)];
  }

  const parsed: ParsedRow[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const lineNum = r + 1;
    if (parsed.length >= maxRows) {
      errors.push({ line: lineNum, message: `Limite de ${maxRows} linhas de dados excedido.` });
      break;
    }
    const row = matrix[r] ?? [];
    const topico_identificador = getCell(row, "topico_identificador");
    const topico_nome = getCell(row, "topico_nome");
    const tarefa_nome = getCell(row, "tarefa_nome");
    const data_entrega = getCell(row, "data_entrega");
    const data_inicio = getCell(row, "data_inicio");
    const membrosRaw = getCell(row, "membros");
    const prioridadeRaw = getCell(row, "prioridade");
    const descricao = getCell(row, "descricao");
    const orcRaw = getCell(row, "topico_orcado_horas");
    const horasRaw = getCell(row, "horas");

    const errRef = validateTopicRef(topico_identificador);
    if (errRef) errors.push({ line: lineNum, message: errRef });
    const errTitle = validateTopicTitle(topico_nome);
    if (errTitle) errors.push({ line: lineNum, message: errTitle });
    if (!tarefa_nome.trim()) errors.push({ line: lineNum, message: "Nome da tarefa é obrigatório." });

    let topico_orcado_horas: number | null = null;
    if (orcRaw !== "") {
      const n = parseFlexibleNumber(orcRaw);
      if (n == null || n < 0) {
        errors.push({ line: lineNum, message: "Orçado horas do tópico deve ser um número válido (≥ 0)." });
      } else {
        topico_orcado_horas = n;
      }
    }

    let horas: number | null = null;
    if (horasRaw !== "") {
      const n = parseFlexibleNumber(horasRaw);
      if (n == null || n < 0) {
        errors.push({ line: lineNum, message: "Horas da tarefa deve ser um número válido (≥ 0)." });
      } else {
        horas = n;
      }
    }

    if (!data_entrega) errors.push({ line: lineNum, message: "Data de entrega é obrigatória." });
    const dEnd = data_entrega ? parseDatePt(data_entrega) : null;
    if (data_entrega && !dEnd) errors.push({ line: lineNum, message: "Data de entrega inválida. Use DD/MM/AAAA ou AAAA-MM-DD." });

    if (data_inicio) {
      const dStart = parseDatePt(data_inicio);
      if (!dStart) errors.push({ line: lineNum, message: "Data de início inválida. Use DD/MM/AAAA ou AAAA-MM-DD." });
    }

    if (prioridadeRaw.trim()) {
      const p = normalizePriority(prioridadeRaw);
      if (!p) errors.push({ line: lineNum, message: "Prioridade inválida. Use: baixa, média, alta ou urgente." });
    }

    let memberIds: string[] = [];
    if (membrosRaw.trim()) {
      const mr = resolveMemberIds(membrosRaw, lineNum);
      if (mr === "err") memberIds = [];
      else memberIds = mr;
    }

    parsed.push({
      line: lineNum,
      topico_identificador: topico_identificador.trim(),
      topico_nome: topico_nome.trim(),
      topico_orcado_horas,
      tarefa_nome: tarefa_nome.trim(),
      membrosRaw,
      memberIds,
      horas,
      prioridadeRaw,
      data_inicio,
      data_entrega,
      descricao,
    });
  }

  if (errors.length) return { ok: false, errors };

  /** Consistência: mesmo identificador → mesmo nome e mesmo orçado. */
  const byRef = new Map<string, { nome: string; orcado: number | null; lines: number[] }>();
  for (const row of parsed) {
    const id = row.topico_identificador;
    const hit = byRef.get(id);
    if (!hit) {
      byRef.set(id, { nome: row.topico_nome, orcado: row.topico_orcado_horas, lines: [row.line] });
    } else {
      hit.lines.push(row.line);
      if (hit.nome !== row.topico_nome) {
        errors.push({
          line: row.line,
          message: `O identificador "${id}" está associado a nomes de tópico diferentes ("${hit.nome}" vs "${row.topico_nome}").`,
        });
      }
      const a = hit.orcado;
      const b = row.topico_orcado_horas;
      if (a !== b && !(a == null && b == null)) {
        errors.push({
          line: row.line,
          message: `Orçado horas do tópico "${id}" diverge entre linhas.`,
        });
      }
    }
  }

  const nomeToRefs = new Map<string, Set<string>>();
  for (const [ref, v] of byRef) {
    const key = v.nome.toLowerCase();
    if (!nomeToRefs.has(key)) nomeToRefs.set(key, new Set());
    nomeToRefs.get(key)!.add(ref);
  }
  for (const [nomeKey, refs] of nomeToRefs) {
    if (refs.size > 1) {
      const firstRef = [...refs][0]!;
      const sampleLine = parsed.find((p) => p.topico_identificador === firstRef)?.line ?? 2;
      errors.push({
        line: sampleLine,
        message: `O nome de tópico "${byRef.get(firstRef)?.nome ?? nomeKey}" foi usado com identificadores diferentes (${[...refs].join(", ")}). O nome do tópico deve ser único no arquivo.`,
      });
    }
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId } },
    select: { id: true, tipoProjeto: true, statusInicial: true },
  });
  if (!project) {
    return { ok: false, errors: [{ line: 1, message: "Projeto não encontrado." }] };
  }

  const stRaw = String((project as { statusInicial?: string }).statusInicial ?? "").toUpperCase();
  const st =
    stRaw === "ATIVO" || stRaw === "ENCERRADO" || stRaw === "EM_ESPERA"
      ? stRaw
      : stRaw === "EM_ANDAMENTO"
        ? "ATIVO"
        : stRaw === "PLANEJADO"
          ? "EM_ESPERA"
          : stRaw === "CONCLUIDO"
            ? "ENCERRADO"
            : stRaw;
  if (st === "ENCERRADO") {
    return { ok: false, errors: [{ line: 1, message: "Não é possível importar: o projeto está encerrado." }] };
  }

  const isAms = project.tipoProjeto === "AMS";

  for (const row of parsed) {
    if (isAms && !row.prioridadeRaw.trim()) {
      errors.push({ line: row.line, message: "Prioridade é obrigatória para tarefas em projetos AMS." });
    }
  }
  if (errors.length) return { ok: false, errors };

  for (const [, v] of byRef) {
    const exists = await prisma.ticket.findFirst({
      where: {
        projectId,
        type: "SUBPROJETO",
        title: { equals: v.nome, mode: "insensitive" },
      },
      select: { id: true, title: true },
    });
    if (exists) {
      errors.push({
        line: v.lines[0]!,
        message: `Já existe um tópico com o nome "${exists.title}" neste projeto. Ajuste o CSV ou renomeie o tópico existente.`,
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  const tenantTicketScope = { project: { client: { tenantId } } };
  const taskRows = await prisma.ticket.findMany({
    where: { ...tenantTicketScope, type: { not: "SUBPROJETO" } },
    select: { code: true },
  });
  let nextCode = maxNumericTaskCode(taskRows.map((r) => r.code)) + 1;

  const projectSla = await prisma.project.findFirst({
    where: { id: projectId },
    select: {
      slaRespostaBaixa: true,
      slaRespostaMedia: true,
      slaRespostaAlta: true,
      slaRespostaCritica: true,
      slaSolucaoBaixa: true,
      slaSolucaoMedia: true,
      slaSolucaoAlta: true,
      slaSolucaoCritica: true,
    },
  });

  function pickSla(
    crit: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA",
    kind: "resposta" | "solucao",
  ): number | null {
    if (!projectSla) return null;
    if (kind === "resposta") {
      if (crit === "BAIXA") return projectSla.slaRespostaBaixa != null ? Number(projectSla.slaRespostaBaixa) : null;
      if (crit === "MEDIA") return projectSla.slaRespostaMedia != null ? Number(projectSla.slaRespostaMedia) : null;
      if (crit === "ALTA") return projectSla.slaRespostaAlta != null ? Number(projectSla.slaRespostaAlta) : null;
      return projectSla.slaRespostaCritica != null ? Number(projectSla.slaRespostaCritica) : null;
    }
    if (crit === "BAIXA") return projectSla.slaSolucaoBaixa != null ? Number(projectSla.slaSolucaoBaixa) : null;
    if (crit === "MEDIA") return projectSla.slaSolucaoMedia != null ? Number(projectSla.slaSolucaoMedia) : null;
    if (crit === "ALTA") return projectSla.slaSolucaoAlta != null ? Number(projectSla.slaSolucaoAlta) : null;
    return projectSla.slaSolucaoCritica != null ? Number(projectSla.slaSolucaoCritica) : null;
  }

  let topicsCreated = 0;
  let tasksCreated = 0;

  await prisma.$transaction(async (tx) => {
    const topicIdByRef = new Map<string, string>();

    for (const [ref, meta] of byRef) {
      const topicCode = await allocateTopicInternalCode(tenantId, tx.ticket);
      const topic = await tx.ticket.create({
        data: {
          code: topicCode,
          title: meta.nome,
          description: null,
          type: "SUBPROJETO",
          criticidade: null,
          status: "ABERTO",
          projectId,
          parentTicketId: null,
          createdById: userId,
          assignedToId: null,
          estimativaHoras: meta.orcado,
          dataFimPrevista: null,
          dataInicio: null,
          slaRespostaHoras: null,
          slaSolucaoHoras: null,
        },
      });
      topicIdByRef.set(ref, topic.id);
      topicsCreated += 1;

      await tx.ticketHistory.create({
        data: {
          ticketId: topic.id,
          userId,
          action: "CREATE",
          field: null,
          oldValue: null,
          newValue: null,
          details: `Tópico criado (importação CSV): "${topic.title}"`,
        },
      });
    }

    for (const row of parsed) {
      const parentId = topicIdByRef.get(row.topico_identificador);
      if (!parentId) throw new Error(`Tópico não resolvido: ${row.topico_identificador}`);

      const dEnd = parseDatePt(row.data_entrega)!;
      const dStart = row.data_inicio ? parseDatePt(row.data_inicio) : null;

      const prioUi = row.prioridadeRaw.trim() ? normalizePriority(row.prioridadeRaw)! : null;
      const amsCritForSla = isAms && prioUi ? toAmsCrit(prioUi) : null;
      const criticidadeDb = isAms && prioUi ? toAmsCrit(prioUi) : prioUi;
      const slaRespostaHoras = amsCritForSla ? pickSla(amsCritForSla, "resposta") : null;
      const slaSolucaoHoras = amsCritForSla ? pickSla(amsCritForSla, "solucao") : null;

      const code = String(nextCode++);
      const ticket = await tx.ticket.create({
        data: {
          code,
          title: row.tarefa_nome,
          description: row.descricao ? row.descricao.trim() : null,
          type: "Tarefa",
          criticidade: criticidadeDb,
          status: "ABERTO",
          projectId,
          parentTicketId: parentId,
          createdById: userId,
          assignedToId: row.memberIds.length > 0 ? row.memberIds[0]! : null,
          estimativaHoras: row.horas,
          dataFimPrevista: dEnd,
          dataInicio: dStart,
          slaRespostaHoras,
          slaSolucaoHoras,
        },
      });
      tasksCreated += 1;

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          userId,
          action: "CREATE",
          field: null,
          oldValue: null,
          newValue: null,
          details: `Tarefa criada (importação CSV): "${ticket.title}"`,
        },
      });

      if (row.memberIds.length > 0) {
        await tx.ticketResponsible.createMany({
          data: row.memberIds.map((uid) => ({ ticketId: ticket.id, userId: uid })),
          skipDuplicates: true,
        });
      }
    }
  });

  return { ok: true, topicsCreated, tasksCreated };
}
