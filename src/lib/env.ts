import fs from "node:fs";
import path from "node:path";

/** Carga .env en process.env para los scripts de CLI (Next.js ya lo hace solo). */
export function cargarEnv(archivo = ".env") {
  const ruta = path.join(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let valor = m[2];
    if (/^(['"]).*\1$/.test(valor)) valor = valor.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}
