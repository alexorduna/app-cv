/** Se muestra al instante mientras la página lee los datos (del Sheet en línea). */
export default function Cargando() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Cargando">
      <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-80 max-w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <span className="text-sm text-zinc-500">Cargando…</span>
    </div>
  );
}
