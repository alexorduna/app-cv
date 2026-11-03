"use client";
import { useState, useTransition } from "react";
import type { Carta } from "@/db/schema";
import type { Revision } from "@/lib/cartas/validar";
import { aprobarCartaAccion, generarCartaAccion, guardarCartaAccion } from "@/app/acciones";
import { BotonCopiar } from "./ui";

export function EditorCarta({ vacanteId, cartas, revisionInicial, proveedor }: { vacanteId: number; cartas: Carta[]; revisionInicial: Revision | null; proveedor: string }) {
  const [seleccion, setSeleccion] = useState<number | null>(cartas[0]?.id ?? null);
  const carta = cartas.find((c) => c.id === seleccion) ?? cartas[0];
  const [texto, setTexto] = useState(carta?.texto ?? "");
  const [revision, setRevision] = useState<Revision | null>(revisionInicial);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const elegir = (c: Carta) => {
    setSeleccion(c.id);
    setTexto(c.texto);
    setRevision(null);
  };
  const generar = () =>
    iniciar(async () => {
      setError("");
      const r = await generarCartaAccion(vacanteId);
      // Si sale bien, la página se recarga y este componente se monta de nuevo con la versión nueva.
      if (r.error) setError(r.error);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primario" onClick={generar} disabled={pendiente}>
          {pendiente ? "Generando…" : cartas.length ? "Generar nueva versión" : "Generar borrador"}
        </button>
        <span className="text-xs text-zinc-500">Proveedor: {proveedor}</span>
        {cartas.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {cartas.map((c) => (
              <button key={c.id} className={`chip ${c.id === carta?.id ? "chip-activo" : ""}`} onClick={() => elegir(c)}>
                v{c.version}{c.estado === "Aprobada" ? " ✔" : ""}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {carta && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className={carta.estado === "Aprobada" ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}>
              v{carta.version} · {carta.estado} · {carta.proveedor}
            </span>
          </div>
          <textarea className="campo min-h-72 font-sans leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-sec" disabled={pendiente || texto === carta.texto} onClick={() => iniciar(() => guardarCartaAccion(carta.id, texto))}>
              Guardar (queda en Borrador)
            </button>
            <button className="btn-primario" disabled={pendiente} onClick={() => iniciar(async () => setRevision(await aprobarCartaAccion(carta.id, texto)))}>
              Revisar y aprobar
            </button>
            <BotonCopiar texto={texto} etiqueta="Copiar" className="btn-sec" />
          </div>
          {revision && (
            <div className="flex flex-col gap-2">
              {revision.errores.length > 0 && (
                <div className="error">
                  <div className="font-semibold">No se aprobó. Corrige:</div>
                  <ul className="list-disc pl-5">{revision.errores.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
              {revision.avisos.length > 0 && (
                <div className="aviso">
                  <div className="font-semibold">Revisa a ojo:</div>
                  <ul className="list-disc pl-5">{revision.avisos.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
              {revision.errores.length === 0 && revision.avisos.length === 0 && <div className="ok">Sin problemas detectados.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
