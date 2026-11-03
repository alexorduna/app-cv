/** Lector y escritor CSV (RFC 4180) sin dependencias. Soporta comillas, saltos de línea y BOM. */

export function parsearCsv(texto: string, separador?: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const sep = separador ?? detectarSeparador(t);
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (enComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

function detectarSeparador(t: string): string {
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (c: string) => primera.split(c).length;
  if (cuenta("\t") > cuenta(",") && cuenta("\t") > 1) return "\t";
  if (cuenta(";") > cuenta(",") && cuenta(";") > 1) return ";";
  return ",";
}

/** Convierte filas CSV en objetos usando la primera fila como encabezados. */
export function csvAObjetos(texto: string): Record<string, string>[] {
  const filas = parsearCsv(texto);
  if (filas.length === 0) return [];
  const encabezados = filas[0].map((h) => h.trim());
  return filas.slice(1).map((f) => {
    const o: Record<string, string> = {};
    encabezados.forEach((h, i) => (o[h] = (f[i] ?? "").trim()));
    return o;
  });
}

function escaparCampo(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function generarCsv(encabezados: string[], filas: (string | number | null | undefined)[][]): string {
  return [encabezados, ...filas].map((f) => f.map(escaparCampo).join(",")).join("\r\n") + "\r\n";
}
