import { leerDb } from "@/db/servidor";
import { Tablero } from "@/components/Tablero";
import { calcularResumen, listarVacantes } from "@/lib/vacantes";

export const dynamic = "force-dynamic";

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string | number; detalle?: string }) {
  return (
    <div className="tarjeta">
      <div className="text-xs font-medium text-zinc-500">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
      {detalle && <div className="text-xs text-zinc-500">{detalle}</div>}
    </div>
  );
}

export default async function PaginaTablero() {
  const db = await leerDb();
  const filas = listarVacantes(db);
  const r = calcularResumen(filas);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titulo">Tablero</h1>
        <p className="subtitulo">Tus vacantes en seguimiento. Lo nuevo de las búsquedas llega primero a la bandeja &quot;Nuevas&quot;.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Vacantes registradas" valor={r.registradas} detalle={`${r.porEstado["Lista para aplicar"]} listas para aplicar`} />
        <Dato titulo="Aplicadas" valor={r.aplicadas} />
        <Dato titulo="Tasa de respuesta" valor={`${Math.round(r.tasaRespuesta * 100)}%`} detalle={`${r.conRespuesta} con respuesta`} />
        <Dato titulo="Entrevistas" valor={r.entrevistas} detalle="incluye pruebas técnicas y ofertas" />
      </div>
      <Tablero filas={filas} />
    </div>
  );
}
