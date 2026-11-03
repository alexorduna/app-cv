import { describe, expect, it } from "vitest";
import { vacantes } from "@/db/schema";
import { CONFIG_POR_DEFECTO } from "@/lib/filtros/motor";
import { ingresarLote } from "@/lib/buscar";
import { importarSeguimiento } from "@/lib/importacion";
import {
  aceptarNuevas, cambiarEstado, descartarVarias, listarDescartadasAuto, listarHistorialDescartes, listarNuevas, restaurarDescartada,
} from "@/lib/vacantes";
import { bdDePrueba } from "./ayuda";

const remota = (puesto: string, n: number) => ({ empresa: "ACME", puesto, ubicacion: "Remote", enlace: `https://example.com/${n}` });

describe("cerradas e historial de descartes", () => {
  it("las vacantes cerradas (🔒) no se guardan", () => {
    const db = bdDePrueba();
    const r = ingresarLote(db, [{ ...remota("Junior Pentester", 1), marcas: { cerrada: true } }, remota("Junior Pentester", 2)], "GitHub", CONFIG_POR_DEFECTO);
    expect(r).toMatchObject({ nuevas: 1, omitidas: 1 });
    expect(db.select().from(vacantes).all()).toHaveLength(1);
  });

  it("lo que descarta Alex va al historial; lo de los filtros no", () => {
    const db = bdDePrueba();
    ingresarLote(db, [remota("Junior Pentester", 1), remota("SOC Analyst", 2), remota("Senior Red Team Lead", 3)], "x", CONFIG_POR_DEFECTO);
    expect(listarDescartadasAuto(db).map((v) => v.puesto)).toEqual(["Senior Red Team Lead"]);
    expect(listarHistorialDescartes(db)).toHaveLength(0);

    const [a, b] = listarNuevas(db).map((v) => v.id);
    descartarVarias(db, [a], "No me convence la empresa");
    aceptarNuevas(db, [b]);
    cambiarEstado(db, b, "Descartada", { motivo: "Piden inglés C2" });

    const h = listarHistorialDescartes(db);
    expect(h.map((v) => v.motivoDescarte).sort()).toEqual(["No me convence la empresa", "Piden inglés C2"]);
    expect(h.every((v) => v.descartadaPor === "alex" && v.fechaDescarte)).toBe(true);
    expect(listarDescartadasAuto(db)).toHaveLength(1);
  });

  it("restaurar saca la vacante del historial y la regresa al tablero", () => {
    const db = bdDePrueba();
    ingresarLote(db, [remota("Junior Pentester", 1)], "x", CONFIG_POR_DEFECTO);
    const [id] = listarNuevas(db).map((v) => v.id);
    cambiarEstado(db, id, "Descartada", { motivo: "x" });
    restaurarDescartada(db, id);
    expect(listarHistorialDescartes(db)).toHaveLength(0);
    const v = db.select().from(vacantes).all()[0];
    expect(v).toMatchObject({ estado: "Por revisar", enTablero: 1, descartadaPor: "", motivoDescarte: "" });
  });

  it("las descartadas que vienen del Sheet entran al historial", () => {
    const db = bdDePrueba();
    importarSeguimiento(db, "ID,Empresa,Puesto,Enlace para aplicar,Estado\n1,ACME,GRC Analyst,https://example.com/g,Descartada\n");
    expect(listarHistorialDescartes(db)).toHaveLength(1);
  });
});
