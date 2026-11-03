/**
 * Extrae vacantes del texto de un correo de alertas (LinkedIn, Wellfound, Handshake) con reglas simples.
 * No usa IA ni se conecta al correo: solo procesa el texto que Alex pega.
 */
import type { CandidataFuente } from "./fuentes/tipos";

export type PlataformaAlerta = "LinkedIn" | "Wellfound" | "Handshake" | "Otra";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/** Enlaces que parecen de una vacante concreta. */
const URL_VACANTE: { plataforma: PlataformaAlerta; re: RegExp }[] = [
  { plataforma: "LinkedIn", re: /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i },
  { plataforma: "Wellfound", re: /(?:wellfound\.com|angel\.co)\/(?:company\/[^/\s]+\/)?jobs\/[\w-]+/i },
  { plataforma: "Handshake", re: /joinhandshake\.com\/(?:stu\/|job-search\/)?(?:jobs|postings)\/\d+/i },
];

const RUIDO = [
  /^view (job|details)$/i,
  /^(easy apply|apply( now)?|solicitud sencilla|postularme|ver empleo|ver vacante)$/i,
  /^(promoted|promocionado|actively recruiting|be an early applicant|top job pick.*|new|nuevo|hiring|reclutando activamente)$/i,
  /^\d+\+? (connections?|applicants?|alumni|conexi[oó]n(es)?|solicitudes?|exalumnos?)\b.*/i,
  /^(your job alert|tu alerta|jobs? (similar|recommended)|empleos? (similares|recomendados)|new jobs? for you|nuevos empleos).*/i,
  /^(unsubscribe|manage (job )?alerts|cancelar suscripci[oó]n|administrar alertas|see all jobs|ver todos los empleos|show more|view all).*/i,
  /^(this company is|esta empresa).*/i,
  /^(posted|publicado)?\s*(hace )?\d+\s*(minutes?|hours?|days?|weeks?|months?|minutos?|horas?|d[ií]as?|semanas?|mes(es)?)( ago)?$/i,
  /^\d+\+? new jobs?.*/i,
  /^-{3,}$|^_{3,}$|^={3,}$/,
  /^(linkedin|wellfound|handshake)( corporation)?.*©?.*$/i,
  /^©/,
];

function esRuido(linea: string): boolean {
  const l = linea.trim();
  return !l || RUIDO.some((r) => r.test(l)) || /^https?:\/\//i.test(l) || /^<?https?:/i.test(l);
}

/** Si el texto pegado es HTML, lo pasa a texto conservando los enlaces en su propia línea. */
export function htmlATexto(texto: string): string {
  if (!/<a\s[^>]*href=/i.test(texto) && !/<(div|td|p|br)\b/i.test(texto)) return texto;
  return texto
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, contenido) => `\n${contenido}\n${href.replace(/&amp;/g, "&")}\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|td|tr|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ");
}

export function detectarPlataformaAlerta(texto: string): PlataformaAlerta {
  for (const { plataforma, re } of URL_VACANTE) if (re.test(texto)) return plataforma;
  if (/linkedin/i.test(texto)) return "LinkedIn";
  if (/wellfound|angellist/i.test(texto)) return "Wellfound";
  if (/handshake/i.test(texto)) return "Handshake";
  return "Otra";
}

/** Limpia el enlace: LinkedIn sin /comm ni rastreo; el resto sin query de rastreo (lo hace la huella). */
export function limpiarEnlaceAlerta(url: string): string {
  const li = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
  if (li) return `https://www.linkedin.com/jobs/view/${li[1]}`;
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|trk|tracking|ref|source|refid|lipi|midToken|midSig|eid|otpToken)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

const SEPARADORES = /\s+[·•|]\s+|\s+-\s+(?=[A-Z])/;

/** Convierte las líneas útiles de un bloque en título, empresa y ubicación. */
function bloqueACandidata(lineas: string[], enlace: string, plataforma: PlataformaAlerta): CandidataFuente | null {
  let utiles = lineas.map((l) => l.trim()).filter((l) => !esRuido(l));
  if (utiles.length === 0) return null;
  // Si quedaron saludos o encabezados antes de la vacante, se toman las últimas líneas del bloque.
  if (utiles.length > 3) {
    const conSalario = utiles.slice(-4).some((l) => /[$€£]\s?\d/.test(l));
    utiles = utiles.slice(conSalario ? -4 : -3);
  }
  const puesto = utiles[0];
  let empresa = utiles[1] ?? "";
  let ubicacion = utiles[2] ?? "";
  let salario = "";
  // "Empresa · Ubicación" o "Empresa • Remote • $80k" en una sola línea
  if (empresa && SEPARADORES.test(empresa)) {
    const partes = empresa.split(SEPARADORES).map((p) => p.trim()).filter(Boolean);
    empresa = partes[0];
    const resto = partes.slice(1);
    salario = resto.find((p) => /[$€£]|\bk\b|\d+k/i.test(p) && !/remote/i.test(p)) ?? "";
    const ubic = resto.filter((p) => p !== salario && !/^\d+(\.\d+)?%/.test(p) && !/^(internship|full[- ]time|part[- ]time|contract|prácticas)$/i.test(p));
    if (ubic.length) ubicacion = ubic.join(", ");
    const tipoTexto = resto.find((p) => /^(internship|full[- ]time|part[- ]time|contract)$/i.test(p));
    if (tipoTexto && !ubicacion) ubicacion = "";
  } else if (ubicacion && /[$€£]\s?\d/.test(ubicacion)) {
    salario = ubicacion;
    ubicacion = utiles[3] ?? "";
  }
  if (!puesto || puesto.length > 160) return null;
  return {
    puesto,
    empresa,
    ubicacion,
    enlace: enlace ? limpiarEnlaceAlerta(enlace) : "",
    salario,
    descripcion: utiles.slice(1).join("\n"),
    plataforma: `${plataforma} (alerta)`,
  };
}

/**
 * Extrae vacantes del correo pegado.
 * 1) Si hay enlaces de vacantes, cada enlace cierra un bloque con las líneas anteriores.
 * 2) Si no hay enlaces (texto copiado sin hipervínculos), separa por líneas en blanco.
 */
export function extraerVacantesDeAlerta(textoPegado: string): { plataforma: PlataformaAlerta; vacantes: CandidataFuente[] } {
  const texto = htmlATexto(textoPegado).replace(/\r\n?/g, "\n");
  const plataforma = detectarPlataformaAlerta(texto);
  const lineas = texto.split("\n");
  const vacantes: CandidataFuente[] = [];
  const esEnlaceVacante = (l: string) => URL_VACANTE.some(({ re }) => re.test(l));
  const hayEnlaces = lineas.some(esEnlaceVacante);

  if (hayEnlaces) {
    let bloque: string[] = [];
    const vistos = new Set<string>();
    for (const linea of lineas) {
      const urls = linea.match(URL_RE) ?? [];
      const urlVacante = urls.find((u) => esEnlaceVacante(u));
      if (urlVacante) {
        const textoAntes = linea.replace(URL_RE, "").replace(/^(view job|ver empleo)\s*:?\s*/i, "").trim();
        if (textoAntes) bloque.push(textoAntes);
        const enlace = limpiarEnlaceAlerta(urlVacante);
        if (!vistos.has(enlace)) {
          const c = bloqueACandidata(bloque.slice(-6), enlace, plataforma);
          if (c) {
            vacantes.push(c);
            vistos.add(enlace);
          }
        }
        bloque = [];
      } else if (linea.trim()) bloque.push(linea);
      else if (bloque.length && bloque.every(esRuido)) bloque = [];
    }
  } else {
    const bloques = texto.split(/\n\s*\n/);
    for (const b of bloques) {
      const c = bloqueACandidata(b.split("\n"), "", plataforma);
      if (c && c.empresa) vacantes.push(c);
    }
  }
  return { plataforma, vacantes };
}
