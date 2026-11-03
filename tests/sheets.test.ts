import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardar, obtenerDb, usarClienteSheets } from "@/db/almacen";
import { bancoRespuestas, vacantes } from "@/db/schema";
import { ingresarLote } from "@/lib/buscar";
import { leerConfigFiltros } from "@/lib/filtros/repo";
import { aceptarNuevas, cambiarEstado, listarNuevas, obtenerVacante } from "@/lib/vacantes";
import { sheetComoElDeAlex, type SheetsFalso } from "./sheets-falso";

let s: SheetsFalso;
beforeEach(() => {
  s = sheetComoElDeAlex();
  usarClienteSheets(s.cliente());
});
afterEach(() => usarClienteSheets(null));

const remota = (puesto: string, n: number) => ({ empresa: "ACME", puesto, ubicacion: "Remote - Mexico", enlace: `https://acme.test/jobs/${n}` });

describe("Google Sheet como base de datos", () => {
  it("lee el Sheet real sin cambiar tus datos y crea solo lo que falta", async () => {
    const antes = JSON.stringify(s.pestana("Seguimiento").celdas.map((f) => f.slice(0, 19)));
    const db = await obtenerDb();

    const v1 = obtenerVacante(db, 1)!;
    expect(v1).toMatchObject({ empresa: "Ficticia Uno", estado: "Descartada", descartadaPor: "alex", enTablero: 1, notas: "Nota escrita a mano" });
    expect(obtenerVacante(db, 3)!.estado).toBe("Rechazada");

    // Tus 19 columnas originales quedan idénticas (incluidas "No indicado" y la fórmula de la columna S)
    expect(JSON.stringify(s.pestana("Seguimiento").celdas.map((f) => f.slice(0, 19)))).toBe(antes);
    // Se agregan columnas al final: "Motivo de descarte" visible y las técnicas ocultas
    const enc = s.encabezados("Seguimiento");
    expect(enc.slice(19)).toEqual(["Motivo de descarte", "_ubicacion", "_huella", "_descartada_por", "_fecha_descarte", "_creada", "_actualizada"]);
    expect(s.pestana("Seguimiento").columnasOcultas.has(19)).toBe(false);
    expect(s.pestana("Seguimiento").columnasOcultas.has(20)).toBe(true);

    // Pestañas nuevas: Nuevas visible; las técnicas ocultas. Filtros, Resumen e Inicio no se tocan.
    expect(s.pestana("Nuevas").hidden).toBe(false);
    for (const p of ["_Descartadas", "_Chamba config", "_Cartas", "_Listas GitHub", "_Ejecuciones", "_Actividad", "_Vistas"]) expect(s.pestana(p).hidden, p).toBe(true);
    expect(s.valores("Filtros")).toEqual([["Criterio", "Valor"], ["Modalidad", "Totalmente remoto."]]);
    expect(s.objetos("_Chamba config").find((f) => f.Clave === "max_horas_practicas")?.Valor).toBe("6");
    expect(s.objetos("_Listas GitHub").map((f) => f.Repo)).toContain("SimplifyJobs/Summer2026-Internships");
  });

  it("al cambiar un estado escribe solo esa celda (y la fecha técnica)", async () => {
    const db = await obtenerDb();
    s.escrituras = [];
    cambiarEstado(db, 2, "Lista para aplicar");
    await guardar(db);
    const rangos = s.escrituras.map((e) => e.range).filter((r) => !r.startsWith("'_Actividad'"));
    // Estado (M3) y la fecha técnica "_actualizada" (Z3). Nada más.
    expect(rangos.sort()).toEqual(["'Seguimiento'!M3", "'Seguimiento'!Z3"]);
    expect(s.objetos("Seguimiento")[1]["Estado"]).toBe("Lista para aplicar");
    expect(s.objetos("Seguimiento")[1]["Tipo"]).toBe("No indicado");
  });

  it("lo nuevo va a Nuevas, lo descartado a _Descartadas y al aceptar pasa a Seguimiento con su fórmula", async () => {
    let db = await obtenerDb();
    const r = ingresarLote(db, [remota("Junior Pentester", 1), remota("Senior SOC Lead", 2)], "Prueba", leerConfigFiltros(db));
    expect(r).toMatchObject({ nuevas: 1, descartadas: 1 });
    await guardar(db);
    expect(s.objetos("Nuevas").map((f) => f.Puesto)).toEqual(["Junior Pentester"]);
    expect(s.objetos("_Descartadas").map((f) => f.Puesto)).toEqual(["Senior SOC Lead"]);
    expect(s.objetos("_Descartadas")[0]["Motivo de descarte"]).toMatch(/nivel de entrada/);

    // Otra petición: se vuelve a leer el Sheet y no se duplica nada
    db = await obtenerDb();
    expect(ingresarLote(db, [remota("Junior Pentester", 1), remota("Senior SOC Lead", 2)], "Prueba", leerConfigFiltros(db))).toMatchObject({ duplicadas: 2 });
    const [nueva] = listarNuevas(db);
    expect(nueva.id).toBe(4); // sigue la numeración del Sheet
    aceptarNuevas(db, [nueva.id]);
    await guardar(db);

    expect(s.objetos("Nuevas")).toHaveLength(0);
    const seg = s.objetos("Seguimiento");
    expect(seg.map((f) => f.ID)).toEqual(["1", "2", "3", "4"]);
    expect(seg[3]).toMatchObject({ Empresa: "ACME", Puesto: "Junior Pentester", Estado: "Por revisar", "Días desde la aplicación": "[f]" });
    expect(s.pestana("Seguimiento").celdas[4][18]).toBe('=IF(AND($N5<>"",$M5="Aplicada"),TODAY()-$N5,"")');
  });

  it("filas agregadas a mano sin ID reciben un ID nuevo", async () => {
    const seg = s.pestana("Seguimiento");
    const fila = new Array(19).fill("");
    fila[2] = "Empresa a mano";
    fila[3] = "Junior Security Analyst";
    fila[12] = "Por revisar";
    seg.celdas.push(fila);
    const db = await obtenerDb();
    const v = db.select().from(vacantes).all().find((x) => x.empresa === "Empresa a mano")!;
    expect(v.id).toBe(4);
    expect(s.objetos("Seguimiento")[3].ID).toBe("4");
  });

  it("el banco usa tus columnas y nunca lee ni borra la respuesta salarial", async () => {
    const db = await obtenerDb();
    const banco = db.select().from(bancoRespuestas).all();
    expect(banco[0]).toMatchObject({ categoria: "Autorización", estado: "Completa", respuesta: "I am a Mexican citizen." });
    expect(banco[1]).toMatchObject({ respuesta: "", estado: "Preguntar a Alex" });
    await guardar(db);
    const filas = s.objetos("Banco de respuestas");
    expect(filas[1]["Respuesta (inglés)"]).toBe("NO DEBE LEERSE"); // tu celda queda intacta
    expect(filas[0]).toMatchObject({ Estado: "Listo", Nota: "Nota del banco" });
  });

  it("poda las descartadas por filtros para que el Sheet no crezca sin control, pero recuerda sus huellas", async () => {
    const db = await obtenerDb();
    const muchas = Array.from({ length: 520 }, (_, i) => ({ ...remota("Senior Manager", 1000 + i) }));
    ingresarLote(db, muchas, "Prueba", leerConfigFiltros(db));
    await guardar(db);
    expect(s.objetos("_Descartadas").length).toBe(500);
    const db2 = await obtenerDb();
    expect(ingresarLote(db2, muchas, "Prueba", leerConfigFiltros(db2))).toMatchObject({ duplicadas: 520, descartadas: 0 });
  });
});
