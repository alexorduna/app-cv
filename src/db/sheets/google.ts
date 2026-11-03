/**
 * Cliente mínimo de la API de Google Sheets (v4) con cuenta de servicio.
 * Sin dependencias: firma el JWT con node:crypto y usa fetch.
 *
 * Variables de entorno:
 *  - GOOGLE_SHEET_ID: ID o URL completa del Sheet.
 *  - GOOGLE_SERVICE_ACCOUNT_JSON: el JSON de la llave (tal cual o en base64), o
 *  - GOOGLE_SERVICE_ACCOUNT_FILE: ruta al archivo JSON de la llave.
 */
import { createSign } from "node:crypto";
import fs from "node:fs";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface CredencialServicio {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function idDeSheet(valor: string): string {
  const m = valor.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  return (m ? m[1] : valor).trim();
}

export function leerCredencial(env: Record<string, string | undefined> = process.env): CredencialServicio | null {
  let texto = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!texto && env.GOOGLE_SERVICE_ACCOUNT_FILE) texto = fs.readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8");
  if (!texto) return null;
  if (!texto.startsWith("{")) texto = Buffer.from(texto, "base64").toString("utf8");
  const c = JSON.parse(texto) as CredencialServicio;
  if (!c.client_email || !c.private_key) throw new Error("La llave de la cuenta de servicio no tiene client_email o private_key.");
  return { ...c, private_key: c.private_key.replace(/\\n/g, "\n") };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export class ErrorSheets extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
    this.name = "ErrorSheets";
  }
}

export interface RangoValores {
  range: string;
  values?: string[][];
}

export interface RespuestaEstructura {
  addSheet?: { properties: PropiedadesPestana };
}

/** ¿Google rechazó crear una pestaña porque ya existe? (pasa si dos peticiones la crean a la vez) */
export function esPestanaYaExiste(e: unknown): boolean {
  return e instanceof ErrorSheets && e.estado === 400 && /already exists|ya existe/i.test(e.message);
}

export interface PropiedadesPestana {
  sheetId: number;
  title: string;
  hidden?: boolean;
  gridProperties?: { rowCount?: number; columnCount?: number };
}

export class ClienteSheets {
  private token: { valor: string; vence: number } | null = null;
  private fetchFn: FetchFn;
  readonly base: string;
  private timeoutMs: number;

  constructor(
    readonly spreadsheetId: string,
    private credencial: CredencialServicio | null,
    opciones: { fetch?: FetchFn; base?: string; timeoutMs?: number } = {},
  ) {
    this.fetchFn = opciones.fetch ?? ((u, i) => fetch(u, i));
    this.base = opciones.base ?? "https://sheets.googleapis.com/v4/spreadsheets";
    this.timeoutMs = opciones.timeoutMs ?? 30_000;
  }

  private async tokenAcceso(): Promise<string | null> {
    if (!this.credencial) return null; // pruebas con servidor falso
    if (this.token && this.token.vence > Date.now() + 60_000) return this.token.valor;
    const ahora = Math.floor(Date.now() / 1000);
    const uri = this.credencial.token_uri ?? "https://oauth2.googleapis.com/token";
    const cabecera = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const cuerpo = b64url(
      JSON.stringify({ iss: this.credencial.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: uri, iat: ahora, exp: ahora + 3600 }),
    );
    const firma = b64url(createSign("RSA-SHA256").update(`${cabecera}.${cuerpo}`).sign(this.credencial.private_key));
    const r = await this.fetchFn(uri, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cabecera}.${cuerpo}.${firma}` }).toString(),
    });
    if (!r.ok) throw new ErrorSheets(r.status, `Google rechazó la cuenta de servicio (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { valor: j.access_token, vence: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  private async pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenAcceso();
    const r = await this.fetchFn(`${this.base}/${this.spreadsheetId}${ruta}`, {
      ...init,
      // Importante dentro de Next.js: sin `signal`, Next reutiliza la respuesta de un GET idéntico hecho antes
      // en la misma petición (node_modules/next/dist/server/lib/dedupe-fetch.js). Eso devolvía la lista de
      // pestañas de ANTES de crearlas y datos viejos después de guardar. `signal` es la forma documentada de
      // desactivarlo; `cache: "no-store"` evita además la caché de datos de Next.
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    if (!r.ok) {
      const texto = (await r.text()).slice(0, 300);
      if (r.status === 403) throw new ErrorSheets(403, `Sin permiso sobre el Sheet. ¿Lo compartiste como Editor con la cuenta de servicio? ${texto}`);
      if (r.status === 404) throw new ErrorSheets(404, `No encontré el Sheet ${this.spreadsheetId}. Revisa GOOGLE_SHEET_ID.`);
      throw new ErrorSheets(r.status, `Google Sheets respondió HTTP ${r.status}: ${texto}`);
    }
    return (await r.json()) as T;
  }

  async pestanas(): Promise<PropiedadesPestana[]> {
    const j = await this.pedir<{ sheets: { properties: PropiedadesPestana }[] }>(`?fields=sheets.properties`);
    return j.sheets.map((s) => s.properties);
  }

  /** Lee varios rangos en una sola llamada (valores como se ven en la hoja). */
  async leer(rangos: string[], render: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE"): Promise<RangoValores[]> {
    if (rangos.length === 0) return [];
    const q = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const j = await this.pedir<{ valueRanges: RangoValores[] }>(`/values:batchGet?${q}&valueRenderOption=${render}&majorDimension=ROWS`);
    return j.valueRanges;
  }

  /** Escribe celdas. USER_ENTERED interpreta fechas, números y fórmulas; RAW guarda texto tal cual. */
  async escribir(datos: RangoValores[], modo: "RAW" | "USER_ENTERED") {
    if (datos.length === 0) return;
    await this.pedir(`/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: modo, data: datos }) });
  }

  /** Cambios de estructura: crear pestañas, borrar filas, ocultar columnas, etc. Devuelve las respuestas de Google. */
  async estructura(requests: unknown[]): Promise<RespuestaEstructura[]> {
    if (requests.length === 0) return [];
    const j = await this.pedir<{ replies?: RespuestaEstructura[] }>(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
    return j.replies ?? [];
  }
}

export function clienteDesdeEntorno(env: Record<string, string | undefined> = process.env): ClienteSheets {
  if (!env.GOOGLE_SHEET_ID) throw new Error("Falta GOOGLE_SHEET_ID en el entorno.");
  const cred = leerCredencial(env);
  if (!cred) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_FILE en el entorno.");
  return new ClienteSheets(idDeSheet(env.GOOGLE_SHEET_ID), cred);
}
