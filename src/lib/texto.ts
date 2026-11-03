/** Utilidades de texto: normalización sin acentos y búsqueda por palabra completa. */

export function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const cacheRegex = new Map<string, RegExp | null>();

function regexFrase(frase: string): RegExp | null {
  let re = cacheRegex.get(frase);
  if (re === undefined) {
    const f = normalizar(frase);
    // Espacios y guiones en la frase aceptan espacio o guion en el texto.
    re = f ? new RegExp(`(?<![a-z0-9])${escaparRegex(f).replace(/(\\-| )/g, "[\\s-]?")}(?![a-z0-9])`) : null;
    cacheRegex.set(frase, re);
  }
  return re;
}

/** ¿Contiene `frase` como palabra(s) completa(s)? Ignora mayúsculas y acentos. */
export function contieneFrase(texto: string, frase: string): boolean {
  const re = regexFrase(frase);
  return !!re && re.test(normalizar(texto));
}

/** Devuelve la primera frase de la lista que aparece en el texto, o null. Normaliza el texto una sola vez. */
export function primeraCoincidencia(texto: string, frases: string[]): string | null {
  const t = normalizar(texto);
  for (const f of frases) {
    const re = regexFrase(f);
    if (re && re.test(t)) return f;
  }
  return null;
}

/** Convierte "a, b\nc" en ["a","b","c"]. */
export function aLista(valor: string | null | undefined): string[] {
  return (valor ?? "")
    .split(/[,\n;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function hoyISO(fecha = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ahoraISO(): string {
  return new Date().toISOString();
}

/** Acepta YYYY-MM-DD, DD/MM/YYYY o D/M/YY y devuelve YYYY-MM-DD (o null si está vacía o no se entiende). */
export function normalizarFecha(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return v; // se conserva tal cual para no perder información
}

/** Quita etiquetas HTML y entidades básicas. */
export function quitarHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
