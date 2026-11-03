import type { Fuente } from "./tipos";

/**
 * Fuentes revisadas que NO se pueden leer de forma limpia. Se dejan visibles en Configuración
 * para que quede claro por qué están apagadas. Detalles en NOTAS.md.
 */
export const remotive: Fuente = {
  id: "remotive",
  nombre: "Remotive",
  descripcion: "Su robots.txt prohíbe /api/* y /jobs/*. Se intenta solo si la enciendes y el cliente HTTP la bloqueará mientras robots.txt lo prohíba.",
  clave: "fuente_remotive",
  async buscar(ctx) {
    const r = await ctx.http.json<{ jobs: { title: string; company_name: string; url: string; candidate_required_location?: string; job_type?: string; salary?: string; description?: string }[] }>(
      "https://remotive.com/api/remote-jobs?category=software-dev",
    );
    return r.jobs.map((j) => ({
      puesto: j.title,
      empresa: j.company_name,
      ubicacion: `Remote - ${j.candidate_required_location ?? ""}`,
      remoto: true,
      enlace: j.url,
      salario: j.salary ?? "",
      descripcion: j.description ?? "",
    }));
  },
};

export const remoteRocketship: Fuente = {
  id: "remoterocketship",
  nombre: "RemoteRocketship",
  descripcion: "Su API exige suscripción de pago y API key (ver remoterocketship.com/llms.txt). No se implementa para no guardar tokens.",
  clave: "fuente_remoterocketship",
  bloqueada: true,
  async buscar() {
    throw new Error("RemoteRocketship requiere API key de suscriptor; fuente desactivada.");
  },
};

export const isecjobs: Fuente = {
  id: "isecjobs",
  nombre: "isecjobs.com",
  descripcion: "isecjobs.com (incluido robots.txt y /feed) redirige a foorilla.com; no hay RSS ni API limpia. Desactivada.",
  clave: "fuente_isecjobs",
  bloqueada: true,
  async buscar() {
    throw new Error("isecjobs.com redirige a foorilla.com y no ofrece RSS/API; fuente desactivada.");
  },
};
