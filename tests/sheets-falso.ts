/**
 * Servidor falso de la API de Google Sheets v4 (solo lo que usa Chamba), en memoria.
 * Permite probar el modo "Sheet como base de datos" sin tocar Google.
 */
import { ClienteSheets } from "@/db/sheets/google";

interface Pestana {
  sheetId: number;
  title: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  celdas: string[][]; // lo que se escribió (fórmulas incluidas)
  columnasOcultas: Set<number>;
}

const letraANum = (l: string) => l.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function parsearRango(r: string): { pestana: string; c1: number; f1: number; c2: number | null; f2: number | null } {
  const m = r.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/);
  if (!m) throw new Error(`Rango no soportado por el falso: ${r}`);
  return {
    pestana: m[1].replace(/''/g, "'"),
    c1: letraANum(m[2]),
    f1: Number(m[3]) - 1,
    c2: m[4] ? letraANum(m[4]) : null,
    f2: m[5] ? Number(m[5]) - 1 : null,
  };
}

export class SheetsFalso {
  pestanas: Pestana[] = [];
  escrituras: { range: string; valor: string; modo: string }[] = [];
  llamadas = 0;
  private siguienteId = 100;

  agregarPestana(title: string, filas: string[][] = [], hidden = false) {
    this.pestanas.push({ sheetId: this.siguienteId++, title, hidden, rowCount: 1000, columnCount: 26, celdas: filas.map((f) => [...f]), columnasOcultas: new Set() });
  }

  pestana(title: string) {
    const p = this.pestanas.find((x) => x.title === title);
    if (!p) throw new Error(`No existe la pestaña ${title}`);
    return p;
  }

  /** Valores como los mostraría Google (las fórmulas se muestran como "[f]"). */
  valores(title: string): string[][] {
    return this.pestana(title).celdas.map((f) => f.map((c) => (c?.startsWith("=") ? "[f]" : (c ?? ""))));
  }

  encabezados(title: string) {
    return this.pestana(title).celdas[0] ?? [];
  }

  /** Filas como objetos usando la fila 1 como encabezados. */
  objetos(title: string): Record<string, string>[] {
    const [enc = [], ...resto] = this.valores(title);
    return resto.filter((f) => f.some((c) => c)).map((f) => Object.fromEntries(enc.map((h, i) => [h, f[i] ?? ""])));
  }

  cliente(): ClienteSheets {
    return new ClienteSheets("falso", null, { fetch: (u, i) => this.atender(u, i), base: "https://falso/v4/spreadsheets" });
  }

  private set(p: Pestana, f: number, c: number, v: string) {
    while (p.celdas.length <= f) p.celdas.push([]);
    const fila = p.celdas[f];
    while (fila.length <= c) fila.push("");
    fila[c] = v;
  }

  private async atender(url: string, init?: RequestInit): Promise<Response> {
    this.llamadas++;
    const u = new URL(url);
    const ruta = u.pathname.replace("/v4/spreadsheets/falso", "");
    const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
    if (ruta === "" && (!init?.method || init.method === "GET")) {
      return json({
        sheets: this.pestanas.map((p) => ({
          properties: { sheetId: p.sheetId, title: p.title, hidden: p.hidden, gridProperties: { rowCount: p.rowCount, columnCount: p.columnCount } },
        })),
      });
    }
    if (ruta === "/values:batchGet") {
      const formula = u.searchParams.get("valueRenderOption") === "FORMULA";
      return json({
        valueRanges: u.searchParams.getAll("ranges").map((r) => {
          const { pestana, f1, f2 } = parsearRango(r);
          const p = this.pestana(pestana);
          const filas = p.celdas
            .slice(f1, f2 === null ? undefined : f2 + 1)
            .map((f) => f.map((c) => (!formula && c?.startsWith("=") ? "[f]" : (c ?? ""))));
          // Google recorta celdas vacías al final de cada fila y filas vacías al final
          const recortadas = filas.map((f) => {
            const x = [...f];
            while (x.length && x[x.length - 1] === "") x.pop();
            return x;
          });
          while (recortadas.length && recortadas[recortadas.length - 1].length === 0) recortadas.pop();
          return { range: r, values: recortadas };
        }),
      });
    }
    const cuerpo = JSON.parse(String(init?.body ?? "{}"));
    if (ruta === "/values:batchUpdate") {
      for (const d of cuerpo.data as { range: string; values: string[][] }[]) {
        const { pestana, c1, f1 } = parsearRango(d.range);
        const p = this.pestana(pestana);
        d.values.forEach((fila, i) =>
          fila.forEach((v, j) => {
            if (f1 + i >= p.rowCount) throw new Error(`Escritura fuera de la cuadrícula: ${d.range}`);
            this.set(p, f1 + i, c1 + j, v);
            this.escrituras.push({ range: d.range, valor: v, modo: cuerpo.valueInputOption });
          }),
        );
      }
      return json({});
    }
    if (ruta === ":batchUpdate") {
      for (const req of cuerpo.requests as Record<string, any>[]) {
        if (req.addSheet) {
          const pr = req.addSheet.properties;
          this.agregarPestana(pr.title, [], !!pr.hidden);
          const p = this.pestana(pr.title);
          p.rowCount = pr.gridProperties?.rowCount ?? 1000;
          p.columnCount = pr.gridProperties?.columnCount ?? 26;
        } else if (req.deleteDimension) {
          const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
          const p = this.pestanas.find((x) => x.sheetId === sheetId)!;
          p.celdas.splice(startIndex, endIndex - startIndex);
          p.rowCount -= endIndex - startIndex;
        } else if (req.appendDimension) {
          const p = this.pestanas.find((x) => x.sheetId === req.appendDimension.sheetId)!;
          if (req.appendDimension.dimension === "ROWS") p.rowCount += req.appendDimension.length;
          else p.columnCount += req.appendDimension.length;
        } else if (req.updateDimensionProperties) {
          const { sheetId, startIndex } = req.updateDimensionProperties.range;
          this.pestanas.find((x) => x.sheetId === sheetId)!.columnasOcultas.add(startIndex);
        } else throw new Error(`Petición no soportada: ${Object.keys(req)}`);
      }
      return json({});
    }
    return new Response("no soportado", { status: 400 });
  }
}

/** Un Sheet parecido al real de Alex (datos inventados). */
export function sheetComoElDeAlex(): SheetsFalso {
  const s = new SheetsFalso();
  s.agregarPestana("Inicio", [["Búsqueda de empleo: seguimiento"]]);
  const enc = ["ID", "Fecha encontrada", "Empresa", "Puesto", "Área", "Plataforma", "Región", "Tipo", "Horas por día", "Salario", "Enlace para aplicar", "Prioridad", "Estado", "Fecha de aplicación", "Fecha de seguimiento", "Siguiente paso", "Versión de CV", "Notas", "Días desde la aplicación"];
  const fila = (n: number, empresa: string, puesto: string, estado: string, extra: Partial<Record<string, string>> = {}) => {
    const base: Record<string, string> = {
      ID: String(n), "Fecha encontrada": "2026-10-20", Empresa: empresa, Puesto: puesto, Área: "Ofensiva", Plataforma: "LinkedIn",
      Región: "México", Tipo: "No indicado", "Horas por día": "No indicado", Salario: "No indicado",
      "Enlace para aplicar": `https://example.com/vacante/${n}`, Prioridad: "2", Estado: estado, "Siguiente paso": "Revisar",
      "Versión de CV": "Ofensiva", Notas: "Nota escrita a mano", "Días desde la aplicación": `=IF(AND($N${n + 1}<>"",$M${n + 1}="Aplicada"),TODAY()-$N${n + 1},"")`,
      ...extra,
    };
    return enc.map((h) => base[h] ?? "");
  };
  s.agregarPestana("Seguimiento", [
    enc,
    fila(1, "Ficticia Uno", "SOC Analyst (Tier 1)", "Descartada"),
    fila(2, "Ficticia Dos", "Junior Penetration Tester", "Por revisar"),
    fila(3, "Ficticia Tres", "Security Analyst", "Rechazada", { "Fecha de aplicación": "2026-10-21" }),
  ]);
  s.agregarPestana("Resumen", [["Total", "=COUNTA(Seguimiento!A2:A)"]]);
  s.agregarPestana("Banco de respuestas", [
    ["Tema", "Pregunta frecuente", "Respuesta (inglés)", "Estado", "Nota"],
    ["Autorización", "Are you authorized to work in [country]?", "I am a Mexican citizen.", "Listo", "Nota del banco"],
    ["Compensación", "What are your salary expectations?", "NO DEBE LEERSE", "Listo", ""],
  ]);
  s.agregarPestana("Filtros", [["Criterio", "Valor"], ["Modalidad", "Totalmente remoto."]]);
  return s;
}
