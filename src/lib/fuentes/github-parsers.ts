/**
 * Lectores puros (sin red) para listas de vacantes en repos de GitHub:
 *  - listings.json de SimplifyJobs
 *  - tablas HTML o Markdown del README
 *  - listas de enlaces ("* Empresa [Puesto](url), Ubicación")
 */
import type { Tipo } from "@/db/schema";
import { quitarHtml } from "@/lib/texto";
import type { CandidataFuente } from "./tipos";

export class FormatoNoReconocido extends Error {
  constructor(detalle: string) {
    super(`Formato no reconocido: ${detalle}`);
    this.name = "FormatoNoReconocido";
  }
}

const CERRADA = "🔒";
const CIUDADANIA = "🇺🇸";
const SIN_PATROCINIO = "🛂";

function marcasDe(texto: string) {
  return {
    cerrada: texto.includes(CERRADA),
    ciudadania: texto.includes(CIUDADANIA),
    sinPatrocinio: texto.includes(SIN_PATROCINIO),
  };
}

function limpiarEmojis(s: string): string {
  return s
    .replace(/🔒|🇺🇸|🛂|🔥|🎓|‼️|⭐️?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------- listings.json ----------------

interface ListingSimplify {
  company_name?: string;
  title?: string;
  url?: string;
  locations?: string[];
  active?: boolean;
  is_visible?: boolean;
  sponsorship?: string;
  terms?: string[];
}

export function parsearListingsJson(texto: string, tipoPorDefecto?: Tipo): CandidataFuente[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new FormatoNoReconocido("listings.json no es JSON válido");
  }
  if (!Array.isArray(datos)) throw new FormatoNoReconocido("listings.json no es una lista");
  const muestra = datos.slice(0, 20) as ListingSimplify[];
  if (datos.length > 0 && !muestra.some((x) => x && typeof x.title === "string" && typeof x.url === "string")) {
    throw new FormatoNoReconocido("listings.json no tiene campos title/url");
  }
  return (datos as ListingSimplify[])
    .filter((x) => x && x.is_visible !== false && x.title && x.url)
    .map((x) => {
      const sp = (x.sponsorship ?? "").toLowerCase();
      return {
        puesto: x.title!.trim(),
        empresa: (x.company_name ?? "").trim(),
        ubicacion: (x.locations ?? []).join("; "),
        enlace: x.url!,
        tipo: tipoPorDefecto,
        marcas: {
          cerrada: x.active === false,
          ciudadania: sp.includes("citizenship"),
          sinPatrocinio: sp.includes("does not offer"),
        },
      };
    });
}

// ---------------- Tablas ----------------

type Columnas = { empresa: number; puesto: number; ubicacion: number; enlace: number };

function mapearEncabezados(encabezados: string[]): Columnas | null {
  const idx = (re: RegExp) => encabezados.findIndex((h) => re.test(h.toLowerCase()));
  const c = {
    empresa: idx(/company|empresa/),
    puesto: idx(/role|title|position|puesto|job/),
    ubicacion: idx(/location|ubicaci/),
    enlace: idx(/application|apply|link|enlace/),
  };
  if (c.empresa < 0 || c.puesto < 0 || c.ubicacion < 0) return null;
  return c;
}

function primerEnlace(celda: string): string {
  const html = celda.match(/href="([^"]+)"/i);
  if (html) return html[1].replace(/&amp;/g, "&");
  const md = celda.match(/\]\((https?:\/\/[^)\s]+)\)/);
  return md ? md[1] : "";
}

function textoCelda(celda: string): string {
  return limpiarEmojis(
    quitarHtml(
      celda
        .replace(/<summary>[\s\S]*?<\/summary>/gi, "")
        .replace(/<\/?br\s*\/?>/gi, "; ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\*\*/g, ""),
    ).replace(/\n/g, "; "),
  )
    .replace(/(;\s*)+/g, "; ")
    .replace(/^;\s*|;\s*$/g, "");
}

function filaACandidata(celdas: string[], c: Columnas, anterior: string, tipo?: Tipo): CandidataFuente | null {
  const celdaEnlace = c.enlace >= 0 ? celdas[c.enlace] ?? "" : "";
  let empresa = textoCelda(celdas[c.empresa] ?? "");
  if (empresa === "↳" || empresa === "") empresa = anterior;
  const crudoFila = celdas.join(" ");
  const puesto = textoCelda(celdas[c.puesto] ?? "");
  if (!puesto) return null;
  const enlace = primerEnlace(celdaEnlace) || primerEnlace(celdas[c.puesto] ?? "");
  const marcas = marcasDe(crudoFila);
  if (!enlace && celdaEnlace.includes(CERRADA)) marcas.cerrada = true;
  return { empresa, puesto, ubicacion: textoCelda(celdas[c.ubicacion] ?? ""), enlace, marcas, tipo };
}

export function parsearTablasHtml(md: string, tipo?: Tipo): CandidataFuente[] {
  const salida: CandidataFuente[] = [];
  for (const tabla of md.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const encabezados = [...tabla.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => quitarHtml(m[1]));
    const cols = mapearEncabezados(encabezados);
    if (!cols) continue;
    let anterior = "";
    for (const fila of tabla.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (celdas.length < 3) continue;
      const c = filaACandidata(celdas, cols, anterior, tipo);
      if (c) {
        anterior = c.empresa;
        salida.push(c);
      }
    }
  }
  return salida;
}

function celdasMd(linea: string): string[] {
  return linea.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((x) => x.trim());
}

export function parsearTablasMarkdown(md: string, tipo?: Tipo): CandidataFuente[] {
  const lineas = md.split(/\r?\n/);
  const salida: CandidataFuente[] = [];
  for (let i = 0; i < lineas.length - 1; i++) {
    if (!lineas[i].trim().startsWith("|") || !/^\s*\|?\s*:?-{3,}/.test(lineas[i + 1])) continue;
    const cols = mapearEncabezados(celdasMd(lineas[i]).map((h) => quitarHtml(h)));
    i += 2;
    if (!cols) continue;
    let anterior = "";
    for (; i < lineas.length && lineas[i].trim().startsWith("|"); i++) {
      const c = filaACandidata(celdasMd(lineas[i]), cols, anterior, tipo);
      if (c) {
        anterior = c.empresa;
        salida.push(c);
      }
    }
  }
  return salida;
}

// ---------------- Lista de enlaces ----------------

/** "* Empresa [Puesto](https://...), Ubicación" → candidata. Ignora anclas internas. */
export function parsearListaEnlaces(md: string): CandidataFuente[] {
  const salida: CandidataFuente[] = [];
  const lineas = md.split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^\s*[*-]\s+(.*)$/);
    if (!m) continue;
    let item = m[1];
    // Continúa en la siguiente línea si no es otro ítem ni encabezado
    while (i + 1 < lineas.length && lineas[i + 1].trim() && !/^\s*([*-]\s|#)/.test(lineas[i + 1])) item += " " + lineas[++i].trim();
    const enlace = item.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (!enlace) continue;
    const antes = item.slice(0, enlace.index).replace(/[-–:]\s*$/, "").trim();
    const despues = item.slice((enlace.index ?? 0) + enlace[0].length).replace(/^[\s,.;:–-]+/, "").replace(/\.$/, "").trim();
    salida.push({
      empresa: antes || new URL(enlace[2]).hostname.replace(/^www\./, ""),
      puesto: enlace[1].trim(),
      ubicacion: despues,
      enlace: enlace[2],
    });
  }
  return salida;
}

/** Decide cómo leer el README. Lanza FormatoNoReconocido si no encuentra nada que entienda. */
export function parsearReadme(md: string, formato: "auto" | "enlaces", tipo?: Tipo): CandidataFuente[] {
  if (formato === "enlaces") {
    const r = parsearListaEnlaces(md);
    if (r.length === 0 && !/^\s*[*-]\s/m.test(md)) throw new FormatoNoReconocido("no hay listas de enlaces en el README");
    return r;
  }
  const html = parsearTablasHtml(md, tipo);
  if (html.length) return html;
  const tablas = parsearTablasMarkdown(md, tipo);
  if (tablas.length) return tablas;
  throw new FormatoNoReconocido("el README no tiene tablas con columnas Company/Role/Location");
}
