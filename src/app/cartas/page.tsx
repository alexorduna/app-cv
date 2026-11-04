import Link from "next/link";
import { leerDb } from "@/db/servidor";
import { EditorCarta } from "@/components/EditorCarta";
import { Prioridad, TextoArea } from "@/components/ui";
import { cartasDe, revisar } from "@/lib/cartas";
import { configIA } from "@/lib/cartas/proveedores";
import { leerFiltros } from "@/lib/filtros/repo";
import { listarVacantes, obtenerVacante } from "@/lib/vacantes";

export const dynamic = "force-dynamic";

export default async function PaginaCartas({ searchParams }: { searchParams: Promise<{ vacante?: string }> }) {
  const { vacante } = await searchParams;
  const db = await leerDb();
  const lista = listarVacantes(db).filter((v) => v.estado !== "Descartada");
  const conCartas = new Map(lista.map((v) => [v.id, cartasDe(db, v.id)]));
  const elegida = vacante ? obtenerVacante(db, Number(vacante)) : lista.find((v) => v.estado === "Lista para aplicar") ?? lista[0];
  const cartas = elegida ? cartasDe(db, elegida.id) : [];
  const ia = configIA(leerFiltros(db));
  const nombreProveedor = ia.proveedor === "ollama" ? `Ollama (${ia.ollamaModelo})` : ia.proveedor === "anthropic" ? `Anthropic (${ia.anthropicModelo})` : "mock (plantilla, sin IA)";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titulo">Cartas</h1>
        <p className="subtitulo">Borradores con tu plantilla, tu perfil y los datos de la vacante. Nada se aprueba sin ti; se revisa que no invente datos, no mencione salario y no use rayas largas.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="flex max-h-[75vh] flex-col gap-1 overflow-y-auto">
          {lista.map((v) => {
            const cs = conCartas.get(v.id) ?? [];
            const estado = cs.some((c) => c.estado === "Aprobada") ? "✔ Aprobada" : cs.length ? `${cs.length} borrador(es)` : "Sin carta";
            return (
              <Link
                key={v.id}
                href={`/cartas?vacante=${v.id}`}
                className={`rounded-md border px-2.5 py-2 text-sm ${elegida?.id === v.id ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
              >
                <div className="flex items-center justify-between"><TextoArea area={v.area} /><Prioridad p={v.prioridad} /></div>
                <div className="font-medium leading-snug">{v.puesto}</div>
                <div className="text-xs text-zinc-500">{v.empresa} · {estado}</div>
              </Link>
            );
          })}
        </div>
        <div className="tarjeta">
          {elegida ? (
            <>
              <div className="mb-3">
                <h2 className="text-lg font-semibold">{elegida.puesto}</h2>
                <div className="subtitulo">{elegida.empresa} · <Link prefetch={false} className="enlace" href={`/vacante/${elegida.id}`}>ver vacante</Link> · <Link prefetch={false} className="enlace" href="/configuracion#perfil">editar perfil y plantilla</Link></div>
              </div>
              <EditorCarta
                key={`${elegida.id}-${cartas.length}`}
                vacanteId={elegida.id}
                cartas={cartas}
                revisionInicial={cartas[0] ? revisar(db, cartas[0]) : null}
                proveedor={nombreProveedor}
              />
            </>
          ) : (
            <p className="text-sm text-zinc-500">No hay vacantes activas.</p>
          )}
        </div>
      </div>
    </div>
  );
}
