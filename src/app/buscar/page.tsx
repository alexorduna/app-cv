import Link from "next/link";
import { leerDb } from "@/db/servidor";
import { ejecucionesFuentes } from "@/db/schema";
import { BandejaNuevas, BotonBuscar, ListaDescartadas, PegarAlerta, PegarEnlace } from "@/components/Buscar";
import { FUENTES } from "@/lib/fuentes";
import { leerFiltros } from "@/lib/filtros/repo";
import { listarDescartadasAuto, listarNuevas } from "@/lib/vacantes";

export const dynamic = "force-dynamic";

const PESTANAS = [
  { id: "nuevas", texto: "Nuevas" },
  { id: "fuentes", texto: "Fuentes" },
  { id: "alerta", texto: "Pegar alerta" },
  { id: "enlace", texto: "Pegar enlace" },
  { id: "descartadas", texto: "Descartadas por filtros" },
];

export default async function PaginaBuscar({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "nuevas" } = await searchParams;
  const db = await leerDb();
  const nuevas = listarNuevas(db);
  const valores = leerFiltros(db);
  const ejecuciones = new Map(db.select().from(ejecucionesFuentes).all().map((e) => [e.fuente, e]));
  const activas = FUENTES.filter((f) => valores[f.clave] === "1" && !f.bloqueada);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titulo">Buscar vacantes</h1>
        <p className="subtitulo">Todo pasa por tus filtros. Lo que pasa llega a Nuevas como &quot;Por revisar&quot;; lo que no, queda como Descartada con motivo.</p>
      </div>
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {PESTANAS.map((p) => (
          <Link
            key={p.id}
            href={`/buscar?tab=${p.id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === p.id ? "border-emerald-600 font-semibold text-emerald-700 dark:text-emerald-400" : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
          >
            {p.texto}{p.id === "nuevas" && nuevas.length ? ` (${nuevas.length})` : ""}
          </Link>
        ))}
      </div>

      {tab === "nuevas" && <BandejaNuevas nuevas={nuevas} />}

      {tab === "fuentes" && (
        <div className="flex flex-col gap-4">
          {process.env.CHAMBA_BUSQUEDA_EXTERNA === "1" ? (
            <div className="aviso flex flex-col gap-1">
              <div>
                En línea, la búsqueda corre sola en GitHub Actions cada 6 horas y guarda los resultados en tu Google Sheet
                (en Netlify se cortaría a los pocos segundos).
              </div>
              <a
                className="enlace w-fit font-medium"
                href={`https://github.com/${process.env.CHAMBA_REPO_GITHUB || "alexorduna/app-cv"}/actions/workflows/buscar.yml`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Correr la búsqueda ahora en GitHub (botón &quot;Run workflow&quot;) ↗
              </a>
            </div>
          ) : (
            <BotonBuscar hayActivas={activas.length > 0} />
          )}
          <div className="tarjeta p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <tr><th className="px-3 py-2">Fuente</th><th>Estado</th><th>Última ejecución</th><th className="pr-3">Resultado</th></tr>
              </thead>
              <tbody>
                {FUENTES.map((f) => {
                  const e = ejecuciones.get(f.id);
                  const activa = valores[f.clave] === "1" && !f.bloqueada;
                  return (
                    <tr key={f.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
                      <td className="px-3 py-2"><div className="font-medium">{f.nombre}</div><div className="text-xs text-zinc-500">{f.descripcion}</div></td>
                      <td className="py-2 text-xs">{activa ? <span className="text-emerald-700 dark:text-emerald-400">Activa</span> : f.bloqueada ? <span className="text-red-600">No disponible</span> : "Apagada"}</td>
                      <td className="py-2 text-xs text-zinc-500">{e ? e.fecha.slice(0, 16).replace("T", " ") : "Nunca"}</td>
                      <td className={`py-2 pr-3 text-xs ${e && !e.ok ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                        {e ? `${e.ok ? "" : "Error: "}${e.encontradas} leídas, ${e.nuevas} nuevas. ${e.mensaje}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">Enciende o apaga fuentes, empresas y listas de GitHub en <Link className="enlace" href="/configuracion#fuentes">Configuración</Link>. Se respeta robots.txt, máximo 1 petición por segundo por dominio, User-Agent &quot;ChambaBot&quot; y no se envían tus datos.</p>
        </div>
      )}

      {tab === "alerta" && <PegarAlerta />}
      {tab === "enlace" && <PegarEnlace />}
      {tab === "descartadas" && <ListaDescartadas filas={listarDescartadasAuto(db, 5000)} />}
    </div>
  );
}
