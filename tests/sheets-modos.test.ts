import { afterEach, describe, expect, it } from "vitest";
import { cargarExtra, guardar, obtenerDb, usarClienteSheets } from "@/db/almacen";
import { actividad, vacantes } from "@/db/schema";
import { ingresarLote } from "@/lib/buscar";
import { leerConfigFiltros } from "@/lib/filtros/repo";
import { descartarVarias, listarNuevas, obtenerVacante } from "@/lib/vacantes";
import { sheetComoElDeAlex, type SheetsFalso } from "./sheets-falso";

afterEach(() => usarClienteSheets(null));

const remota = (puesto: string, n: number) => ({ empresa: "ACME", puesto, ubicacion: "Remote - Mexico", enlace: `https://acme.test/jobs/${n}` });

/** Sheet con una búsqueda previa: Nuevas, _Descartadas, _Vistas y _Actividad con datos. */
async function sheetConHistoria(): Promise<SheetsFalso> {
  const s = sheetComoElDeAlex();
  usarClienteSheets(s.cliente());
  const db = await obtenerDb("ingesta");
  ingresarLote(db, [remota("Junior Pentester", 1), remota("SOC Analyst", 2), remota("Senior Manager", 3)], "Prueba", leerConfigFiltros(db));
  await guardar(db);
  return s;
}

describe("lectura parcial del Sheet", () => {
  it("las pantallas no descargan las pestañas pesadas, y se cargan solo si hacen falta", async () => {
    const s = await sheetConHistoria();
    const leidos: string[] = [];
    const c = s.cliente() as unknown as { fetchFn: (u: string, i?: RequestInit) => Promise<Response> };
    const orig = c.fetchFn;
    c.fetchFn = (u, i) => {
      if (u.includes("batchGet")) leidos.push(...new URL(u).searchParams.getAll("ranges"));
      return orig(u, i);
    };
    usarClienteSheets(c as never);

    const db = await obtenerDb("lectura");
    expect(leidos).toContain("'_Vistas'!A1:ZZ1"); // solo encabezado
    expect(leidos).toContain("'_Descartadas'!A1:ZZ1");
    expect(leidos).toContain("'_Actividad'!A1:ZZ1");
    expect(leidos).toContain("'Seguimiento'!A1:ZZ");
    expect(listarNuevas(db)).toHaveLength(2);
    expect(db.select().from(actividad).all()).toHaveLength(0);

    s.escrituras = [];
    await cargarExtra(db, "descartadas", "actividad");
    expect(db.select().from(vacantes).all().some((v) => v.puesto === "Senior Manager")).toBe(true);
    expect(db.select().from(actividad).all().length).toBeGreaterThan(0);
    await guardar(db);
    expect(s.escrituras).toEqual([]); // cargar no reescribe nada
  });

  it("si una pantalla intentara guardar donde no leyó, se detiene sin escribir nada", async () => {
    const s = await sheetConHistoria();
    const antes = JSON.stringify(s.pestanas.map((p) => p.celdas));
    const db = await obtenerDb("lectura");
    ingresarLote(db, [remota("Junior Security Analyst", 99)], "Prueba", leerConfigFiltros(db)); // toca _Vistas
    await expect(guardar(db)).rejects.toThrow(/sin haberla leído/);
    expect(JSON.stringify(s.pestanas.map((p) => p.celdas))).toBe(antes);

    const db2 = await obtenerDb("lectura");
    const [n] = listarNuevas(db2);
    descartarVarias(db2, [n.id], "No"); // iría a _Descartadas, que no se leyó
    await expect(guardar(db2)).rejects.toThrow(/_Descartadas/);
    expect(JSON.stringify(s.pestanas.map((p) => p.celdas))).toBe(antes);
  });

  it("en modo escritura, descartar desde Nuevas agrega al final de _Descartadas sin pisar filas", async () => {
    const s = await sheetConHistoria();
    const previas = s.objetos("_Descartadas").length;
    const db = await obtenerDb("escritura");
    const [n] = listarNuevas(db);
    descartarVarias(db, [n.id], "No me interesa");
    await guardar(db);
    const filas = s.objetos("_Descartadas");
    expect(filas).toHaveLength(previas + 1);
    expect(filas.at(-1)?.["Motivo de descarte"]).toBe("No me interesa");
    const db2 = await obtenerDb("lectura");
    await cargarExtra(db2, "descartadas");
    expect(obtenerVacante(db2, n.id)?.descartadaPor).toBe("alex");
  });
});
