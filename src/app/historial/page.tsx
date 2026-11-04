import { leerDb } from "@/db/servidor";
import { cargarExtra } from "@/db/almacen";
import { Historial } from "@/components/Historial";
import { listarHistorialDescartes } from "@/lib/vacantes";

export const dynamic = "force-dynamic";

export default async function PaginaHistorial() {
  const db = await leerDb();
  await cargarExtra(db, "descartadas");
  const filas = listarHistorialDescartes(db);
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="titulo">Historial de descartes</h1>
        <p className="subtitulo">
          Lo que tú descartaste (desde el tablero, el detalle o la bandeja Nuevas), con tu motivo y la fecha. No se borra solo.
          Lo que descartan los filtros automáticos está en Buscar vacantes → Descartadas por filtros.
        </p>
      </div>
      <Historial filas={filas} />
    </div>
  );
}
