import type { Area, Tipo } from "@/db/schema";
import { aLista, normalizar, primeraCoincidencia } from "@/lib/texto";
import { FILTROS_SEMILLA } from "./semilla";

/** Configuración de filtros ya convertida en listas. */
export interface ConfigFiltros {
  ofensiva: string[];
  defensiva: string[];
  software: string[];
  nivel: string[];
  excluir: string[];
  mexico: string[];
  latam: string[];
  mundo: string[];
  europa: string[];
  eeuu: string[];
  reinoUnido: string[];
  otrasBloqueadas: string[];
  modalidadesAceptadas: string[];
  bloqueoResidencia: string[];
  bloqueoPermiso: string[];
  bloqueoClearance: string[];
  bloqueoCiudadania: string[];
  maxHorasPracticas: number;
  seniority: string[];
  maxAniosExperiencia: number;
}

export function construirConfig(valores: Record<string, string | undefined>): ConfigFiltros {
  const v = (k: string) => valores[k] ?? FILTROS_SEMILLA[k] ?? "";
  return {
    ofensiva: aLista(v("palabras_ofensiva")),
    defensiva: aLista(v("palabras_defensiva")),
    software: aLista(v("palabras_software")),
    nivel: aLista(v("palabras_nivel")),
    excluir: aLista(v("excluir")),
    mexico: aLista(v("regiones_aceptadas_mexico")),
    latam: aLista(v("regiones_aceptadas_latam")),
    mundo: aLista(v("regiones_aceptadas_mundo")),
    europa: aLista(v("regiones_europa")),
    eeuu: aLista(v("regiones_eeuu")),
    reinoUnido: aLista(v("regiones_reino_unido")),
    otrasBloqueadas: aLista(v("regiones_otras_bloqueadas")),
    modalidadesAceptadas: aLista(v("modalidades_aceptadas")),
    bloqueoResidencia: aLista(v("bloqueo_residencia")),
    bloqueoPermiso: aLista(v("bloqueo_permiso")),
    bloqueoClearance: aLista(v("bloqueo_clearance")),
    bloqueoCiudadania: aLista(v("bloqueo_ciudadania")),
    maxHorasPracticas: Number(v("max_horas_practicas")) || 6,
    seniority: aLista(v("excluir_seniority")),
    maxAniosExperiencia: v("max_anios_experiencia").trim() === "" ? Infinity : Number(v("max_anios_experiencia")),
  };
}

export const CONFIG_POR_DEFECTO = construirConfig({});

/** Vacante "cruda" tal como llega de una fuente, alerta o captura manual. */
export interface Candidata {
  puesto: string;
  empresa: string;
  ubicacion?: string;
  descripcion?: string;
  enlace?: string;
  /** true/false si la fuente lo dice explícitamente; undefined si no se sabe. */
  remoto?: boolean;
  tipo?: Tipo;
  horasPorDia?: string;
  salario?: string;
  marcas?: { cerrada?: boolean; ciudadania?: boolean; sinPatrocinio?: boolean };
  /** Nivel que reporta la fuente ("Senior (5-10 years)", "Junior", "Semi Senior"…). */
  nivel?: string;
}

export type Region =
  | "México"
  | "LATAM"
  | "Worldwide"
  | "Europa"
  | "EE. UU."
  | "Reino Unido"
  | "Otro"
  | "Remoto sin especificar";

export interface Evaluacion {
  pasa: boolean;
  motivo: string; // motivo de descarte (vacío si pasa)
  avisos: string[];
  area: Area | "";
  prioridad: number;
  region: Region;
  tipo: Tipo;
  horasPorDia: string;
}

const PALABRAS_REMOTO = ["remote", "remoto", "remota", "100% remote", "fully remote", "work from home", "wfh", "anywhere", "worldwide", "teletrabajo", "home office"];
const PALABRAS_NO_REMOTO = ["hybrid", "hibrido", "hibrida", "on-site", "onsite", "on site", "in-office", "in office", "presencial", "office-based"];
const ESTADOS_EEUU = /(?:,|\s-)\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

export function detectarTipo(puesto: string, extra = ""): Tipo {
  const t = `${puesto} ${extra}`;
  if (primeraCoincidencia(t, ["intern", "internship", "trainee", "apprentice", "apprenticeship", "practicas", "practicante", "becario", "co-op", "coop", "pasantia"])) return "Prácticas";
  if (primeraCoincidencia(t, ["contract", "contractor", "freelance", "contrato", "1099", "temporary"])) return "Contrato";
  return "Tiempo completo";
}

/** Extrae horas por día de textos como "20 hours/week", "6 horas al día" o "4h/day". */
export function parsearHoras(texto: string): number | null {
  const t = normalizar(texto);
  const dia = t.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:-|to|a)?\s*(?:\d{1,2})?\s*(?:hours?|hrs?|h|horas)\s*(?:per|a|\/|por|al|each)\s*(?:day|dia)/);
  if (dia) return Number(dia[1].replace(",", "."));
  const sem = t.match(/(\d{1,2})\s*(?:-|to|a)?\s*(\d{1,2})?\s*(?:hours?|hrs?|h|horas)\s*(?:per|a|\/|por|a la|each)\s*(?:week|semana|wk)/);
  if (sem) {
    const max = Number(sem[2] ?? sem[1]);
    return Math.round((max / 5) * 10) / 10;
  }
  return null;
}

const cacheOrden = new WeakMap<ConfigFiltros, [Area, string[]][]>();

/** Listas por área sin las palabras de nivel (calculadas una vez por configuración). */
function ordenAreas(cfg: ConfigFiltros): [Area, string[]][] {
  let orden = cacheOrden.get(cfg);
  if (!orden) {
    const nivel = new Set(cfg.nivel.map(normalizar));
    const especificas = (lista: string[]) => lista.filter((p) => !nivel.has(normalizar(p)));
    orden = [
      ["Ofensiva", especificas(cfg.ofensiva)],
      ["Defensiva", especificas(cfg.defensiva)],
      ["Software", especificas(cfg.software)],
    ];
    cacheOrden.set(cfg, orden);
  }
  return orden;
}

const NIVEL_ENTRADA = /\b(i|1|junior|jr|entry[- ]level|entry|graduate|new grad|intern|internship|trainee|apprentice|associate)\b/i;
const NIVEL_INTERMEDIO = /\b(?:ii|iii|iv)\b|\b(?:v|[2-5])\s*$|\blevel\s*[2-9]\b|\b[lp][3-9]\b/i;

/**
 * ¿El puesto NO puede ser de nivel de entrada? Devuelve el motivo o null.
 * Senior, Staff, Lead, Manager… siempre se descartan; los niveles II/III solo si el título no dice también I o Junior.
 */
export function motivoSeniority(titulo: string, nivelFuente: string | undefined, cfg: ConfigFiltros): string | null {
  const fuerte = primeraCoincidencia(titulo, cfg.seniority);
  if (fuerte) return `Puesto no es de nivel de entrada ("${fuerte}")`;
  const t = titulo.replace(/[()[\],\-–/]/g, " ").replace(/\s+/g, " ").trim();
  const intermedio = t.match(NIVEL_INTERMEDIO);
  // "SOC Analyst I/II" o "Junior Engineer II" se conservan: también son de entrada.
  if (intermedio && !NIVEL_ENTRADA.test(t)) return `Puesto de nivel intermedio o superior ("${intermedio[0].trim()}")`;
  if (nivelFuente) {
    const n = primeraCoincidencia(nivelFuente, cfg.seniority);
    if (n) return `La fuente lo marca como "${nivelFuente}"`;
  }
  return null;
}

/** Años de experiencia que pide la descripción (el mayor de los mínimos mencionados), o null. */
export function aniosExperiencia(texto: string): number | null {
  const t = normalizar(texto);
  const patrones = [
    /(\d{1,2})\s*\+?\s*(?:-|to|a)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)(?:'s)?\s+(?:of\s+)?(?:[a-z/&,-]+\s+){0,5}?(?:experience|exp\b)/g,
    /(?:minimum|at least|min\.?)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)/g,
    /(\d{1,2})\s*\+?\s*(?:-|a)?\s*(?:\d{1,2})?\s*anos?\s+de\s+experiencia/g,
    /experiencia\s+(?:minima\s+)?de\s+(\d{1,2})\s*\+?\s*anos?/g,
  ];
  let max: number | null = null;
  for (const re of patrones) {
    for (const m of t.matchAll(re)) {
      const n = Number(m[1]);
      if (n > 0 && n <= 15 && (max === null || n > max)) max = n;
    }
  }
  return max;
}

export function detectarArea(puesto: string, cfg: ConfigFiltros): { area: Area | ""; palabra: string | null } {
  for (const [area, lista] of ordenAreas(cfg)) {
    const p = primeraCoincidencia(puesto, lista);
    if (p) return { area, palabra: p };
  }
  return { area: "", palabra: null };
}

export const PRIORIDAD_POR_AREA: Record<Area, number> = { Ofensiva: 1, Defensiva: 2, Software: 3 };

/** Clasifica un fragmento de ubicación. */
export function clasificarUbicacion(fragmento: string, cfg: ConfigFiltros): Region {
  // "New Mexico" es un estado de EE. UU., no México.
  const f = fragmento.trim().replace(/\bnew mexico\b/gi, "New-Mex (USA)");
  if (primeraCoincidencia(f, cfg.mexico)) return "México";
  if (primeraCoincidencia(f, cfg.latam)) return "LATAM";
  if (primeraCoincidencia(f, cfg.mundo)) return "Worldwide";
  if (primeraCoincidencia(f, cfg.reinoUnido)) return "Reino Unido";
  if (primeraCoincidencia(f, cfg.eeuu) || ESTADOS_EEUU.test(f)) return "EE. UU.";
  if (primeraCoincidencia(f, cfg.europa)) return "Europa";
  if (primeraCoincidencia(f, cfg.otrasBloqueadas)) return "Otro";
  const resto = normalizar(f)
    .replace(/\b(100% )?(fully )?(remote|remoto|remota|work from home|wfh|teletrabajo)\b/g, "")
    .replace(/[^a-z]/g, "");
  if (!resto) return "Remoto sin especificar";
  return "Otro";
}

/** Separa una ubicación con varias opciones ("Remote in USA</br>Remote in Canada", "A; B", "A | B"). */
export function fragmentosUbicacion(ubicacion: string): string[] {
  return ubicacion
    .split(/<\/?br\s*\/?>|\n|;|\||\s\/\s|\bor\b/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

const ETIQUETA_REGION: Record<Region, string> = {
  "México": "México",
  LATAM: "LATAM",
  Worldwide: "worldwide",
  Europa: "Europa",
  "EE. UU.": "EE. UU.",
  "Reino Unido": "Reino Unido",
  Otro: "otro país",
  "Remoto sin especificar": "remoto sin especificar",
};

/** Aplica todos los filtros de Alex a una vacante candidata. Función pura. */
export function evaluar(c: Candidata, cfg: ConfigFiltros = CONFIG_POR_DEFECTO): Evaluacion {
  const avisos: string[] = [];
  const ubicacion = c.ubicacion ?? "";
  const titulo = c.puesto ?? "";
  const textoCompleto = `${titulo}\n${ubicacion}\n${c.descripcion ?? ""}`;
  const tipo = c.tipo ?? detectarTipo(titulo);
  const horasDetectadas = c.horasPorDia ? Number(String(c.horasPorDia).replace(",", ".")) : parsearHoras(textoCompleto);
  const horasPorDia = horasDetectadas && !Number.isNaN(horasDetectadas) ? String(horasDetectadas) : (c.horasPorDia ?? "");
  const { area } = detectarArea(titulo, cfg);
  const prioridad = area ? PRIORIDAD_POR_AREA[area] : 3;

  const fragmentos = fragmentosUbicacion(ubicacion);
  const regiones = fragmentos.map((f) => clasificarUbicacion(f, cfg));
  const aceptables: Region[] = ["México", "LATAM", "Worldwide", "Europa", "Remoto sin especificar"];
  const regionAceptada = regiones.find((r) => aceptables.includes(r));
  const region: Region = regionAceptada ?? regiones[0] ?? "Remoto sin especificar";

  const base = { avisos, area, prioridad, region, tipo, horasPorDia };
  const descartar = (motivo: string): Evaluacion => ({ ...base, pasa: false, motivo });

  // 1. Marcas explícitas (listas de GitHub)
  if (c.marcas?.cerrada) return descartar("Cerrada (🔒)");
  if (c.marcas?.ciudadania) return descartar("Exige ciudadanía de EE. UU. (🇺🇸)");

  // 2. Remoto total
  const noRemoto = primeraCoincidencia(`${titulo}\n${ubicacion}`, PALABRAS_NO_REMOTO);
  if (noRemoto) return descartar(`Híbrida o presencial ("${noRemoto}")`);
  if (c.remoto === false) return descartar("No es remota");
  if (c.remoto === undefined && !primeraCoincidencia(`${ubicacion}\n${titulo}`, PALABRAS_REMOTO)) {
    return descartar("No indica que sea 100% remota");
  }

  // 3. Palabras excluidas en título o ubicación
  const excluida = primeraCoincidencia(`${titulo}\n${ubicacion}`, cfg.excluir);
  if (excluida) return descartar(`Palabra excluida: "${excluida}"`);

  // 3b. Solo nivel de entrada
  const senior = motivoSeniority(titulo, c.nivel, cfg);
  if (senior) return descartar(senior);
  const anios = aniosExperiencia(`${c.descripcion ?? ""}\n${c.nivel ?? ""}`);
  if (anios !== null && anios > cfg.maxAniosExperiencia) return descartar(`Pide ${anios}+ años de experiencia (máximo ${cfg.maxAniosExperiencia})`);

  // 4. Restricciones legales en cualquier parte del texto
  const ciudadania = primeraCoincidencia(textoCompleto, cfg.bloqueoCiudadania);
  if (ciudadania) return descartar(`Exige ciudadanía ("${ciudadania}")`);
  const clearance = primeraCoincidencia(textoCompleto, cfg.bloqueoClearance);
  if (clearance) return descartar(`Pide security clearance ("${clearance}")`);
  const permiso = primeraCoincidencia(textoCompleto, cfg.bloqueoPermiso);
  if (permiso) return descartar(`Pide permiso de trabajo ("${permiso}")`);
  const residencia = primeraCoincidencia(textoCompleto, cfg.bloqueoResidencia);
  if (residencia) return descartar(`Exige residencia ("${residencia}")`);

  // 5. Región por ubicación
  if (!regionAceptada && regiones.length > 0) {
    const modalidad = primeraCoincidencia(textoCompleto, cfg.modalidadesAceptadas);
    if (modalidad) {
      avisos.push(`Ubicación restringida (${ubicacion}) pero menciona "${modalidad}": revisa si contrata desde México.`);
    } else {
      const sinPatrocinio = c.marcas?.sinPatrocinio ? " y no ofrece patrocinio (🛂)" : "";
      return descartar(`Exige estar en ${ETIQUETA_REGION[regiones[0]]} (${ubicacion})${sinPatrocinio}`);
    }
  }
  if (region === "Europa") {
    avisos.push("Europa: confirma que no exija residencia, que el sueldo sea bueno y que puedas empezar de inmediato.");
  }

  // 6. Prácticas: máximo de horas
  if (tipo === "Prácticas") {
    const h = Number(horasPorDia);
    if (horasPorDia && !Number.isNaN(h) && h > cfg.maxHorasPracticas) {
      return descartar(`Prácticas de ${h} h/día (máximo ${cfg.maxHorasPracticas})`);
    }
    if (!horasPorDia) avisos.push(`Prácticas: confirma que sean máximo ${cfg.maxHorasPracticas} h/día.`);
  }

  // 7. Palabras clave por área
  if (!area) return descartar("No coincide con palabras clave de ofensiva, defensiva ni software");

  if (primeraCoincidencia(titulo, cfg.nivel)) avisos.push("Nivel de entrada (junior/trainee/intern).");
  return { ...base, pasa: true, motivo: "" };
}
