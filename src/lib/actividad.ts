import { desc } from "drizzle-orm";
import type { DB } from "@/db";
import { actividad } from "@/db/schema";
import { ahoraISO } from "./texto";

export function registrar(db: DB, entidad: string, entidadId: string | number, accion: string, detalle = "") {
  db.insert(actividad).values({ fecha: ahoraISO(), entidad, entidadId: String(entidadId), accion, detalle }).run();
}

export function ultimaActividad(db: DB, limite = 30) {
  return db.select().from(actividad).orderBy(desc(actividad.id)).limit(limite).all();
}
