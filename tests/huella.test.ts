import { describe, expect, it } from "vitest";
import { calcularHuella, normalizarEnlace } from "@/lib/huella";
import { ingresarCandidata, listarNuevas } from "@/lib/vacantes";
import { CONFIG_POR_DEFECTO } from "@/lib/filtros/motor";
import { bdDePrueba } from "./ayuda";

describe("deduplicación", () => {
  it("normaliza enlaces quitando rastreo, www, fragmento y barra final", () => {
    expect(normalizarEnlace("https://www.Example.com/jobs/1/?utm_source=x&ref=Simplify#apply")).toBe("https://example.com/jobs/1");
    expect(normalizarEnlace("example.com/jobs/1?b=2&a=1")).toBe("https://example.com/jobs/1?a=1&b=2");
  });
  it("misma huella para variantes del mismo enlace", () => {
    const a = calcularHuella("https://boards.greenhouse.io/acme/jobs/123?gh_src=abc");
    const b = calcularHuella("http://boards.greenhouse.io/acme/jobs/123/");
    expect(a).toBe(b);
    expect(calcularHuella("https://boards.greenhouse.io/acme/jobs/124")).not.toBe(a);
  });
  it("sin enlace usa empresa y puesto", () => {
    expect(calcularHuella("", "ACME", "SOC Analyst")).toBe(calcularHuella("", "acme ", "soc analyst"));
  });
  it("no inserta dos veces la misma vacante", () => {
    const db = bdDePrueba();
    const c = { empresa: "ACME", puesto: "Junior Pentester", ubicacion: "Remote", enlace: "https://jobs.lever.co/acme/1?lever-source=x" };
    expect(ingresarCandidata(db, c, "Lever", CONFIG_POR_DEFECTO).estado).toBe("nueva");
    expect(ingresarCandidata(db, { ...c, enlace: "https://jobs.lever.co/acme/1" }, "Lever", CONFIG_POR_DEFECTO).estado).toBe("duplicada");
    expect(listarNuevas(db)).toHaveLength(1);
  });
  it("lo que no pasa queda como Descartada con motivo", () => {
    const db = bdDePrueba();
    const r = ingresarCandidata(db, { empresa: "X", puesto: "SOC Analyst", ubicacion: "Hybrid", enlace: "https://x.com/1" }, "Prueba", CONFIG_POR_DEFECTO);
    expect(r.estado).toBe("descartada");
    expect(listarNuevas(db)).toHaveLength(0);
  });
});
