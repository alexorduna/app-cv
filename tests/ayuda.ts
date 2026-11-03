import { abrirBaseDatos } from "@/db";
import { sembrarFiltros } from "@/lib/filtros/repo";

export function bdDePrueba() {
  const db = abrirBaseDatos(":memory:");
  sembrarFiltros(db);
  return db;
}
