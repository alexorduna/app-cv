"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Respuesta, Vacante } from "@/db/schema";
import type { InfoAts } from "@/lib/ats";
import { marcarAplicadaAccion } from "@/app/acciones";
import { PanelBanco } from "./PanelBanco";
import { BotonCopiar, Prioridad, TextoArea } from "./ui";

export interface ItemCola {
  vacante: Vacante;
  ats: InfoAts | null;
  carta: string | null;
}

export function Aplicar({ cola, respuestas }: { cola: ItemCola[]; respuestas: Respuesta[] }) {
  const [actualId, setActualId] = useState<number | null>(cola[0]?.vacante.id ?? null);
  const [abiertas, setAbiertas] = useState<number[]>([]);
  const [pendiente, iniciar] = useTransition();
  const actual = cola.find((c) => c.vacante.id === actualId) ?? cola[0];
  const hayPreguntarAlex = respuestas.some((r) => r.estado === "Preguntar a Alex");

  if (!actual) {
    return (
      <div className="tarjeta text-sm">
        No hay vacantes en &quot;Lista para aplicar&quot;. Marca algunas desde el <Link href="/" className="enlace">Tablero</Link> o la bandeja de <Link href="/buscar" className="enlace">Nuevas</Link>.
      </div>
    );
  }
  const v = actual.vacante;
  const abrir = () => {
    window.open(v.enlace, "_blank", "noopener,noreferrer");
    setAbiertas((a) => [...a, v.id]);
  };
  const yaAplique = () => {
    const siguiente = cola.find((c) => c.vacante.id !== v.id);
    iniciar(async () => {
      await marcarAplicadaAccion(v.id);
      setActualId(siguiente?.vacante.id ?? null);
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[16rem_1fr_24rem]">
      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cola ({cola.length})</div>
        {cola.map((c) => (
          <button
            key={c.vacante.id}
            onClick={() => setActualId(c.vacante.id)}
            className={`rounded-md border px-2.5 py-2 text-left text-sm ${c.vacante.id === v.id ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
          >
            <div className="flex items-center justify-between"><TextoArea area={c.vacante.area} /><Prioridad p={c.vacante.prioridad} /></div>
            <div className="font-medium leading-snug">{c.vacante.puesto}</div>
            <div className="text-xs text-zinc-500">{c.vacante.empresa}{abiertas.includes(c.vacante.id) ? " · abierta" : ""}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="tarjeta flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2"><TextoArea area={v.area} /><Prioridad p={v.prioridad} /></div>
            <h2 className="text-lg font-semibold">{v.puesto}</h2>
            <div className="subtitulo">{v.empresa} · {v.region} · {v.tipo}{v.horasPorDia ? ` · ${v.horasPorDia} h/día` : ""}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primario" onClick={abrir} disabled={!v.enlace}>Abrir enlace en pestaña nueva ↗</button>
            <button className="btn-sec" onClick={yaAplique} disabled={pendiente}>✔ Ya apliqué</button>
            <Link className="btn-sec" href={`/vacante/${v.id}`}>Ver detalle</Link>
          </div>
          <p className="text-xs text-zinc-500">Chamba nunca envía la solicitud: tú llenas y envías el formulario en la otra pestaña. &quot;Ya apliqué&quot; solo registra la fecha de hoy.</p>
          {v.notas && <div className="aviso whitespace-pre-line text-xs">{v.notas}</div>}
        </div>

        <div className="tarjeta">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Carta aprobada</div>
            {actual.carta && <BotonCopiar texto={actual.carta} etiqueta="Copiar carta" className="btn-primario btn-chico" />}
          </div>
          {actual.carta ? (
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-zinc-700 dark:text-zinc-300">{actual.carta}</pre>
          ) : (
            <p className="text-sm text-zinc-500">Sin carta aprobada. <Link className="enlace" href={`/cartas?vacante=${v.id}`}>Generar y aprobar una</Link>.</p>
          )}
        </div>

        <div className="tarjeta">
          <div className="mb-1 text-sm font-semibold">Campos que suele pedir {actual.ats ? actual.ats.nombre : "este sitio"}</div>
          {actual.ats ? (
            <>
              <ul className="list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">{actual.ats.campos.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="mt-2 text-xs text-zinc-500">{actual.ats.consejo}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No reconozco el ATS por la URL. Normalmente: datos de contacto, CV, LinkedIn y preguntas de elegibilidad.</p>
          )}
        </div>
      </div>

      <div className="tarjeta flex flex-col gap-2">
        <div className="text-sm font-semibold">Banco de respuestas</div>
        {hayPreguntarAlex && <div className="aviso text-xs">Si el formulario pide expectativa salarial, decídela tú para esta vacante. No se guarda en Chamba.</div>}
        <PanelBanco respuestas={respuestas} compacto />
      </div>
    </div>
  );
}
