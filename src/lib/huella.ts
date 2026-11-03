import { createHash } from "node:crypto";
import { normalizar } from "./texto";

const PARAMS_RASTREO = /^(utm_.*|ref|referrer|source|src|gh_src|lever-source|lever-origin|trk|trackingid|refid|fbclid|gclid|mc_cid|mc_eid|ashby_source|_hs.*)$/i;

/** Normaliza un enlace para comparar duplicados: sin rastreo, sin fragmento, sin www, sin "/" final. */
export function normalizarEnlace(enlace: string): string {
  const crudo = (enlace ?? "").trim();
  if (!crudo) return "";
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(crudo) ? crudo : `https://${crudo}`);
  } catch {
    return crudo.toLowerCase();
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !PARAMS_RASTREO.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  // Quita duplicados exactos de parámetros (p. ej. gh_jid repetido).
  const vistos = new Set<string>();
  const unicos = params.filter(([k, v]) => {
    const clave = `${k}=${v}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  const query = unicos.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  let ruta = url.pathname.replace(/\/+$/, "");
  if (ruta === "/") ruta = "";
  return `https://${host}${ruta}${query ? `?${query}` : ""}`;
}

/** Hash estable para evitar duplicados. Sin enlace, usa empresa + puesto. */
export function calcularHuella(enlace: string, empresa = "", puesto = ""): string {
  const base = normalizarEnlace(enlace) || `sin-enlace:${normalizar(empresa)}|${normalizar(puesto)}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}
