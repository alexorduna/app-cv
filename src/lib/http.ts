/**
 * Cliente HTTP "educado":
 *  - User-Agent genérico "ChambaBot", sin cookies ni datos personales.
 *  - Respeta robots.txt (Allow/Disallow con comodines, gana la regla más específica).
 *  - Máximo 1 petición por segundo por dominio (o más lento si robots.txt pide Crawl-delay).
 */

export const USER_AGENT = "ChambaBot/1.0";
const TOKEN_UA = "chambabot";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class BloqueadoPorRobots extends Error {
  constructor(url: string) {
    super(`robots.txt no permite leer ${url}`);
    this.name = "BloqueadoPorRobots";
  }
}

export class ErrorHttp extends Error {
  constructor(public estado: number, url: string, public respuesta?: Response) {
    super(`HTTP ${estado} en ${url}`);
    this.name = "ErrorHttp";
  }
}

interface ReglasRobots {
  reglas: { permitir: boolean; patron: string }[];
  crawlDelay: number | null;
}

/** Interpreta robots.txt y devuelve las reglas aplicables a ChambaBot (o a "*"). */
export function parsearRobots(texto: string): ReglasRobots {
  type Grupo = { agentes: string[]; reglas: { permitir: boolean; patron: string }[]; crawlDelay: number | null };
  const grupos: Grupo[] = [];
  let actual: Grupo | null = null;
  let ultimaFueAgente = false;
  for (const lineaCruda of texto.split(/\r?\n/)) {
    const linea = lineaCruda.replace(/#.*$/, "").trim();
    const m = linea.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === "user-agent") {
      if (!actual || !ultimaFueAgente) {
        actual = { agentes: [], reglas: [], crawlDelay: null };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    ultimaFueAgente = false;
    if (!actual) continue;
    if (campo === "allow" || campo === "disallow") {
      if (valor === "" && campo === "disallow") continue; // "Disallow:" vacío = todo permitido
      actual.reglas.push({ permitir: campo === "allow", patron: valor });
    } else if (campo === "crawl-delay") {
      const n = Number(valor);
      if (!Number.isNaN(n)) actual.crawlDelay = n;
    }
  }
  const propio = grupos.filter((g) => g.agentes.some((a) => a !== "*" && TOKEN_UA.startsWith(a)));
  const elegidos = propio.length ? propio : grupos.filter((g) => g.agentes.includes("*"));
  return {
    reglas: elegidos.flatMap((g) => g.reglas),
    crawlDelay: elegidos.map((g) => g.crawlDelay).find((c) => c !== null) ?? null,
  };
}

function patronARegex(patron: string): RegExp {
  const ancla = patron.endsWith("$");
  const cuerpo = (ancla ? patron.slice(0, -1) : patron)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${cuerpo}${ancla ? "$" : ""}`);
}

/** ¿Permite robots.txt la ruta (incluye query)? Gana la regla más larga; en empate, Allow. */
export function rutaPermitida(reglas: ReglasRobots, rutaConQuery: string): boolean {
  let mejor: { largo: number; permitir: boolean } | null = null;
  let ruta = rutaConQuery;
  try {
    ruta = decodeURIComponent(rutaConQuery);
  } catch {
    /* se usa tal cual */
  }
  for (const r of reglas.reglas) {
    if (!patronARegex(r.patron).test(ruta) && !patronARegex(r.patron).test(rutaConQuery)) continue;
    const largo = r.patron.length;
    if (!mejor || largo > mejor.largo || (largo === mejor.largo && r.permitir)) mejor = { largo, permitir: r.permitir };
  }
  return mejor ? mejor.permitir : true;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpcionesCliente {
  fetch?: FetchFn;
  intervaloMinimoMs?: number;
  timeoutMs?: number;
  /** Hosts de APIs oficiales que Alex autorizó explícitamente (no se consulta robots.txt). */
  hostsApiAutorizados?: string[];
}

export class ClienteHttp {
  private robots = new Map<string, Promise<ReglasRobots>>();
  private ultimaPeticion = new Map<string, number>();
  private colas = new Map<string, Promise<unknown>>();
  private fetchFn: FetchFn;
  private intervalo: number;
  private timeout: number;
  private hostsApi: Set<string>;

  constructor(op: OpcionesCliente = {}) {
    this.fetchFn = op.fetch ?? ((u, i) => fetch(u, i));
    this.intervalo = op.intervaloMinimoMs ?? 1000;
    this.timeout = op.timeoutMs ?? 30000;
    this.hostsApi = new Set(op.hostsApiAutorizados ?? ["api.github.com"]);
  }

  private async reglasPara(origen: string): Promise<ReglasRobots> {
    let p = this.robots.get(origen);
    if (!p) {
      p = (async () => {
        try {
          const r = await this.crudo(`${origen}/robots.txt`, {});
          if (r.status >= 400) return { reglas: [], crawlDelay: null }; // sin robots.txt = permitido
          // Si robots.txt redirige a otro dominio, no hay reglas propias claras: se trata como vacío.
          return parsearRobots(await r.text());
        } catch {
          return { reglas: [], crawlDelay: null };
        }
      })();
      this.robots.set(origen, p);
    }
    return p;
  }

  /** Serializa las peticiones por dominio y espera el intervalo mínimo entre ellas. */
  private async crudo(url: string, init: RequestInit): Promise<Response> {
    const host = new URL(url).host;
    const anterior = this.colas.get(host) ?? Promise.resolve();
    const tarea = anterior.catch(() => undefined).then(async () => {
      const crawl = this.robots.has(`${new URL(url).protocol}//${host}`) && !url.endsWith("/robots.txt")
        ? ((await this.robots.get(`${new URL(url).protocol}//${host}`))?.crawlDelay ?? 0) * 1000
        : 0;
      const intervalo = Math.max(this.intervalo, crawl);
      const ultima = this.ultimaPeticion.get(host) ?? 0;
      const falta = ultima + intervalo - Date.now();
      if (falta > 0) await espera(falta);
      this.ultimaPeticion.set(host, Date.now());
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeout);
      try {
        return await this.fetchFn(url, {
          ...init,
          signal: ctrl.signal,
          redirect: "follow",
          credentials: "omit",
          headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
        });
      } finally {
        clearTimeout(t);
      }
    });
    this.colas.set(host, tarea);
    return tarea;
  }

  /** GET respetando robots.txt y el límite por dominio. Lanza ErrorHttp si la respuesta no es 2xx/304. */
  async get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    const u = new URL(url);
    if (!this.hostsApi.has(u.host)) {
      const reglas = await this.reglasPara(`${u.protocol}//${u.host}`);
      if (!rutaPermitida(reglas, u.pathname + u.search)) throw new BloqueadoPorRobots(url);
    }
    const r = await this.crudo(url, { method: "GET", headers });
    if (!r.ok && r.status !== 304) throw new ErrorHttp(r.status, url, r);
    return r;
  }

  async json<T = unknown>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const r = await this.get(url, { Accept: "application/json", ...headers });
    return (await r.json()) as T;
  }

  async texto(url: string, headers: Record<string, string> = {}): Promise<string> {
    const r = await this.get(url, headers);
    return r.text();
  }
}
