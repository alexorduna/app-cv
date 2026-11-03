import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { leerDb } from "@/db/servidor";
import { AREAS, TIPOS, actividad } from "@/db/schema";
import { guardarVacanteAccion } from "@/app/acciones";
import { AccionesVacante } from "@/components/AccionesVacante";
import { SelectorEstado } from "@/components/Tablero";
import { InsigniaEstado, Prioridad, TextoArea } from "@/components/ui";
import { detectarAts } from "@/lib/ats";
import { cartaAprobada, cartasDe } from "@/lib/cartas";
import { obtenerVacante } from "@/lib/vacantes";

export const dynamic = "force-dynamic";

export default async function PaginaVacante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await leerDb();
  const v = obtenerVacante(db, Number(id));
  if (!v) notFound();
  const ats = detectarAts(v.enlace);
  const aprobada = cartaAprobada(db, v.id);
  const nCartas = cartasDe(db, v.id).length;
  const historial = db.select().from(actividad).where(and(eq(actividad.entidad, "vacante"), eq(actividad.entidadId, String(v.id)))).orderBy(desc(actividad.id)).limit(20).all();
  const guardar = guardarVacanteAccion.bind(null, v.id);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <Link href="/" className="enlace text-sm">← Tablero</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><TextoArea area={v.area} /><Prioridad p={v.prioridad} /><InsigniaEstado estado={v.estado} /></div>
          <h1 className="titulo mt-1">{v.puesto}</h1>
          <div className="subtitulo">{v.empresa} · {v.region || "región sin definir"} · {v.tipo} · {v.plataforma}</div>
        </div>
        <SelectorEstado id={v.id} estado={v.estado} />
      </div>

      <AccionesVacante id={v.id} enlace={v.enlace} estado={v.estado} />

      {v.estado === "Descartada" && v.motivoDescarte && <div className="error">Motivo del descarte: {v.motivoDescarte}</div>}
      {v.notas && v.enTablero === 0 && <div className="aviso whitespace-pre-line">{v.notas}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={guardar} className="tarjeta grid grid-cols-2 gap-3 lg:col-span-2">
          <div className="col-span-2 text-sm font-semibold">Datos</div>
          {[
            ["empresa", "Empresa", v.empresa],
            ["puesto", "Puesto", v.puesto],
            ["plataforma", "Plataforma", v.plataforma],
            ["region", "Región", v.region],
            ["horasPorDia", "Horas por día", v.horasPorDia],
            ["salario", "Salario publicado", v.salario],
            ["versionCv", "Versión de CV", v.versionCv],
            ["siguientePaso", "Siguiente paso", v.siguientePaso],
          ].map(([k, t, val]) => (
            <label key={k}>
              <span className="etiqueta">{t}</span>
              <input name={k} defaultValue={val} className="campo" />
            </label>
          ))}
          <label>
            <span className="etiqueta">Área</span>
            <select name="area" defaultValue={v.area} className="campo">
              <option value="">Sin área</option>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>
            <span className="etiqueta">Tipo</span>
            <select name="tipo" defaultValue={v.tipo} className="campo">
              <option value="">Sin tipo</option>
              {TIPOS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>
            <span className="etiqueta">Prioridad</span>
            <select name="prioridad" defaultValue={v.prioridad} className="campo">
              {[1, 2, 3].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            <span className="etiqueta">Fecha de aplicación</span>
            <input type="date" name="fechaAplicacion" defaultValue={v.fechaAplicacion ?? ""} className="campo" />
          </label>
          <label>
            <span className="etiqueta">Fecha de seguimiento</span>
            <input type="date" name="fechaSeguimiento" defaultValue={v.fechaSeguimiento ?? ""} className="campo" />
          </label>
          <label className="col-span-2">
            <span className="etiqueta">Enlace</span>
            <input name="enlace" defaultValue={v.enlace} className="campo font-mono text-xs" />
          </label>
          <label className="col-span-2">
            <span className="etiqueta">Notas</span>
            <textarea name="notas" defaultValue={v.notas} rows={4} className="campo" />
          </label>
          {v.estado === "Descartada" && (
            <label className="col-span-2">
              <span className="etiqueta">Motivo del descarte</span>
              <input name="motivoDescarte" defaultValue={v.motivoDescarte} className="campo" />
            </label>
          )}
          <div className="col-span-2"><button className="btn-primario">Guardar cambios</button></div>
        </form>

        <div className="flex flex-col gap-4">
          <div className="tarjeta text-sm">
            <div className="mb-2 font-semibold">Carta</div>
            {aprobada ? <p className="text-emerald-700 dark:text-emerald-400">✔ Carta aprobada (v{aprobada.version})</p> : <p className="text-zinc-500">{nCartas ? `${nCartas} borrador(es), ninguno aprobado` : "Sin carta todavía"}</p>}
            <Link href={`/cartas?vacante=${v.id}`} className="btn-sec btn-chico mt-2">Ir a Cartas</Link>
          </div>
          <div className="tarjeta text-sm">
            <div className="mb-1 font-semibold">ATS detectado</div>
            {ats ? (
              <>
                <p>{ats.nombre}</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-400">{ats.campos.map((c) => <li key={c}>{c}</li>)}</ul>
              </>
            ) : (
              <p className="text-zinc-500">No reconocido por la URL.</p>
            )}
          </div>
          <div className="tarjeta text-sm">
            <div className="mb-1 font-semibold">Historial</div>
            <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              {historial.map((h) => (
                <li key={h.id}><span className="text-zinc-400">{h.fecha.slice(0, 16).replace("T", " ")}</span> · {h.accion} {h.detalle && `· ${h.detalle}`}</li>
              ))}
              {historial.length === 0 && <li>Sin cambios registrados.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
