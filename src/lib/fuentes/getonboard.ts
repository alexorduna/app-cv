import { aLista, quitarHtml } from "@/lib/texto";
import type { CandidataFuente, Fuente } from "./tipos";

interface RespuestaGob {
  data: {
    id: string;
    attributes: {
      title: string;
      description?: string;
      remote: boolean;
      remote_modality?: string;
      countries?: string[];
      min_salary?: number | null;
      max_salary?: number | null;
      company?: { data?: { attributes?: { name?: string } } };
      seniority?: { data?: { id?: string | number } };
    };
    links?: { public_url?: string };
  }[];
  meta?: { page: number; total_pages: number };
}

/** Catálogo de /api/v0/seniorities. */
const SENIORITY_GOB: Record<string, string> = { "1": "No experience", "2": "Junior", "3": "Semi Senior", "4": "Senior", "5": "Expert" };

export function mapearGetOnBoard(r: RespuestaGob): CandidataFuente[] {
  return (r.data ?? []).map((d) => {
    const a = d.attributes;
    const modalidad = a.remote_modality ?? "";
    const paises = (a.countries ?? []).filter(Boolean);
    const salario = a.min_salary || a.max_salary ? `USD ${a.min_salary ?? "?"}-${a.max_salary ?? "?"} / mes` : "";
    return {
      puesto: a.title,
      empresa: a.company?.data?.attributes?.name ?? "",
      ubicacion: modalidad === "hybrid" ? `Hybrid ${paises.join(", ")}` : paises.length ? paises.join("; ") : "Remote",
      remoto: a.remote && (modalidad === "fully_remote" || modalidad === "remote_local" || modalidad === ""),
      descripcion: `${quitarHtml(a.description ?? "")}${modalidad === "remote_local" ? "\n(Get on Board: remoto local, puede pedir residir en el país de la empresa)" : ""}`,
      enlace: d.links?.public_url ?? `https://www.getonbrd.com/jobs/${d.id}`,
      salario,
      nivel: SENIORITY_GOB[String(a.seniority?.data?.id ?? "")],
    };
  });
}

export const getOnBoard: Fuente = {
  id: "getonboard",
  nombre: "Get on Board",
  descripcion: "API pública de getonbrd.com (búsqueda por palabras clave). Bolsa enfocada en LATAM.",
  clave: "fuente_getonboard",
  async buscar(ctx) {
    const consultas = aLista(ctx.filtros.consultas_busqueda);
    const salida: CandidataFuente[] = [];
    for (const q of consultas) {
      const url = `https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&per_page=50&page=1&expand=${encodeURIComponent('["company"]')}`;
      salida.push(...mapearGetOnBoard(await ctx.http.json<RespuestaGob>(url)));
    }
    return salida;
  },
};
