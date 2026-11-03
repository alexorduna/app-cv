import { aLista, quitarHtml } from "@/lib/texto";
import type { Tipo } from "@/db/schema";
import type { CandidataFuente, ContextoFuente, Fuente } from "./tipos";

/** Recorre los slugs configurados; si una empresa falla, avisa y sigue con las demás. */
async function porEmpresa(
  ctx: ContextoFuente,
  clave: string,
  fn: (slug: string) => Promise<CandidataFuente[]>,
): Promise<CandidataFuente[]> {
  const slugs = aLista(ctx.filtros[clave]);
  if (slugs.length === 0) {
    ctx.avisar(`Sin empresas configuradas (${clave}).`);
    return [];
  }
  const salida: CandidataFuente[] = [];
  for (const slug of slugs) {
    try {
      salida.push(...(await fn(slug)));
    } catch (e) {
      ctx.avisar(`${slug}: ${(e as Error).message}`);
    }
  }
  return salida;
}

// ---------- Greenhouse ----------
interface GhRespuesta {
  jobs: { title: string; absolute_url: string; location?: { name?: string }; content?: string }[];
}
export function mapearGreenhouse(r: GhRespuesta, empresa: string): CandidataFuente[] {
  return (r.jobs ?? []).map((j) => ({
    puesto: j.title,
    empresa,
    ubicacion: j.location?.name ?? "",
    descripcion: quitarHtml(quitarHtml(j.content ?? "")), // Greenhouse manda HTML escapado
    enlace: j.absolute_url,
    plataforma: "Greenhouse",
  }));
}
export const greenhouse: Fuente = {
  id: "greenhouse",
  nombre: "Greenhouse (por empresa)",
  descripcion: "API pública boards-api.greenhouse.io. Configura los slugs de empresa en Configuración.",
  clave: "fuente_greenhouse",
  buscar: (ctx) =>
    porEmpresa(ctx, "empresas_greenhouse", async (slug) => {
      const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`;
      const info = await ctx.http.json<{ name?: string }>(base).catch(() => ({ name: slug }));
      const r = await ctx.http.json<GhRespuesta>(`${base}/jobs?content=true`);
      return mapearGreenhouse(r, info.name || slug);
    }),
};

// ---------- Lever ----------
interface LeverPosting {
  text: string;
  hostedUrl: string;
  workplaceType?: string; // remote | hybrid | onsite | unspecified
  descriptionPlain?: string;
  additionalPlain?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}
function tipoPorCompromiso(c = ""): Tipo | undefined {
  if (/intern/i.test(c)) return "Prácticas";
  if (/contract|freelance/i.test(c)) return "Contrato";
  if (/full/i.test(c)) return "Tiempo completo";
  return undefined;
}
export function mapearLever(r: LeverPosting[], empresa: string): CandidataFuente[] {
  return (r ?? []).map((p) => {
    const ubic = p.categories?.allLocations?.length ? p.categories.allLocations.join("; ") : (p.categories?.location ?? "");
    const wt = (p.workplaceType ?? "").toLowerCase();
    const s = p.salaryRange;
    return {
      puesto: p.text,
      empresa,
      ubicacion: wt === "remote" && !/remote/i.test(ubic) ? `Remote - ${ubic}` : ubic,
      remoto: wt === "remote" ? true : wt === "hybrid" || wt === "onsite" ? false : undefined,
      descripcion: `${p.descriptionPlain ?? ""}\n${p.additionalPlain ?? ""}`,
      enlace: p.hostedUrl,
      tipo: tipoPorCompromiso(p.categories?.commitment),
      salario: s && (s.min || s.max) ? `${s.currency ?? ""} ${s.min ?? "?"}-${s.max ?? "?"} ${s.interval ?? ""}`.trim() : "",
      plataforma: "Lever",
    };
  });
}
export const lever: Fuente = {
  id: "lever",
  nombre: "Lever (por empresa)",
  descripcion: "API pública api.lever.co/v0/postings. Configura los slugs de empresa en Configuración.",
  clave: "fuente_lever",
  buscar: (ctx) =>
    porEmpresa(ctx, "empresas_lever", async (slug) =>
      mapearLever(await ctx.http.json<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`), slug),
    ),
};

// ---------- Ashby ----------
interface AshbyRespuesta {
  jobs: {
    title: string;
    location?: string;
    secondaryLocations?: { location?: string }[];
    isRemote?: boolean;
    workplaceType?: string; // Remote | Hybrid | OnSite
    employmentType?: string; // FullTime | PartTime | Intern | Contract | Temporary
    jobUrl: string;
    descriptionPlain?: string;
    compensation?: { compensationTierSummary?: string };
  }[];
}
export function mapearAshby(r: AshbyRespuesta, empresa: string): CandidataFuente[] {
  return (r.jobs ?? []).map((j) => {
    const ubic = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean).join("; ");
    const wt = (j.workplaceType ?? "").toLowerCase();
    const et = j.employmentType ?? "";
    return {
      puesto: j.title,
      empresa,
      ubicacion: j.isRemote && !/remote/i.test(ubic) ? `Remote - ${ubic}` : ubic,
      remoto: wt === "hybrid" || wt === "onsite" ? false : j.isRemote ? true : undefined,
      descripcion: j.descriptionPlain ?? "",
      enlace: j.jobUrl,
      tipo: et === "Intern" ? "Prácticas" : et === "Contract" || et === "Temporary" ? "Contrato" : et === "FullTime" ? "Tiempo completo" : undefined,
      salario: j.compensation?.compensationTierSummary ?? "",
      plataforma: "Ashby",
    };
  });
}
export const ashby: Fuente = {
  id: "ashby",
  nombre: "Ashby (por empresa)",
  descripcion: "API pública api.ashbyhq.com/posting-api. Configura los slugs de empresa en Configuración.",
  clave: "fuente_ashby",
  buscar: (ctx) =>
    porEmpresa(ctx, "empresas_ashby", async (slug) =>
      mapearAshby(
        await ctx.http.json<AshbyRespuesta>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`),
        slug,
      ),
    ),
};
