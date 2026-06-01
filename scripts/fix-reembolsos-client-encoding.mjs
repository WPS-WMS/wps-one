import { execSync } from "child_process";
import fs from "fs";

const p = "frontend/src/app/consultor/reembolsos/ReembolsosClient.tsx";

// Base: last commit with valid UTF-8
let s = execSync(`git show 636e4145:${p}`).toString("utf8");

// PATCH fix: do not send quantity/unitValueCents null for FIXO types
const oldPayload = `      } else {
        payloadBase.amountCents = amountCents;
        payloadBase.quantity = null;
        payloadBase.unitValueCents = null;
      }`;

const newPayload = `      } else {
        payloadBase.amountCents = amountCents;
      }`;

if (!s.includes(oldPayload)) {
  if (s.includes("payloadBase.amountCents = amountCents;\n      }")) {
    console.log("PATCH fix already applied");
  } else {
    console.error("payload block not found");
    process.exit(1);
  }
} else {
  s = s.replace(oldPayload, newPayload);
}

fs.writeFileSync(p, s, "utf8");

// strict validate
new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(p));
console.log("OK strict utf8", fs.statSync(p).size);
