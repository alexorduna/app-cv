import { leerDb } from "@/db/servidor";
import { ESTADOS_RESPUESTA, bancoRespuestas } from "@/db/schema";
import { borrarRespuestaAccion, guardarRespuestaAccion } from "@/app/acciones";

export const dynamic = "force-dynamic";

function Formulario({ r }: { r?: { id: number; categoria: string; pregunta: string; respuesta: string; estado: string } }) {
  const salarial = r?.estado === "Preguntar a Alex";
  return (
    <form action={guardarRespuestaAccion} className="grid grid-cols-[10rem_1fr_9rem_auto] items-start gap-2">
      <input type="hidden" name="id" value={r?.id ?? ""} />
      <input name="categoria" defaultValue={r?.categoria} placeholder="Categoría" className="campo" />
      <div className="flex flex-col gap-1">
        <input name="pregunta" defaultValue={r?.pregunta} placeholder="Pregunta" required className="campo font-medium" />
        {salarial ? (
          <div className="aviso text-xs">⚠ Pregunta de expectativa salarial: decídela caso por caso. Chamba no guarda la respuesta.</div>
        ) : (
          <textarea name="respuesta" defaultValue={r?.respuesta} placeholder="Respuesta" rows={2} className="campo" />
        )}
      </div>
      <select name="estado" defaultValue={r?.estado ?? "Completa"} className="campo">
        {ESTADOS_RESPUESTA.map((e) => <option key={e}>{e}</option>)}
      </select>
      <div className="flex gap-1">
        <button className="btn-primario btn-chico">{r ? "Guardar" : "Agregar"}</button>
        {r && <button formAction={borrarRespuestaAccion.bind(null, r.id)} className="btn-peligro btn-chico">Borrar</button>}
      </div>
    </form>
  );
}

export default async function PaginaBanco() {
  const db = await leerDb();
  const filas = db.select().from(bancoRespuestas).orderBy(bancoRespuestas.categoria, bancoRespuestas.id).all();
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="titulo">Banco de respuestas</h1>
        <p className="subtitulo">Respuestas listas para copiar al aplicar. No guardes aquí contraseñas, tokens, tarjetas, identificaciones ni tu salario mínimo.</p>
      </div>
      <div className="tarjeta flex flex-col gap-2">
        <div className="text-sm font-semibold">Nueva respuesta</div>
        <Formulario />
      </div>
      <div className="tarjeta flex flex-col gap-3">
        {filas.map((r) => <Formulario key={r.id} r={r} />)}
        {filas.length === 0 && <p className="text-sm text-zinc-500">Vacío. Importa banco_respuestas.csv o agrega respuestas arriba.</p>}
      </div>
      <a className="btn-sec w-fit" href="/api/exportar?tipo=banco">Exportar banco a CSV</a>
    </div>
  );
}
