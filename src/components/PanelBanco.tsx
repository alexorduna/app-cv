"use client";
import { useMemo, useState } from "react";
import type { Respuesta } from "@/db/schema";
import { BotonCopiar } from "./ui";

export function PanelBanco({ respuestas, compacto = false }: { respuestas: Respuesta[]; compacto?: boolean }) {
  const [q, setQ] = useState("");
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return respuestas.filter((r) => !t || `${r.categoria} ${r.pregunta} ${r.respuesta}`.toLowerCase().includes(t));
  }, [q, respuestas]);
  const categorias = [...new Set(filtradas.map((r) => r.categoria))];
  return (
    <div className="flex flex-col gap-2">
      <input className="campo" placeholder="Buscar en tu banco de respuestas…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={`flex flex-col gap-3 overflow-y-auto pr-1 ${compacto ? "max-h-[60vh]" : ""}`}>
        {categorias.map((c) => (
          <div key={c}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{c || "Sin categoría"}</div>
            <div className="flex flex-col gap-1.5">
              {filtradas.filter((r) => r.categoria === c).map((r) => (
                <div key={r.id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium">{r.pregunta}</div>
                    {r.estado === "Completa" && <BotonCopiar texto={r.respuesta} />}
                  </div>
                  {r.estado === "Preguntar a Alex" ? (
                    <div className="aviso mt-1 text-xs">⚠ Decide esta respuesta caso por caso. Chamba no guarda tu expectativa salarial.</div>
                  ) : r.estado === "Pendiente" || !r.respuesta ? (
                    <div className="mt-1 text-xs italic text-zinc-500">Pendiente de escribir (complétala en Banco de respuestas).</div>
                  ) : (
                    <div className="mt-1 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">{r.respuesta}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtradas.length === 0 && <div className="text-sm text-zinc-500">Sin resultados.</div>}
      </div>
    </div>
  );
}
