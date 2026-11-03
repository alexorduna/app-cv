"use client";
import { useState } from "react";

const COLOR_ESTADO: Record<string, string> = {
  "Por revisar": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "Lista para aplicar": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  Aplicada: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  "Respuesta recibida": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  Entrevista: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Prueba técnica": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Oferta: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Rechazada: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "Sin respuesta": "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  Descartada: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function InsigniaEstado({ estado }: { estado: string }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${COLOR_ESTADO[estado] ?? ""}`}>{estado}</span>;
}

const COLOR_AREA: Record<string, string> = {
  Ofensiva: "text-red-700 dark:text-red-400",
  Defensiva: "text-sky-700 dark:text-sky-400",
  Software: "text-zinc-600 dark:text-zinc-400",
};

export function TextoArea({ area }: { area: string }) {
  return <span className={`text-xs font-semibold ${COLOR_AREA[area] ?? "text-zinc-500"}`}>{area || "Sin área"}</span>;
}

export function Prioridad({ p }: { p: number }) {
  const c = p === 1 ? "bg-red-600" : p === 2 ? "bg-amber-500" : "bg-zinc-400";
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={`Prioridad ${p}`}>
      <span className={`h-2 w-2 rounded-full ${c}`} />P{p}
    </span>
  );
}

export function BotonCopiar({ texto, etiqueta = "Copiar", className = "btn-sec btn-chico" }: { texto: string; etiqueta?: string; className?: string }) {
  const [hecho, setHecho] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setHecho(true);
    setTimeout(() => setHecho(false), 1200);
  };
  return (
    <button type="button" onClick={copiar} className={className} disabled={!texto}>
      {hecho ? "✔ Copiado" : etiqueta}
    </button>
  );
}
