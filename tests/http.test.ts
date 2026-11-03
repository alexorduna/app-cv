import { describe, expect, it } from "vitest";
import { BloqueadoPorRobots, ClienteHttp, USER_AGENT, parsearRobots, rutaPermitida } from "@/lib/http";

describe("robots.txt", () => {
  const jobgether = `User-agent: *\nCrawl-delay: 2\nAllow: /\nAllow: /astroapi/ai/jobs.json?*\nDisallow: /*?*\nDisallow: /offer/{*}`;
  it("gana la regla más específica", () => {
    const r = parsearRobots(jobgether);
    expect(r.crawlDelay).toBe(2);
    expect(rutaPermitida(r, "/astroapi/ai/jobs.json?keyword=soc&remoteType=full-remote")).toBe(true);
    expect(rutaPermitida(r, "/search?q=x")).toBe(false);
    expect(rutaPermitida(r, "/")).toBe(true);
  });
  it("bloquea rutas prohibidas", () => {
    const r = parsearRobots("User-agent: *\nDisallow: /api/*\nDisallow: /jobs/*");
    expect(rutaPermitida(r, "/api/remote-jobs?category=x")).toBe(false);
    expect(rutaPermitida(r, "/remote-jobs")).toBe(true);
  });
  it("usa el grupo propio de ChambaBot si existe", () => {
    const r = parsearRobots("User-agent: *\nAllow: /\n\nUser-agent: ChambaBot\nDisallow: /");
    expect(rutaPermitida(r, "/x")).toBe(false);
  });
});

describe("cliente HTTP", () => {
  it("no pide lo que robots.txt prohíbe, manda User-Agent genérico y nada más", async () => {
    const pedidas: { url: string; headers: Record<string, string> }[] = [];
    const fetchFalso = async (url: string, init?: RequestInit) => {
      pedidas.push({ url, headers: init?.headers as Record<string, string> });
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /privado");
      return new Response("{}");
    };
    const http = new ClienteHttp({ fetch: fetchFalso, intervaloMinimoMs: 0 });
    await expect(http.get("https://ejemplo.test/privado/1")).rejects.toBeInstanceOf(BloqueadoPorRobots);
    await http.get("https://ejemplo.test/publico");
    const ultima = pedidas.at(-1)!;
    expect(ultima.headers["User-Agent"]).toBe(USER_AGENT);
    expect(Object.keys(ultima.headers).every((h) => ["User-Agent"].includes(h))).toBe(true);
  });
  it("espera al menos el intervalo mínimo entre peticiones al mismo dominio", async () => {
    const tiempos: number[] = [];
    const http = new ClienteHttp({
      fetch: async (url) => {
        if (!url.endsWith("robots.txt")) tiempos.push(Date.now());
        return new Response("ok");
      },
      intervaloMinimoMs: 150,
    });
    await Promise.all([http.get("https://a.test/1"), http.get("https://a.test/2"), http.get("https://a.test/3")]);
    expect(tiempos[1] - tiempos[0]).toBeGreaterThanOrEqual(140);
    expect(tiempos[2] - tiempos[1]).toBeGreaterThanOrEqual(140);
  });
});
