import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bancoRespuestas, vacantes } from "@/db/schema";
import {
  COLUMNAS_SEGUIMIENTO, exportarSeguimiento, importarBanco, importarCarpeta, importarSeguimiento, mapearEstado,
} from "@/lib/importacion";
import { parsearCsv } from "@/lib/csv";
import { bdDePrueba } from "./ayuda";

const carpeta = path.join(process.cwd(), "data/ejemplo");
const seguimiento = fs.readFileSync(path.join(carpeta, "seguimiento.csv"), "utf8");

describe("importación idempotente", () => {
  it("importar dos veces no duplica ni cambia nada", () => {
    const db = bdDePrueba();
    const r1 = importarSeguimiento(db, seguimiento);
    expect(r1.insertadas).toBe(8);
    const r2 = importarSeguimiento(db, seguimiento);
    expect(r2.insertadas).toBe(0);
    expect(r2.actualizadas).toBe(0);
    expect(r2.sinCambios).toBe(8);
    expect(db.select().from(vacantes).all()).toHaveLength(8);
  });
  it("una fila editada en el Sheet se actualiza, no se duplica", () => {
    const db = bdDePrueba();
    importarSeguimiento(db, seguimiento);
    const editado = seguimiento.replace("2,2026-10-02,Ficticia Labs,Red Team Intern,Ofensiva,Lever,Worldwide,Prácticas,6,,https://jobs.lever.co/ficticia-labs/a1b2c3,1,Lista para aplicar", "2,2026-10-02,Ficticia Labs,Red Team Intern,Ofensiva,Lever,Worldwide,Prácticas,6,,https://jobs.lever.co/ficticia-labs/a1b2c3,1,Aplicada");
    const r = importarSeguimiento(db, editado);
    expect(r.actualizadas).toBe(1);
    expect(db.select().from(vacantes).all()).toHaveLength(8);
  });
  it("importarCarpeta es idempotente con los tres CSV", () => {
    const db = bdDePrueba();
    importarCarpeta(db, carpeta);
    const antes = JSON.stringify(db.select().from(bancoRespuestas).all().map((f) => [f.pregunta, f.respuesta, f.estado]));
    const r = importarCarpeta(db, carpeta);
    expect(r.every((x) => x.insertadas === 0 && x.actualizadas === 0)).toBe(true);
    const despues = JSON.stringify(db.select().from(bancoRespuestas).all().map((f) => [f.pregunta, f.respuesta, f.estado]));
    expect(despues).toBe(antes);
  });
  it("mapea estados con variaciones", () => {
    expect(mapearEstado("aplicada")).toBe("Aplicada");
    expect(mapearEstado("Prueba tecnica")).toBe("Prueba técnica");
    expect(mapearEstado("")).toBe("Por revisar");
  });
});

describe("privacidad del salario", () => {
  it("la expectativa salarial nunca se guarda y queda en Preguntar a Alex", () => {
    const db = bdDePrueba();
    importarBanco(db, "Categoría,Pregunta,Respuesta,Estado\nCompensación,¿Cuál es tu expectativa salarial?,99999 MXN,Completa\n");
    const [f] = db.select().from(bancoRespuestas).all();
    expect(f.respuesta).toBe("");
    expect(f.estado).toBe("Preguntar a Alex");
  });
});

describe("exportación", () => {
  it("genera las columnas exactas del Sheet y se puede reimportar sin cambios", () => {
    const db = bdDePrueba();
    importarSeguimiento(db, seguimiento);
    const csv = exportarSeguimiento(db);
    const filas = parsearCsv(csv);
    expect(filas[0]).toEqual([...COLUMNAS_SEGUIMIENTO]);
    expect(filas).toHaveLength(9);
    const r = importarSeguimiento(db, csv);
    expect(r.sinCambios).toBe(8);
  });
});
