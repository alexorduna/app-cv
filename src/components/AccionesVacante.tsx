"use client";
import { useTransition } from "react";
import type { Estado } from "@/db/schema";
import { cambiarEstadoAccion, marcarAplicadaAccion } from "@/app/acciones";

export function AccionesVacante({ id, enlace, estado }: { id: number; enlace: string; estado: Estado }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <a className={`btn-primario ${enlace ? "" : "pointer-events-none opacity-50"}`} href={enlace || undefined} target="_blank" rel="noopener noreferrer">
        Abrir enlace ↗
      </a>
      <button className="btn-sec" disabled={pendiente || estado === "Lista para aplicar"} onClick={() => iniciar(() => cambiarEstadoAccion(id, "Lista para aplicar"))}>
        Marcar lista
      </button>
      <button className="btn-sec" disabled={pendiente || estado === "Aplicada"} onClick={() => iniciar(() => marcarAplicadaAccion(id))}>
        Marcar aplicada (hoy)
      </button>
      <button
        className="btn-peligro"
        disabled={pendiente || estado === "Descartada"}
        onClick={() => {
          const motivo = window.prompt("Motivo del descarte:");
          if (motivo !== null) iniciar(() => cambiarEstadoAccion(id, "Descartada", motivo));
        }}
      >
        Descartar…
      </button>
    </div>
  );
}
