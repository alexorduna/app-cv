import type { DB } from "@/db";
import { ejecucionesFuentes } from "@/db/schema";
import { FUENTES, type Fuente } from "./fuentes";
import type { CandidataFuente } from "./fuentes/tipos";
import { leerFiltros } from "./filtros/repo";
import { construirConfig, type ConfigFiltros } from "./filtros/motor";
import { ClienteHttp } from "./http";
import { ingresarCandidata } from "./vacantes";
import { ahoraISO } from "./texto";

export interface ResultadoFuente {
  fuente: string;
  nombre: string;
  ok: boolean;
  mensaje: string;
  encontradas: number;
  nuevas: number;
  descartadas: number;
  duplicadas: number;
}

/** Ingresa candidatas (de una fuente, una alerta o captura manual) en una sola transacción. */
export function ingresarLote(db: DB, candidatas: CandidataFuente[], plataforma: string, cfg: ConfigFiltros) {
  const conteo = { nuevas: 0, descartadas: 0, duplicadas: 0 };
  db.transaction((tx) => {
    for (const c of candidatas) {
      if (!c.puesto?.trim()) continue;
      const r = ingresarCandidata(tx as unknown as DB, c, c.plataforma ?? plataforma, cfg);
      if (r.estado === "nueva") conteo.nuevas++;
      else if (r.estado === "descartada") conteo.descartadas++;
      else conteo.duplicadas++;
    }
  });
  return conteo;
}

/**
 * Ejecuta las fuentes activas una por una. Si una falla o cambia de formato,
 * se registra el error y se sigue con las demás.
 */
export async function buscarVacantes(db: DB, opciones: { http?: ClienteHttp; soloFuentes?: string[] } = {}): Promise<ResultadoFuente[]> {
  const valores = leerFiltros(db);
  const cfg = construirConfig(valores);
  const http = opciones.http ?? new ClienteHttp();
  const activas = FUENTES.filter((f) =>
    opciones.soloFuentes ? opciones.soloFuentes.includes(f.id) : valores[f.clave] === "1" && !f.bloqueada,
  );
  const resultados: ResultadoFuente[] = [];
  for (const fuente of activas) resultados.push(await ejecutarFuente(db, fuente, http, valores, cfg));
  return resultados;
}

async function ejecutarFuente(db: DB, fuente: Fuente, http: ClienteHttp, valores: Record<string, string>, cfg: ConfigFiltros): Promise<ResultadoFuente> {
  const avisos: string[] = [];
  const res: ResultadoFuente = { fuente: fuente.id, nombre: fuente.nombre, ok: true, mensaje: "", encontradas: 0, nuevas: 0, descartadas: 0, duplicadas: 0 };
  try {
    const candidatas = await fuente.buscar({ http, filtros: valores, db, avisar: (m) => avisos.push(m) });
    res.encontradas = candidatas.length;
    Object.assign(res, ingresarLote(db, candidatas, fuente.nombre, cfg));
  } catch (e) {
    res.ok = false;
    avisos.unshift((e as Error).message || String(e));
  }
  res.mensaje = avisos.join(" | ");
  db.insert(ejecucionesFuentes)
    .values({ fuente: fuente.id, fecha: ahoraISO(), ok: res.ok ? 1 : 0, mensaje: res.mensaje, encontradas: res.encontradas, nuevas: res.nuevas })
    .onConflictDoUpdate({
      target: ejecucionesFuentes.fuente,
      set: { fecha: ahoraISO(), ok: res.ok ? 1 : 0, mensaje: res.mensaje, encontradas: res.encontradas, nuevas: res.nuevas },
    })
    .run();
  return res;
}
