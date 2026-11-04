import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { listasGithub, type ListaGithub, type Tipo } from "@/db/schema";
import { ErrorHttp, type ClienteHttp } from "@/lib/http";
import { ahoraISO, hoyISO } from "@/lib/texto";
import { FormatoNoReconocido, parsearListingsJson, parsearReadme } from "./github-parsers";
import type { CandidataFuente, Fuente } from "./tipos";

export const LISTAS_POR_DEFECTO: { repo: string; rama: string; formato: string; activa: number }[] = [
  { repo: "SimplifyJobs/Summer2026-Internships", rama: "", formato: "auto", activa: 1 },
  { repo: "SimplifyJobs/New-Grad-Positions", rama: "", formato: "auto", activa: 1 },
  { repo: "paralax/awesome-cybersecurity-internships", rama: "", formato: "enlaces", activa: 1 },
];

export function sembrarListas(db: DB) {
  for (const l of LISTAS_POR_DEFECTO) db.insert(listasGithub).values(l).onConflictDoNothing().run();
}

/** Acepta "owner/repo" o "https://github.com/owner/repo(.git)". */
export function normalizarRepo(entrada: string): string | null {
  const m = entrada.trim().match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Anota un aviso en NOTAS.md (sección de avisos automáticos). */
export function anotarEnNotas(texto: string, archivo = process.env.CHAMBA_NOTAS_PATH || path.join(process.cwd(), "NOTAS.md")) {
  try {
    const titulo = "## Avisos automáticos de la app";
    let contenido = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf8") : "# Notas\n";
    if (!contenido.includes(titulo)) contenido = `${contenido.trimEnd()}\n\n${titulo}\n`;
    fs.writeFileSync(archivo, `${contenido.trimEnd()}\n- ${hoyISO()}: ${texto}\n`);
  } catch {
    /* si no se puede escribir, el error igual queda en la UI */
  }
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

async function apiGithub(http: ClienteHttp, ruta: string, accept = "application/vnd.github+json") {
  try {
    const r = await http.get(`${API}${ruta}`, { Accept: accept, "X-GitHub-Api-Version": "2022-11-28" });
    const restante = r.headers.get("x-ratelimit-remaining");
    if (restante !== null && Number(restante) <= 1) {
      const reset = Number(r.headers.get("x-ratelimit-reset") ?? 0) * 1000;
      throw new Error(`Límite de la API de GitHub casi agotado; se reanuda después de ${new Date(reset).toLocaleTimeString("es-MX")}.`);
    }
    return r;
  } catch (e) {
    if (e instanceof ErrorHttp && (e.estado === 403 || e.estado === 429)) {
      const h = e.respuesta?.headers;
      const agotado = e.estado === 429 || h?.get("x-ratelimit-remaining") === "0" || h?.has("retry-after");
      if (!agotado) throw new Error(`GitHub rechazó la petición (HTTP ${e.estado}). ¿Repo privado o red que bloquea api.github.com?`);
      const reset = Number(h?.get("x-ratelimit-reset") ?? 0) * 1000;
      throw new Error(`GitHub limitó las peticiones (HTTP ${e.estado}).${reset ? ` Intenta después de ${new Date(reset).toLocaleTimeString("es-MX")}.` : ""}`);
    }
    throw e;
  }
}

async function intentarTexto(http: ClienteHttp, url: string): Promise<string | null> {
  try {
    return await http.texto(url);
  } catch (e) {
    if (e instanceof ErrorHttp && e.estado === 404) return null;
    throw e;
  }
}

export interface ResultadoLista {
  candidatas: CandidataFuente[];
  sha: string | null;
  sinCambios: boolean;
  formato: string;
  /** "api" = SHA del commit vía api.github.com; "raw" = sin API, huella del contenido. */
  via?: "api" | "raw";
}

/**
 * Lee una lista. Primero con la API de GitHub (SHA del commit); si la API falla (p. ej. límite de 60/h
 * por IP compartida en servidores como Netlify), lee directo de raw.githubusercontent.com sin API.
 */
export async function leerLista(http: ClienteHttp, lista: Pick<ListaGithub, "repo" | "rama" | "formato" | "ultimoSha">): Promise<ResultadoLista> {
  try {
    return { ...(await leerListaConApi(http, lista)), via: "api" };
  } catch (e) {
    if (e instanceof FormatoNoReconocido) throw e;
    try {
      return { ...(await leerListaSinApi(http, lista)), via: "raw" };
    } catch (e2) {
      if (e2 instanceof FormatoNoReconocido) throw e2;
      throw new Error(`${(e as Error).message} Sin API tampoco se pudo: ${(e2 as Error).message}`);
    }
  }
}

/** Sin API: prueba ramas comunes en raw.githubusercontent.com y usa una huella del contenido como "SHA". */
export async function leerListaSinApi(http: ClienteHttp, lista: Pick<ListaGithub, "repo" | "rama" | "formato" | "ultimoSha">): Promise<ResultadoLista> {
  // "HEAD" = la rama por defecto del repo (raw.githubusercontent.com lo resuelve sin usar la API).
  const ramas = lista.rama ? [lista.rama] : ["HEAD", "main", "dev"];
  const tipo: Tipo | undefined = /intern/i.test(lista.repo) ? "Prácticas" : undefined;
  const huellaContenido = (t: string) => `contenido:${createHash("sha256").update(t).digest("hex").slice(0, 16)}`;
  for (const rama of ramas) {
    const base = `${RAW}/${lista.repo}/${encodeURIComponent(rama)}`;
    if (lista.formato !== "enlaces") {
      for (const ruta of [".github/scripts/listings.json", "listings.json"]) {
        const json = await intentarTexto(http, `${base}/${ruta}`);
        if (json === null) continue;
        const sha = huellaContenido(json);
        if (sha === lista.ultimoSha) return { candidatas: [], sha, sinCambios: true, formato: "" };
        return { candidatas: parsearListingsJson(json, tipo), sha, sinCambios: false, formato: `${ruta} (${rama}, sin API)` };
      }
    }
    const readme = await intentarTexto(http, `${base}/README.md`);
    if (readme === null) continue;
    const sha = huellaContenido(readme);
    if (sha === lista.ultimoSha) return { candidatas: [], sha, sinCambios: true, formato: "" };
    return { candidatas: parsearReadme(readme, lista.formato === "enlaces" ? "enlaces" : "auto", tipo), sha, sinCambios: false, formato: `README.md (${rama}, sin API)` };
  }
  throw new Error(`No se encontró listings.json ni README.md en ${lista.repo} (ramas probadas sin API: ${ramas.join(", ")}).`);
}

/** Con API: obtiene el SHA de la rama, y si cambió descarga listings.json o el README. */
async function leerListaConApi(http: ClienteHttp, lista: Pick<ListaGithub, "repo" | "rama" | "formato" | "ultimoSha">): Promise<ResultadoLista> {
  let ramas = lista.rama ? [lista.rama] : [];
  if (!lista.rama) {
    const info = (await (await apiGithub(http, `/repos/${lista.repo}`)).json()) as { default_branch?: string };
    ramas = [...new Set([info.default_branch ?? "main", "main", "dev"])];
  }
  const tipo: Tipo | undefined = /intern/i.test(lista.repo) ? "Prácticas" : undefined;
  for (const rama of ramas) {
    let sha: string;
    try {
      sha = (await (await apiGithub(http, `/repos/${lista.repo}/commits/${encodeURIComponent(rama)}`, "application/vnd.github.sha")).text()).trim();
    } catch (e) {
      if (e instanceof ErrorHttp && (e.estado === 404 || e.estado === 422)) continue; // la rama no existe
      throw e;
    }
    if (sha && sha === lista.ultimoSha) return { candidatas: [], sha, sinCambios: true, formato: "" };
    if (lista.formato !== "enlaces") {
      for (const ruta of [".github/scripts/listings.json", "listings.json"]) {
        const json = await intentarTexto(http, `${RAW}/${lista.repo}/${sha}/${ruta}`);
        if (json !== null) return { candidatas: parsearListingsJson(json, tipo), sha, sinCambios: false, formato: ruta };
      }
    }
    const readme = await intentarTexto(http, `${RAW}/${lista.repo}/${sha}/README.md`);
    if (readme === null) continue;
    return { candidatas: parsearReadme(readme, lista.formato === "enlaces" ? "enlaces" : "auto", tipo), sha, sinCambios: false, formato: "README.md" };
  }
  throw new Error(`No se encontró listings.json ni README.md en ${lista.repo} (ramas probadas: ${ramas.join(", ")}).`);
}

export const github: Fuente = {
  id: "github",
  nombre: "Listas de GitHub",
  descripcion: "Repos públicos con listas de vacantes (raw.githubusercontent.com y api.github.com, sin login). Se guarda el SHA para no repetir trabajo.",
  clave: "fuente_github",
  async buscar(ctx) {
    const listas = ctx.db.select().from(listasGithub).where(eq(listasGithub.activa, 1)).all();
    if (listas.length === 0) ctx.avisar("No hay listas activas.");
    const salida: CandidataFuente[] = [];
    for (const lista of listas) {
      try {
        const r = await leerLista(ctx.http, lista);
        ctx.db
          .update(listasGithub)
          .set({ ultimoSha: r.sha, ultimaLectura: ahoraISO(), ultimoError: null })
          .where(eq(listasGithub.id, lista.id))
          .run();
        if (r.sinCambios) {
          ctx.avisar(`${lista.repo}: sin cambios desde la última lectura (${(r.sha ?? "").slice(0, 7)}).`);
          continue;
        }
        ctx.avisar(`${lista.repo}: ${r.candidatas.length} vacantes leídas de ${r.formato}.`);
        salida.push(...r.candidatas.map((c) => ({ ...c, plataforma: `GitHub: ${lista.repo}` })));
      } catch (e) {
        const msg = (e as Error).message;
        if (e instanceof FormatoNoReconocido) {
          ctx.db.update(listasGithub).set({ activa: 0, ultimoError: msg, ultimaLectura: ahoraISO() }).where(eq(listasGithub.id, lista.id)).run();
          anotarEnNotas(`La lista ${lista.repo} se desactivó automáticamente. ${msg}. Revisa su formato antes de reactivarla.`);
          ctx.avisar(`${lista.repo}: ${msg}. Lista desactivada y anotada en NOTAS.md.`);
        } else {
          ctx.db.update(listasGithub).set({ ultimoError: msg, ultimaLectura: ahoraISO() }).where(eq(listasGithub.id, lista.id)).run();
          ctx.avisar(`${lista.repo}: ${msg}`);
        }
      }
    }
    return salida;
  },
};
