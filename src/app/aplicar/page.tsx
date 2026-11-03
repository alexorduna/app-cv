import { leerDb } from "@/db/servidor";
import { bancoRespuestas } from "@/db/schema";
import { Aplicar, type ItemCola } from "@/components/Aplicar";
import { detectarAts } from "@/lib/ats";
import { cartaAprobada } from "@/lib/cartas";
import { colaParaAplicar } from "@/lib/vacantes";

export const dynamic = "force-dynamic";

export default async function PaginaAplicar() {
  const db = await leerDb();
  const cola: ItemCola[] = colaParaAplicar(db).map((v) => ({
    vacante: v,
    ats: detectarAts(v.enlace),
    carta: cartaAprobada(db, v.id)?.texto ?? null,
  }));
  const respuestas = db.select().from(bancoRespuestas).orderBy(bancoRespuestas.categoria, bancoRespuestas.id).all();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titulo">Aplicar asistido</h1>
        <p className="subtitulo">Vacantes en &quot;Lista para aplicar&quot;, por prioridad. Abre, copia, pega y envía tú.</p>
      </div>
      <Aplicar cola={cola} respuestas={respuestas} />
    </div>
  );
}
