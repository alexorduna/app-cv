import { afterEach, describe, expect, it } from "vitest";
import { obtenerDb, usarClienteSheets } from "@/db/almacen";
import { listarVacantes } from "@/lib/vacantes";
import { copiaCeldas, sheetComoElDeAlex } from "./sheets-falso";

afterEach(() => usarClienteSheets(null));

const TECNICAS = ["_Descartadas", "_Chamba config", "_Cartas", "_Listas GitHub", "_Ejecuciones", "_Actividad", "_Vistas"];

describe("estructura del Sheet dentro de Next.js (fetch memoizado)", () => {
  it("crea las pestañas que faltan aunque Next reutilice GETs idénticos (bug 'reading columnas')", async () => {
    const s = sheetComoElDeAlex();
    usarClienteSheets(s.cliente({ comoNext: true }));
    const db = await obtenerDb(); // antes fallaba: TypeError: Cannot read properties of undefined (reading 'columnas')
    expect(listarVacantes(db)).toHaveLength(3);
    for (const p of TECNICAS) expect(s.pestana(p).hidden, p).toBe(true);
    expect(s.pestana("Nuevas").hidden).toBe(false);
    expect(s.getSinSignal).toBe(0); // todas las lecturas a Google van sin memoización
  });

  it("estado real de Alex: visibles + Nuevas existen, faltan las ocultas", async () => {
    const s = sheetComoElDeAlex();
    s.agregarPestana("Nuevas", [["ID", "Empresa", "Puesto", "Estado"]]); // creada por un arranque anterior
    const intactas = Object.fromEntries(["Inicio", "Resumen", "Filtros"].map((t) => [t, copiaCeldas(s, t)]));
    const formulaS = s.pestana("Seguimiento").celdas[1][18];
    usarClienteSheets(s.cliente({ comoNext: true }));
    await obtenerDb();
    for (const p of TECNICAS) expect(s.pestana(p).hidden, p).toBe(true);
    expect(s.encabezados("Seguimiento")).toContain("Motivo de descarte");
    expect(s.encabezados("Seguimiento").at(-1)).toBe("_actualizada");
    expect(s.encabezados("Nuevas")).toEqual(expect.arrayContaining(["Fecha encontrada", "Motivo de descarte", "_huella"]));
    // No se tocan Inicio, Resumen, Filtros ni las fórmulas de Seguimiento
    for (const [t, antes] of Object.entries(intactas)) expect(copiaCeldas(s, t), t).toBe(antes);
    expect(s.pestana("Seguimiento").celdas[1][18]).toBe(formulaS);
  });

  it("el primer arranque con peticiones simultáneas (página + prefetch del menú) no falla", async () => {
    const s = sheetComoElDeAlex();
    usarClienteSheets(s.cliente({ comoNext: true, retrasoMs: 25 }));
    const r = await Promise.allSettled(Array.from({ length: 8 }, () => obtenerDb()));
    const errores = r.filter((x) => x.status === "rejected").map((x) => String((x as PromiseRejectedResult).reason));
    expect(errores).toEqual([]);
    expect(s.pestanas.filter((p) => p.title === "_Cartas")).toHaveLength(1);
  });

  it("después de guardar, la siguiente lectura en la misma petición ve los datos nuevos", async () => {
    const s = sheetComoElDeAlex();
    usarClienteSheets(s.cliente({ comoNext: true }));
    const { cambiarEstado } = await import("@/lib/vacantes");
    const { guardar } = await import("@/db/almacen");
    const db = await obtenerDb();
    cambiarEstado(db, 2, "Aplicada");
    await guardar(db);
    const db2 = await obtenerDb(); // misma "petición" (mismo fetch memoizado)
    expect(listarVacantes(db2).find((v) => v.id === 2)?.estado).toBe("Aplicada");
  });

  it("si Google no deja crear una pestaña, el error dice cuál falta", async () => {
    const s = sheetComoElDeAlex();
    const c = s.cliente() as unknown as { estructura: (r: unknown[]) => Promise<unknown[]> };
    c.estructura = async () => []; // simula que Google no creó nada
    usarClienteSheets(c as never);
    await expect(obtenerDb()).rejects.toThrow(/Faltan pestañas en el Google Sheet.*"Nuevas".*"_Descartadas"/);
  });
});
