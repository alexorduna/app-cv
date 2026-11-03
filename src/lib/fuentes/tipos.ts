import type { DB } from "@/db";
import type { Candidata } from "@/lib/filtros/motor";
import type { ClienteHttp } from "@/lib/http";

export interface CandidataFuente extends Candidata {
  /** Plataforma que se guarda en la vacante (p. ej. "Greenhouse"). Por defecto, el nombre de la fuente. */
  plataforma?: string;
}

export interface ContextoFuente {
  http: ClienteHttp;
  filtros: Record<string, string>;
  db: DB;
  /** Mensajes informativos que se muestran en la UI junto al resultado de la fuente. */
  avisar: (mensaje: string) => void;
}

export interface Fuente {
  id: string;
  nombre: string;
  descripcion: string;
  /** Clave en la tabla filtros que la enciende o apaga. */
  clave: string;
  /** Si es true, la fuente no puede activarse (motivo en `descripcion`). */
  bloqueada?: boolean;
  buscar(ctx: ContextoFuente): Promise<CandidataFuente[]>;
}
