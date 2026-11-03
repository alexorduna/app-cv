import { describe, expect, it } from "vitest";
import { aprobarCarta, cartaAprobada, editarCarta, generarBorrador } from "@/lib/cartas";
import { revisarCarta, limpiarSalidaIA } from "@/lib/cartas/validar";
import { configIA, ollama } from "@/lib/cartas/proveedores";
import { detectarAts } from "@/lib/ats";
import { importarSeguimiento } from "@/lib/importacion";
import { vacantes } from "@/db/schema";
import fs from "node:fs";
import { bdDePrueba } from "./ayuda";

function bdConVacante() {
  const db = bdDePrueba();
  importarSeguimiento(db, fs.readFileSync("data/ejemplo/seguimiento.csv", "utf8"));
  const v = db.select().from(vacantes).all()[0];
  return { db, v };
}

describe("cartas", () => {
  it("el proveedor mock genera un borrador limpio que se puede aprobar", async () => {
    const { db, v } = bdConVacante();
    const c = await generarBorrador(db, v.id);
    expect(c.estado).toBe("Borrador");
    expect(c.version).toBe(1);
    expect(c.proveedor).toBe("mock");
    expect(c.texto).toContain(v.empresa);
    expect(c.texto).not.toMatch(/[—–]/);
    expect(aprobarCarta(db, c.id).errores).toEqual([]);
    expect(cartaAprobada(db, v.id)?.id).toBe(c.id);
    const c2 = await generarBorrador(db, v.id);
    expect(c2.version).toBe(2);
    expect(c2.estado).toBe("Borrador");
  });

  it("no aprueba si hay salario o rayas largas; editar vuelve a Borrador", async () => {
    const { db, v } = bdConVacante();
    const c = await generarBorrador(db, v.id);
    editarCarta(db, c.id, `${c.texto}\nMi expectativa salarial es de 2000 USD — negociable.`);
    const rev = aprobarCarta(db, c.id);
    expect(rev.errores.join(" ")).toMatch(/rayas/);
    expect(rev.errores.join(" ")).toMatch(/salario/);
    expect(cartaAprobada(db, v.id)).toBeUndefined();
  });

  it("detecta datos no respaldados", () => {
    const rev = revisarCarta("Hola. Trabajé 5 años en Google y tengo la certificación OSCP. Escríbeme a x@y.com", "Perfil: estudiante. Empresa: ACME");
    expect(rev.errores.join(" ")).toMatch(/x@y\.com/);
    expect(rev.avisos.join(" ")).toMatch(/5/);
    expect(rev.avisos.join(" ")).toMatch(/Google/);
    expect(rev.avisos.join(" ")).toMatch(/OSCP/);
  });

  it("limpia rayas largas de la salida de la IA", () => {
    expect(limpiarSalidaIA("Hola — equipo – ACME")).toBe("Hola, equipo - ACME");
  });

  it("configuración de IA: mock por defecto, Ollama local configurable", async () => {
    expect(configIA({}, {}).proveedor).toBe("mock");
    const cfg = configIA({ ia_proveedor: "ollama", ollama_modelo: "qwen2.5" }, {});
    expect(cfg.ollamaUrl).toBe("http://localhost:11434");
    let cuerpo: { model?: string } = {};
    const fake = (async (_url: string, init?: RequestInit) => {
      cuerpo = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ response: "Carta" }));
    }) as typeof fetch;
    expect(await ollama(cfg).generar({ sistema: "s", usuario: "u", respaldo: "r" }, fake)).toBe("Carta");
    expect(cuerpo.model).toBe("qwen2.5");
    const caido = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
    await expect(ollama(cfg).generar({ sistema: "s", usuario: "u", respaldo: "r" }, caido)).rejects.toThrow(/ollama serve/);
  });
});

describe("ATS", () => {
  it("detecta el ATS por la URL", () => {
    expect(detectarAts("https://boards.greenhouse.io/acme/jobs/1")?.nombre).toBe("Greenhouse");
    expect(detectarAts("https://jobs.lever.co/acme/1")?.nombre).toBe("Lever");
    expect(detectarAts("https://jobs.ashbyhq.com/acme/1")?.nombre).toBe("Ashby");
    expect(detectarAts("https://apply.workable.com/acme/j/1")?.nombre).toBe("Workable");
    expect(detectarAts("https://acme.wd1.myworkdayjobs.com/x")?.nombre).toBe("Workday");
    expect(detectarAts("https://www.linkedin.com/jobs/view/1")?.nombre).toBe("LinkedIn");
    expect(detectarAts("https://wellfound.com/jobs/1")?.nombre).toBe("Wellfound");
    expect(detectarAts("https://app.joinhandshake.com/jobs/1")?.nombre).toBe("Handshake");
    expect(detectarAts("https://example.com")).toBeNull();
  });
});
