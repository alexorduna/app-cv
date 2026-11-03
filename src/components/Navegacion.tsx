"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Tablero" },
  { href: "/aplicar", texto: "Aplicar asistido" },
  { href: "/cartas", texto: "Cartas" },
  { href: "/buscar", texto: "Buscar vacantes" },
  { href: "/banco", texto: "Banco de respuestas" },
  { href: "/configuracion", texto: "Configuración" },
];

export function Navegacion({ nuevas }: { nuevas: number }) {
  const ruta = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ENLACES.map((e) => {
        const activo = e.href === "/" ? ruta === "/" || ruta.startsWith("/vacante") : ruta.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
              activo
                ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {e.texto}
            {e.href === "/buscar" && nuevas > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">{nuevas}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
