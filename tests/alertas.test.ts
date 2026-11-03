import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraerVacantesDeAlerta, htmlATexto } from "@/lib/alertas";
import { evaluar } from "@/lib/filtros/motor";
import { ingresarLote } from "@/lib/buscar";
import { CONFIG_POR_DEFECTO } from "@/lib/filtros/motor";
import { listarNuevas } from "@/lib/vacantes";
import { bdDePrueba } from "./ayuda";

const fx = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures/alertas", n), "utf8");

describe("Pegar alerta", () => {
  it("LinkedIn: extrae título, empresa, ubicación y enlace limpio", () => {
    const { plataforma, vacantes } = extraerVacantesDeAlerta(fx("linkedin.txt"));
    expect(plataforma).toBe("LinkedIn");
    expect(vacantes).toHaveLength(4);
    expect(vacantes[0]).toMatchObject({
      puesto: "Junior Penetration Tester",
      empresa: "Ficticia Seguridad",
      ubicacion: "Mexico City, Mexico (Remote)",
      enlace: "https://www.linkedin.com/jobs/view/1000000001",
    });
    const pasan = vacantes.filter((v) => evaluar(v).pasa).map((v) => v.puesto);
    expect(pasan).toEqual(["Junior Penetration Tester"]);
    expect(evaluar(vacantes[1]).motivo).toMatch(/EE\. UU\./);
    expect(evaluar(vacantes[2]).motivo).toMatch(/[Hh]íbrida/);
    expect(evaluar(vacantes[3]).motivo).toMatch(/excluida/);
  });

  it("Wellfound: separa empresa, ubicación y salario de una misma línea", () => {
    const { plataforma, vacantes } = extraerVacantesDeAlerta(fx("wellfound.txt"));
    expect(plataforma).toBe("Wellfound");
    expect(vacantes).toHaveLength(2);
    expect(vacantes[0]).toMatchObject({ puesto: "Application Security Engineer", empresa: "Ejemplo Startup", ubicacion: "Remote" });
    expect(vacantes[0].salario).toMatch(/70k/);
    expect(evaluar(vacantes[0]).pasa).toBe(true);
    expect(evaluar(vacantes[1]).pasa).toBe(false);
  });

  it("Handshake: detecta prácticas remotas y descarta ciudadanía", () => {
    const { plataforma, vacantes } = extraerVacantesDeAlerta(fx("handshake.txt"));
    expect(plataforma).toBe("Handshake");
    expect(vacantes.map((v) => v.empresa)).toEqual(["Ficticia Corp", "Gobierno Ejemplo"]);
    expect(evaluar(vacantes[0]).pasa).toBe(true);
    expect(evaluar(vacantes[0]).tipo).toBe("Prácticas");
    expect(evaluar(vacantes[1]).motivo).toMatch(/ciudadan/);
  });

  it("sin enlaces: separa por bloques", () => {
    const { vacantes } = extraerVacantesDeAlerta(fx("sin-enlaces.txt"));
    expect(vacantes.map((v) => [v.puesto, v.empresa])).toEqual([
      ["Junior Pentester", "Ejemplo Hackers"],
      ["Red Team Operator", "Prueba Corp"],
    ]);
  });

  it("acepta HTML pegado", () => {
    const html = `<div><a href="https://www.linkedin.com/comm/jobs/view/42/?trk=x">Junior Pentester</a><br>ACME<br>Remote</div>`;
    expect(htmlATexto(html)).toContain("https://www.linkedin.com/comm/jobs/view/42/?trk=x");
    const { vacantes } = extraerVacantesDeAlerta(html);
    expect(vacantes[0]).toMatchObject({ puesto: "Junior Pentester", enlace: "https://www.linkedin.com/jobs/view/42" });
  });

  it("pegar la misma alerta dos veces no duplica", () => {
    const db = bdDePrueba();
    const { vacantes } = extraerVacantesDeAlerta(fx("linkedin.txt"));
    const a = ingresarLote(db, vacantes, "LinkedIn (alerta)", CONFIG_POR_DEFECTO);
    const b = ingresarLote(db, vacantes, "LinkedIn (alerta)", CONFIG_POR_DEFECTO);
    expect(a).toEqual({ nuevas: 1, descartadas: 3, duplicadas: 0 });
    expect(b).toEqual({ nuevas: 0, descartadas: 0, duplicadas: 4 });
    expect(listarNuevas(db)[0].plataforma).toBe("LinkedIn (alerta)");
  });
});
