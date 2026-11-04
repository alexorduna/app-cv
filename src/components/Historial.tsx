"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Vacante } from "@/db/schema";
import { restaurarAccion } from "@/app/acciones";
import { TextoArea } from "./ui";

type Fila = Pick<Vacante, "id" | "puesto" | "empresa" | "area" | "plataforma" | "motivoDescarte" | "fechaDescarte" | "fechaAplicacion" | "enlace">;

export function Historial({ filas }: { filas: Fila[] }) {
  const [q, setQ] = useState("");
  const [pendiente, iniciar] = useTransition();
  const t = q.toLowerCase();
  const visibles = filas.filter((f) => !t || `${f.puesto} ${f.empresa} ${f.motivoDescarte} ${f.plataforma}`.toLowerCase().includes(t));
  if (filas.length === 0) return <p className="text-sm text-zinc-500">Todavía no has descartado nada.</p>;
  return (
    <div className="flex flex-col gap-2">
      <input className="campo max-w-sm" placeholder="Buscar por puesto, empresa o motivo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
            <tr><th className="px-3 py-2">Fecha</th><th>Vacante</th><th>Tu motivo</th><th></th></tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{f.fechaDescarte ?? ""}</td>
                <td className="py-2 pr-2">
                  <Link prefetch={false} href={`/vacante/${f.id}`} className="font-medium hover:underline">{f.puesto}</Link>
                  <div className="text-xs text-zinc-500">
                    <TextoArea area={f.area} /> · {f.empresa} · {f.plataforma}{f.fechaAplicacion ? ` · aplicaste el ${f.fechaAplicacion}` : ""}
                  </div>
                </td>
                <td className="py-2 pr-2 text-xs">{f.motivoDescarte || <span className="text-zinc-400">sin motivo</span>}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">
                  {f.enlace && <a className="enlace mr-2 text-xs" href={f.enlace} target="_blank" rel="noopener noreferrer">Abrir ↗</a>}
                  <button className="btn-sec btn-chico" disabled={pendiente} onClick={() => iniciar(() => restaurarAccion(f.id))}>Restaurar al tablero</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
