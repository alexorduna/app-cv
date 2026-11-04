"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { Vacante } from "@/db/schema";
import { AREAS, ESTADOS, TIPOS, type Estado } from "@/db/schema";
import { cambiarEstadoAccion } from "@/app/acciones";
import { InsigniaEstado, Prioridad, TextoArea } from "./ui";

type Fila = Pick<Vacante, "id" | "empresa" | "puesto" | "area" | "region" | "tipo" | "prioridad" | "estado" | "plataforma" | "fechaEncontrada" | "fechaAplicacion" | "fechaSeguimiento" | "siguientePaso" | "enlace">;
type Orden = { campo: keyof Fila; asc: boolean };

function alternar<T>(lista: T[], v: T) {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
}

export function SelectorEstado({ id, estado }: { id: number; estado: Estado }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <select
      aria-label="Cambiar estado"
      className="campo w-auto py-0.5 text-xs"
      value={estado}
      disabled={pendiente}
      onChange={(e) => {
        const nuevo = e.target.value as Estado;
        let motivo: string | undefined;
        if (nuevo === "Descartada") {
          const m = window.prompt("Motivo del descarte:");
          if (m === null) {
            e.target.value = estado;
            return;
          }
          motivo = m;
        }
        iniciar(() => cambiarEstadoAccion(id, nuevo, motivo));
      }}
    >
      {ESTADOS.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}

export function Tablero({ filas }: { filas: Fila[] }) {
  const [vista, setVista] = useState<"tabla" | "kanban">("tabla");
  const [areas, setAreas] = useState<string[]>([]);
  const [prioridades, setPrioridades] = useState<number[]>([]);
  const [regiones, setRegiones] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [verDescartadas, setVerDescartadas] = useState(false);
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<Orden>({ campo: "prioridad", asc: true });

  const regionesDisponibles = useMemo(() => [...new Set(filas.map((f) => f.region).filter(Boolean))].sort(), [filas]);

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const r = filas.filter(
      (f) =>
        (verDescartadas || estados.includes("Descartada") || f.estado !== "Descartada") &&
        (!areas.length || areas.includes(f.area)) &&
        (!prioridades.length || prioridades.includes(f.prioridad)) &&
        (!regiones.length || regiones.includes(f.region)) &&
        (!tipos.length || tipos.includes(f.tipo)) &&
        (!estados.length || estados.includes(f.estado)) &&
        (!q || `${f.empresa} ${f.puesto} ${f.plataforma} ${f.siguientePaso}`.toLowerCase().includes(q)),
    );
    return [...r].sort((a, b) => {
      const va = a[orden.campo] ?? "";
      const vb = b[orden.campo] ?? "";
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return orden.asc ? c : -c;
    });
  }, [filas, texto, areas, prioridades, regiones, tipos, estados, verDescartadas, orden]);

  const Encabezado = ({ campo, children }: { campo: keyof Fila; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-2 py-2 text-left font-medium" onClick={() => setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))}>
      {children}
      {orden.campo === campo ? (orden.asc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="tarjeta flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="campo max-w-xs" placeholder="Buscar empresa, puesto, plataforma…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="ml-auto flex gap-1">
            <button className={`chip ${vista === "tabla" ? "chip-activo" : ""}`} onClick={() => setVista("tabla")}>Tabla</button>
            <button className={`chip ${vista === "kanban" ? "chip-activo" : ""}`} onClick={() => setVista("kanban")}>Kanban</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="w-16 text-zinc-500">Área</span>
          {AREAS.map((a) => (
            <button key={a} className={`chip ${areas.includes(a) ? "chip-activo" : ""}`} onClick={() => setAreas(alternar(areas, a))}>{a}</button>
          ))}
          <span className="ml-3 w-16 text-zinc-500">Prioridad</span>
          {[1, 2, 3].map((p) => (
            <button key={p} className={`chip ${prioridades.includes(p) ? "chip-activo" : ""}`} onClick={() => setPrioridades(alternar(prioridades, p))}>P{p}</button>
          ))}
          <span className="ml-3 w-10 text-zinc-500">Tipo</span>
          {TIPOS.map((t) => (
            <button key={t} className={`chip ${tipos.includes(t) ? "chip-activo" : ""}`} onClick={() => setTipos(alternar(tipos, t))}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="w-16 text-zinc-500">Región</span>
          {regionesDisponibles.map((r) => (
            <button key={r} className={`chip ${regiones.includes(r) ? "chip-activo" : ""}`} onClick={() => setRegiones(alternar(regiones, r))}>{r}</button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={verDescartadas} onChange={(e) => setVerDescartadas(e.target.checked)} /> Ver descartadas
          </label>
        </div>
        {vista === "tabla" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="w-16 text-zinc-500">Estado</span>
            {ESTADOS.map((s) => (
              <button key={s} className={`chip ${estados.includes(s) ? "chip-activo" : ""}`} onClick={() => setEstados(alternar(estados, s))}>{s}</button>
            ))}
          </div>
        )}
      </div>

      <div className="subtitulo">{visibles.length} de {filas.length} vacantes</div>

      {vista === "tabla" ? (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <Encabezado campo="prioridad">P</Encabezado>
                <Encabezado campo="empresa">Empresa</Encabezado>
                <Encabezado campo="puesto">Puesto</Encabezado>
                <Encabezado campo="area">Área</Encabezado>
                <Encabezado campo="region">Región</Encabezado>
                <Encabezado campo="tipo">Tipo</Encabezado>
                <Encabezado campo="estado">Estado</Encabezado>
                <Encabezado campo="fechaSeguimiento">Seguimiento</Encabezado>
                <Encabezado campo="fechaEncontrada">Encontrada</Encabezado>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                  <td className="px-2 py-1.5"><Prioridad p={f.prioridad} /></td>
                  <td className="px-2 py-1.5 font-medium">{f.empresa}</td>
                  <td className="px-2 py-1.5"><Link prefetch={false} className="enlace" href={`/vacante/${f.id}`}>{f.puesto}</Link></td>
                  <td className="px-2 py-1.5"><TextoArea area={f.area} /></td>
                  <td className="px-2 py-1.5 text-xs">{f.region}</td>
                  <td className="px-2 py-1.5 text-xs">{f.tipo}</td>
                  <td className="px-2 py-1.5"><SelectorEstado id={f.id} estado={f.estado} /></td>
                  <td className="px-2 py-1.5 text-xs">{f.fechaSeguimiento}</td>
                  <td className="px-2 py-1.5 text-xs text-zinc-500">{f.fechaEncontrada}</td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">Nada coincide con los filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ESTADOS.filter((s) => s !== "Descartada" || verDescartadas).map((s) => {
            const col = visibles.filter((f) => f.estado === s);
            return (
              <div key={s} className="flex w-60 shrink-0 flex-col gap-2 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900/60">
                <div className="flex items-center justify-between px-1">
                  <InsigniaEstado estado={s} />
                  <span className="text-xs text-zinc-500">{col.length}</span>
                </div>
                {col.map((f) => (
                  <div key={f.id} className="tarjeta flex flex-col gap-1.5 p-2.5">
                    <div className="flex items-center justify-between"><TextoArea area={f.area} /><Prioridad p={f.prioridad} /></div>
                    <Link prefetch={false} href={`/vacante/${f.id}`} className="text-sm font-medium leading-snug hover:underline">{f.puesto}</Link>
                    <div className="text-xs text-zinc-500">{f.empresa} · {f.region}</div>
                    <SelectorEstado id={f.id} estado={f.estado} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
