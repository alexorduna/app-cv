import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listasGithub, vacantes } from "@/db/schema";
import { evaluar } from "@/lib/filtros/motor";
import {
  FormatoNoReconocido, parsearListaEnlaces, parsearListingsJson, parsearReadme, parsearTablasHtml, parsearTablasMarkdown,
} from "@/lib/fuentes/github-parsers";
import { github, leerLista, normalizarRepo } from "@/lib/fuentes/github";
import { buscarVacantes } from "@/lib/buscar";
import { guardarFiltro } from "@/lib/filtros/repo";
import { ClienteHttp } from "@/lib/http";
import { bdDePrueba } from "./ayuda";

const fx = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures/github", n), "utf8");

/** fetch falso: sirve archivos de ejemplo por URL, sin tocar internet. */
function fetchFalso(rutas: Record<string, string | { status: number; body?: string; headers?: Record<string, string> }>) {
  const llamadas: string[] = [];
  const fn = async (url: string) => {
    llamadas.push(url);
    const r = rutas[url];
    if (r === undefined) return new Response("no encontrado", { status: 404 });
    if (typeof r === "string") return new Response(r, { status: 200, headers: { "x-ratelimit-remaining": "55" } });
    return new Response(r.body ?? "", { status: r.status, headers: r.headers });
  };
  return { fn, llamadas };
}

describe("lectores de listas (archivos de ejemplo)", () => {
  it("lee listings.json y aplica marcas 🔒 🇺🇸 🛂", () => {
    const c = parsearListingsJson(fx("listings.json"), "Prácticas");
    expect(c).toHaveLength(7); // el no visible se omite
    const veredictos = Object.fromEntries(c.map((x) => [x.empresa, evaluar(x)]));
    expect(veredictos["Ficticia Sec"].pasa).toBe(true);
    expect(veredictos["Ficticia Sec"].area).toBe("Ofensiva");
    expect(veredictos["Ejemplo Cloud"].motivo).toMatch(/EE\. UU\./);
    expect(veredictos["Cerrada Corp"].motivo).toMatch(/🔒/);
    expect(veredictos["Gobierno Demo"].motivo).toMatch(/🇺🇸/);
    expect(veredictos["Chips Ficticios"].pasa).toBe(false);
    expect(veredictos["Patrocinio No"].motivo).toMatch(/🛂/);
    expect(veredictos["Híbrida Inc"].motivo).toMatch(/[Hh]íbrida/);
  });

  it("lee tablas HTML del README (↳, emojis, varias ubicaciones, cerradas)", () => {
    const c = parsearTablasHtml(fx("README-html.md"));
    expect(c.map((x) => x.empresa)).toEqual(["Ficticia Seguridad", "Ficticia Seguridad", "Demo Defensa", "Otra Empresa", "Vieja SA"]);
    expect(c[0].enlace).toBe("https://jobs.ashbyhq.com/ficticia/aaa?utm_source=Simplify&ref=Simplify");
    expect(c[1].puesto).toBe("Security Engineer");
    expect(c[1].marcas?.sinPatrocinio).toBe(true);
    expect(c[2].marcas?.ciudadania).toBe(true);
    expect(c[3].ubicacion).toBe("Remote in Canada; Remote in Mexico; NYC");
    expect(evaluar(c[3]).pasa).toBe(true); // una de sus ubicaciones es México remoto
    expect(c[4].marcas?.cerrada).toBe(true);
    expect(evaluar(c[0]).pasa).toBe(true);
  });

  it("lee tablas Markdown", () => {
    const c = parsearTablasMarkdown(fx("README-markdown.md"), "Prácticas");
    expect(c).toHaveLength(4);
    expect(c[1].empresa).toBe("Ejemplo Labs");
    expect(c[0].enlace).toBe("https://example.com/appsec");
    expect(c[2].marcas?.cerrada).toBe(true);
    expect(c[3].enlace).toBe("https://example.com/py");
    expect(c.filter((x) => evaluar(x).pasa).map((x) => x.puesto)).toEqual(["Application Security Intern", "Python Developer Intern"]);
  });

  it("trata un directorio de empresas como lista de enlaces", () => {
    const c = parsearListaEnlaces(fx("README-enlaces.md"));
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ empresa: "Ficticia Mandarina", puesto: "Security Consultant Intern, Summer 2027" });
    expect(c[0].ubicacion).toContain("Mountain View");
    expect(evaluar(c[0]).pasa).toBe(false);
    expect(c[1]).toMatchObject({ empresa: "Ejemplo Grep", ubicacion: "Remote" });
    expect(evaluar(c[1]).pasa).toBe(true);
  });

  it("si no entiende el formato, lanza FormatoNoReconocido en vez de adivinar", () => {
    expect(() => parsearReadme(fx("README-raro.md"), "auto")).toThrow(FormatoNoReconocido);
    expect(() => parsearListingsJson('{"no":"lista"}')).toThrow(FormatoNoReconocido);
  });

  it("normaliza nombres de repo", () => {
    expect(normalizarRepo("https://github.com/SimplifyJobs/New-Grad-Positions.git")).toBe("SimplifyJobs/New-Grad-Positions");
    expect(normalizarRepo("paralax/awesome-cybersecurity-internships")).toBe("paralax/awesome-cybersecurity-internships");
    expect(normalizarRepo("no es repo")).toBeNull();
  });
});

describe("lectura de una lista con SHA (fetch falso)", () => {
  const API = "https://api.github.com";
  const RAW = "https://raw.githubusercontent.com";
  const repo = "Ejemplo/Internships";

  it("usa la rama por defecto, prefiere listings.json y guarda el SHA", async () => {
    const { fn, llamadas } = fetchFalso({
      [`${API}/repos/${repo}`]: JSON.stringify({ default_branch: "dev" }),
      [`${API}/repos/${repo}/commits/dev`]: "abc123",
      [`${RAW}/${repo}/abc123/.github/scripts/listings.json`]: fx("listings.json"),
    });
    const http = new ClienteHttp({ fetch: fn, intervaloMinimoMs: 0 });
    const r = await leerLista(http, { repo, rama: "", formato: "auto", ultimoSha: null });
    expect(r.sha).toBe("abc123");
    expect(r.candidatas).toHaveLength(7);
    expect(r.candidatas[0].tipo).toBe("Prácticas");
    expect(llamadas.every((u) => u.startsWith(API) || u.startsWith(RAW))).toBe(true);

    const otra = await leerLista(http, { repo, rama: "", formato: "auto", ultimoSha: "abc123" });
    expect(otra.sinCambios).toBe(true);
    expect(otra.candidatas).toHaveLength(0);
  });

  it("si no hay listings.json usa el README", async () => {
    const { fn } = fetchFalso({
      [`${API}/repos/${repo}/commits/main`]: "s1",
      [`${RAW}/${repo}/s1/README.md`]: fx("README-html.md"),
    });
    const r = await leerLista(new ClienteHttp({ fetch: fn, intervaloMinimoMs: 0 }), { repo, rama: "main", formato: "auto", ultimoSha: null });
    expect(r.formato).toBe("README.md");
    expect(r.candidatas).toHaveLength(5);
  });

  it("respeta el límite de la API de GitHub", async () => {
    const { fn } = fetchFalso({
      [`${API}/repos/${repo}/commits/main`]: { status: 403, body: "rate limited", headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" } },
    });
    await expect(
      leerLista(new ClienteHttp({ fetch: fn, intervaloMinimoMs: 0 }), { repo, rama: "main", formato: "auto", ultimoSha: null }),
    ).rejects.toThrow(/limitó/);
  });
});

describe("fuente GitHub completa", () => {
  let notas: string;
  beforeEach(() => {
    notas = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chamba-")), "NOTAS.md");
    process.env.CHAMBA_NOTAS_PATH = notas;
  });

  it("guarda lo que pasa como Por revisar y lo demás como Descartada; desactiva listas ilegibles", async () => {
    const db = bdDePrueba();
    db.insert(listasGithub).values([
      { repo: "Ejemplo/Buena", rama: "main", formato: "auto", activa: 1 },
      { repo: "Ejemplo/Rara", rama: "main", formato: "auto", activa: 1 },
    ]).run();
    for (const k of ["fuente_getonboard", "fuente_jobgether", "fuente_greenhouse", "fuente_lever", "fuente_ashby"]) guardarFiltro(db, k, "0");
    const { fn } = fetchFalso({
      "https://api.github.com/repos/Ejemplo/Buena/commits/main": "s1",
      "https://raw.githubusercontent.com/Ejemplo/Buena/s1/README.md": fx("README-markdown.md"),
      "https://api.github.com/repos/Ejemplo/Rara/commits/main": "s2",
      "https://raw.githubusercontent.com/Ejemplo/Rara/s2/README.md": fx("README-raro.md"),
    });
    const [res] = await buscarVacantes(db, { http: new ClienteHttp({ fetch: fn, intervaloMinimoMs: 0 }) });
    expect(res.fuente).toBe(github.id);
    expect(res.nuevas).toBe(2);
    expect(res.descartadas).toBe(2);
    const todas = db.select().from(vacantes).all();
    expect(todas.filter((v) => v.estado === "Por revisar")).toHaveLength(2);
    expect(todas.filter((v) => v.estado === "Descartada").every((v) => v.motivoDescarte.length > 0)).toBe(true);

    const rara = db.select().from(listasGithub).where(eq(listasGithub.repo, "Ejemplo/Rara")).get()!;
    expect(rara.activa).toBe(0);
    expect(rara.ultimoError).toMatch(/Formato no reconocido/);
    expect(fs.readFileSync(notas, "utf8")).toMatch(/Ejemplo\/Rara/);

    // Segunda corrida: mismo SHA, no repite trabajo ni duplica
    const [res2] = await buscarVacantes(db, { http: new ClienteHttp({ fetch: fn, intervaloMinimoMs: 0 }) });
    expect(res2.encontradas).toBe(0);
    expect(db.select().from(vacantes).all()).toHaveLength(todas.length);
  });
});
