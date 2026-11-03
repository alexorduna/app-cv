import { aLista } from "@/lib/texto";
import type { Tipo } from "@/db/schema";
import type { CandidataFuente, Fuente } from "./tipos";

interface RespuestaJobgether {
  jobs: {
    id: string;
    title: string;
    company: string;
    url: string;
    location?: string;
    remote?: string;
    contractType?: string;
    salaryRange?: string;
  }[];
}

function tipoJobgether(c = ""): Tipo | undefined {
  if (/intern/i.test(c)) return "Prácticas";
  if (/freelance|fixed/i.test(c)) return "Contrato";
  if (/full/i.test(c)) return "Tiempo completo";
  return undefined;
}

export function mapearJobgether(r: RespuestaJobgether): CandidataFuente[] {
  return (r.jobs ?? []).map((j) => ({
    puesto: j.title,
    empresa: j.company,
    ubicacion: `Remote - ${j.location || "sin especificar"}`,
    remoto: j.remote ? /full remote/i.test(j.remote) : undefined,
    enlace: j.url,
    salario: j.salaryRange ?? "",
    tipo: tipoJobgether(j.contractType),
  }));
}

export const jobgether: Fuente = {
  id: "jobgether",
  nombre: "Jobgether",
  descripcion: "API pública documentada en jobgether.com/llms.txt (permitida en robots.txt, Crawl-delay 2 s).",
  clave: "fuente_jobgether",
  async buscar(ctx) {
    const salida: CandidataFuente[] = [];
    for (const q of aLista(ctx.filtros.consultas_busqueda)) {
      // Máximo dos parámetros: robots.txt de Jobgether bloquea URLs con muchos "&".
      const url = `https://jobgether.com/astroapi/ai/jobs.json?keyword=${encodeURIComponent(q)}&remoteType=full-remote`;
      salida.push(...mapearJobgether(await ctx.http.json<RespuestaJobgether>(url)));
    }
    return salida;
  },
};
