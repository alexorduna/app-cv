#!/usr/bin/env node
// npm run setup: pasos 2 a 5 (dependencias, .env, base de datos y datos). Sin dependencias externas.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.chdir(raiz);
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };

function paso(titulo, fn) {
  console.log(`\n▶ ${titulo}`);
  try {
    fn();
  } catch (e) {
    console.error(`\n✖ Falló: ${titulo}\n  ${e.message ?? e}`);
    console.error("  Revisa la sección \"Si algo falla\" del README.");
    process.exit(1);
  }
}

const mayor = Number(process.versions.node.split(".")[0]);
if (mayor < 20) {
  console.error(`✖ Necesitas Node 20 o superior (tienes ${process.versions.node}).\n  En Arch/EndeavourOS: sudo pacman -S nodejs npm base-devel python`);
  process.exit(1);
}

paso("Instalando dependencias", () => {
  // Si node_modules ya corresponde a este package-lock.json, no se reinstala (arranques rápidos y sin red).
  const marca = path.join("node_modules", ".chamba-lock");
  const huella = fs.existsSync("package-lock.json")
    ? createHash("sha256").update(fs.readFileSync("package-lock.json")).update(process.versions.modules).digest("hex")
    : null;
  if (huella && fs.existsSync(marca) && fs.readFileSync(marca, "utf8") === huella) {
    console.log("✔ Dependencias ya instaladas y al día");
    return;
  }
  const cmd = huella ? "npm ci --no-audit --no-fund" : "npm install --no-audit --no-fund";
  execSync(cmd, { stdio: "inherit", env });
  if (huella) fs.writeFileSync(marca, huella);
});

paso("Preparando .env", () => {
  if (fs.existsSync(".env")) console.log("✔ .env ya existe (no se toca)");
  else {
    fs.copyFileSync(".env.example", ".env");
    console.log("✔ .env creado desde .env.example (proveedor de IA: mock)");
  }
});

paso("Base de datos, migraciones e importación", () => {
  const tsx = path.join("node_modules", ".bin", "tsx");
  execSync(`"${tsx}" scripts/preparar.ts`, { stdio: "inherit", env });
});

console.log("\n✔ Listo. Arranca con: npm run dev  (o ./start.sh)");
