"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Vacante } from "@/db/schema";
import type { ResultadoFuente } from "@/lib/buscar";
import {
  aceptarNuevasAccion, buscarAhoraAccion, descartarNuevasAccion, ingresarAlertaAccion, pegarEnlaceAccion,
  previsualizarAlertaAccion, rescatarAccion,
} from "@/app/acciones";
import { Prioridad, TextoArea } from "./ui";

export function BotonBuscar({ hayActivas }: { hayActivas: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [res, setRes] = useState<ResultadoFuente[] | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button className="btn-primario" disabled={pendiente || !hayActivas} onClick={() => iniciar(async () => setRes(await buscarAhoraAccion()))}>
          {pendiente ? "Buscando… (1 petición por segundo por sitio)" : "Buscar ahora en las fuentes activas"}
        </button>
        {!hayActivas && <span className="text-sm text-zinc-500">No hay fuentes activas. Enciéndelas en Configuración.</span>}
      </div>
      {res && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr><th className="py-1">Fuente</th><th>Leídas</th><th>Nuevas</th><th>Descartadas</th><th>Duplicadas</th><th>Mensaje</th></tr>
          </thead>
          <tbody>
            {res.map((r) => (
              <tr key={r.fuente} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                <td className="py-1.5 font-medium">{r.ok ? "✔" : "✖"} {r.nombre}</td>
                <td>{r.encontradas}</td><td>{r.nuevas}</td><td>{r.descartadas}</td><td>{r.duplicadas}</td>
                <td className={`text-xs ${r.ok ? "text-zinc-500" : "text-red-600 dark:text-red-400"}`}>{r.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type FilaNueva = Pick<Vacante, "id" | "puesto" | "empresa" | "ubicacion" | "region" | "plataforma" | "notas" | "enlace" | "area" | "prioridad" | "tipo" | "salario">;

export function BandejaNuevas({ nuevas }: { nuevas: FilaNueva[] }) {
  const [sel, setSel] = useState<number[]>([]);
  const [pendiente, iniciar] = useTransition();
  const todas = sel.length === nuevas.length && nuevas.length > 0;
  if (nuevas.length === 0) return <p className="text-sm text-zinc-500">La bandeja está vacía. Busca en las fuentes o pega una alerta.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={todas} onChange={() => setSel(todas ? [] : nuevas.map((n) => n.id))} /> Seleccionar todas
        </label>
        <span className="text-xs text-zinc-500">{sel.length} seleccionadas</span>
        <button className="btn-primario btn-chico" disabled={!sel.length || pendiente} onClick={() => iniciar(async () => { await aceptarNuevasAccion(sel); setSel([]); })}>
          Aceptar al tablero (Por revisar)
        </button>
        <button
          className="btn-peligro btn-chico"
          disabled={!sel.length || pendiente}
          onClick={() => {
            const m = window.prompt("Motivo del descarte (para todas las seleccionadas):", "No me interesa");
            if (m !== null) iniciar(async () => { await descartarNuevasAccion(sel, m); setSel([]); });
          }}
        >
          Descartar
        </button>
      </div>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <tbody>
            {nuevas.map((n) => (
              <tr key={n.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                <td className="w-8 px-2 py-2"><input type="checkbox" checked={sel.includes(n.id)} onChange={() => setSel((s) => (s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id]))} /></td>
                <td className="w-20 py-2"><Prioridad p={n.prioridad} /><br /><TextoArea area={n.area} /></td>
                <td className="py-2 pr-2">
                  <Link href={`/vacante/${n.id}`} className="font-medium hover:underline">{n.puesto}</Link>
                  <div className="text-xs text-zinc-500">{n.empresa} · {n.ubicacion || n.region} · {n.tipo}{n.salario ? ` · ${n.salario}` : ""}</div>
                  {n.notas && <div className="mt-1 whitespace-pre-line text-xs text-amber-700 dark:text-amber-400">{n.notas}</div>}
                </td>
                <td className="py-2 pr-2 text-xs text-zinc-500">{n.plataforma}</td>
                <td className="py-2 pr-3 text-right">{n.enlace && <a className="enlace text-xs" href={n.enlace} target="_blank" rel="noopener noreferrer">Abrir ↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Previa = Awaited<ReturnType<typeof previsualizarAlertaAccion>>;

export function PegarAlerta() {
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Pega aquí el texto (o el HTML) de un correo de alertas de LinkedIn, Wellfound o Handshake. Chamba no se conecta a tu correo: solo lee lo que pegues, con reglas simples.
      </p>
      <textarea className="campo min-h-48 font-mono text-xs" placeholder="Pega aquí el correo…" value={texto} onChange={(e) => { setTexto(e.target.value); setPrevia(null); setResultado(""); }} />
      <div className="flex gap-2">
        <button className="btn-sec" disabled={!texto.trim() || pendiente} onClick={() => iniciar(async () => setPrevia(await previsualizarAlertaAccion(texto)))}>Vista previa</button>
        <button
          className="btn-primario"
          disabled={!texto.trim() || pendiente}
          onClick={() => iniciar(async () => {
            const r = await ingresarAlertaAccion(texto);
            setResultado(`${r.total} vacantes leídas: ${r.nuevas} a Nuevas, ${r.descartadas} descartadas por filtros, ${r.duplicadas} ya existían.`);
          })}
        >
          Pasar por filtros y enviar a Nuevas
        </button>
      </div>
      {resultado && <div className="ok">{resultado}</div>}
      {previa && (
        <div className="tarjeta p-0">
          <div className="border-b border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">Detectado: {previa.plataforma} · {previa.vacantes.length} vacantes</div>
          <table className="w-full text-sm">
            <tbody>
              {previa.vacantes.map((v, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-1.5">{v.pasa ? "✔" : "✖"}</td>
                  <td className="py-1.5"><div className="font-medium">{v.puesto}</div><div className="text-xs text-zinc-500">{v.empresa} · {v.ubicacion}</div></td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-500">{v.pasa ? v.area : v.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PegarEnlace() {
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | "aviso"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="grid max-w-3xl grid-cols-2 gap-3"
      action={(fd) =>
        iniciar(async () => {
          const r = await pegarEnlaceAccion(fd);
          if ("error" in r && r.error) setMensaje({ tipo: "error", texto: r.error });
          else if (r.estado === "nueva") setMensaje({ tipo: "ok", texto: "Guardada en Nuevas." });
          else setMensaje({ tipo: "aviso", texto: `Guardada como Descartada: ${r.motivo}. Puedes rescatarla en "Descartadas".` });
        })
      }
    >
      <p className="col-span-2 text-sm text-zinc-600 dark:text-zinc-400">
        Para LinkedIn, Wellfound y Handshake: Chamba no lee esas páginas. Pega el enlace y escribe tú el título y la empresa.
      </p>
      <label className="col-span-2"><span className="etiqueta">Enlace</span><input name="enlace" className="campo" placeholder="https://www.linkedin.com/jobs/view/…" /></label>
      <label><span className="etiqueta">Puesto *</span><input name="puesto" required className="campo" /></label>
      <label><span className="etiqueta">Empresa *</span><input name="empresa" required className="campo" /></label>
      <label><span className="etiqueta">Ubicación (como aparece)</span><input name="ubicacion" className="campo" placeholder="Remote, Mexico" /></label>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="remoto" defaultChecked /> Es 100% remota</label>
      <label className="col-span-2"><span className="etiqueta">Notas o requisitos (opcional, también se filtran)</span><textarea name="notas" rows={3} className="campo" /></label>
      <div className="col-span-2 flex items-center gap-3">
        <button className="btn-primario" disabled={pendiente}>Guardar</button>
        {mensaje && <div className={mensaje.tipo}>{mensaje.texto}</div>}
      </div>
    </form>
  );
}

type FilaDesc = Pick<Vacante, "id" | "puesto" | "empresa" | "ubicacion" | "plataforma" | "motivoDescarte" | "enlace">;

export function ListaDescartadas({ filas }: { filas: FilaDesc[] }) {
  const [q, setQ] = useState("");
  const [pendiente, iniciar] = useTransition();
  const t = q.toLowerCase();
  const visibles = filas.filter((f) => !t || `${f.puesto} ${f.empresa} ${f.motivoDescarte} ${f.plataforma}`.toLowerCase().includes(t));
  const motivos = new Map<string, number>();
  for (const f of filas) {
    const clave = f.motivoDescarte.replace(/\(.*\)/, "").replace(/".*"/, "").trim();
    motivos.set(clave, (motivos.get(clave) ?? 0) + 1);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {[...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m, n]) => (
          <button key={m} className="chip" onClick={() => setQ(m)}>{m} ({n})</button>
        ))}
      </div>
      <input className="campo max-w-sm" placeholder="Filtrar por puesto, empresa o motivo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <tbody>
            {visibles.slice(0, 300).map((f) => (
              <tr key={f.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td className="px-3 py-1.5">
                  <div className="font-medium">{f.puesto}</div>
                  <div className="text-xs text-zinc-500">{f.empresa} · {f.ubicacion} · {f.plataforma}</div>
                </td>
                <td className="py-1.5 text-xs text-red-700 dark:text-red-400">{f.motivoDescarte}</td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                  {f.enlace && <a className="enlace mr-2 text-xs" href={f.enlace} target="_blank" rel="noopener noreferrer">Abrir ↗</a>}
                  <button className="btn-sec btn-chico" disabled={pendiente} onClick={() => iniciar(() => rescatarAccion(f.id))}>Rescatar a Nuevas</button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td className="px-3 py-6 text-center text-zinc-500">Nada por aquí.</td></tr>}
          </tbody>
        </table>
      </div>
      {visibles.length > 300 && <p className="text-xs text-zinc-500">Mostrando 300 de {visibles.length}. Filtra para ver más.</p>}
    </div>
  );
}
