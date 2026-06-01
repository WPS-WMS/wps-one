import { execSync } from "child_process";
import fs from "fs";

const p = "frontend/src/app/consultor/reembolsos/ReembolsosClient.tsx";
let s = execSync(`git show 1a8bd180:${p}`).toString("utf8");

s = s.replace(
  'type ReimbursementStatus = "IN_PROGRESS" | "REJECTED" | "PAID";\n\ntype Reimbursement = {',
  'type ReimbursementStatus = "IN_PROGRESS" | "REJECTED" | "PAID";\ntype PaymentTo = "EMPRESA" | "CONSULTOR";\n\ntype Reimbursement = {',
);
s = s.replace(
  "  description: string;\n  status: ReimbursementStatus;",
  "  description: string;\n  paymentTo?: PaymentTo | null;\n  status: ReimbursementStatus;",
);
s = s.replace(
  `function statusLabel(s: ReimbursementStatus) {
  if (s === "IN_PROGRESS") return "Em andamento";
  if (s === "REJECTED") return "Rejeitado";
  return "Pago";
}
`,
  `function statusLabel(s: ReimbursementStatus) {
  if (s === "IN_PROGRESS") return "Em andamento";
  if (s === "REJECTED") return "Rejeitado";
  return "Pago";
}

function paymentToLabel(value: PaymentTo | string | null | undefined): string {
  if (value === "EMPRESA") return "Empresa";
  if (value === "CONSULTOR") return "Consultor";
  return "\u2014";
}
`,
);
s = s.replace(
  '  const [description, setDescription] = useState("");\n  const [attachments, setAttachments]',
  '  const [description, setDescription] = useState("");\n  const [paymentTo, setPaymentTo] = useState<PaymentTo | "">("");\n  const [attachments, setAttachments]',
);
s = s.replace(
  "      description.trim().length > 0 &&\n      totalAttachmentsCount > 0 &&",
  '      description.trim().length > 0 &&\n      (paymentTo === "EMPRESA" || paymentTo === "CONSULTOR") &&\n      totalAttachmentsCount > 0 &&',
);
s = s.replace("    description,\n    totalAttachmentsCount,", "    description,\n    paymentTo,\n    totalAttachmentsCount,");
s = s.replace('    setDescription("");\n    setAttachments([]);', '    setDescription("");\n    setPaymentTo("");\n    setAttachments([]);');
s = s.replace(
  "    setDescription(r.description);\n    setAttachments([]);",
  '    setDescription(r.description);\n    const pt = r.paymentTo;\n    setPaymentTo(pt === "EMPRESA" || pt === "CONSULTOR" ? pt : "");\n    setAttachments([]);',
);
s = s.replace("        description,\n        attachments,", "        description,\n        paymentTo,\n        attachments,");

const fieldsetClean = `
          <fieldset className="md:col-span-2">
            <legend className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-2">
              Pagamento para <span className="text-red-600">*</span>
            </legend>
            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={paymentTo === "EMPRESA"}
                  onChange={() => setPaymentTo("EMPRESA")}
                  className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                />
                Empresa
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={paymentTo === "CONSULTOR"}
                  onChange={() => setPaymentTo("CONSULTOR")}
                  className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary)]/30"
                />
                Consultor
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-[color:var(--muted-foreground)]">
              Indique quem receber\u00e1 o pagamento deste reembolso (apenas uma op\u00e7\u00e3o).
            </p>
          </fieldset>

`;

const anchorReal =
  '          <div className="md:col-span-2">\n            <div className="flex items-center justify-between">\n              <div className="min-w-0">';
const pos = s.indexOf(anchorReal);
if (pos < 0) {
  console.error("anchor not found");
  process.exit(1);
}
const insertAt = s.lastIndexOf("          </label>\n\n", pos);
if (insertAt < 0) {
  console.error("insert point not found");
  process.exit(1);
}
s = s.slice(0, insertAt + "          </label>\n\n".length) + fieldsetClean + s.slice(insertAt + "          </label>\n\n".length);

s = s.replace(
  '<p className="text-xs text-[color:var(--foreground)]/85 mt-1">{r.description}</p>',
  `<p className="text-xs text-[color:var(--foreground)]/85 mt-1">{r.description}</p>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                        Pagamento para: {paymentToLabel(r.paymentTo)}
                      </p>`,
);

fs.writeFileSync(p, s, "utf8");
console.log("OK", s.includes("fieldset"), s.includes("Descri\u00e7\u00e3o"));
