import { and, desc, eq, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { cartas, type Carta, type Vacante } from "@/db/schema";
import { registrar } from "@/lib/actividad";
import { leerFiltros } from "@/lib/filtros/repo";
import { ahoraISO } from "@/lib/texto";
import { obtenerVacante } from "@/lib/vacantes";
import { configIA, obtenerProveedor, type ProveedorIA } from "./proveedores";
import { limpiarSalidaIA, revisarCarta, type Revision } from "./validar";

// Las cartas se redactan en inglés.
const MOTIVOS: Record<string, string> = {
  Ofensiva: "I am especially drawn to offensive security: penetration testing, vulnerability assessment and understanding how systems are attacked in order to help protect them.",
  Defensiva: "I am especially drawn to defensive security: monitoring, detection and incident response to keep the team's operations safe.",
  Software: "I enjoy building reliable and secure software, with solid development practices and automation.",
};

/** Lee "Campo: valor" del perfil; acepta varios nombres de campo (inglés o español). */
function campoPerfil(perfil: string, ...campos: string[]): string {
  for (const campo of campos) {
    const m = perfil.match(new RegExp(`^\\s*${campo}\\s*:\\s*(.+)$`, "im"));
    if (m) return m[1].trim();
  }
  return "";
}

const minusculaInicial = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Datos de la vacante que la carta puede usar (nada más). */
export function datosVacante(v: Pick<Vacante, "empresa" | "puesto" | "area" | "tipo" | "region" | "notas" | "plataforma">): string {
  return [`Company: ${v.empresa}`, `Position: ${v.puesto}`, `Area: ${v.area}`, `Type: ${v.tipo}`, `Region: ${v.region}`, v.notas ? `Alex's notes: ${v.notas}` : ""]
    .filter(Boolean)
    .join("\n");
}

/** Rellena la plantilla sin IA (lo usa el proveedor mock y sirve de respaldo). */
export function rellenarPlantilla(plantilla: string, perfil: string, v: Pick<Vacante, "empresa" | "puesto" | "area">): string {
  const nombre = (campoPerfil(perfil, "Name", "Nombre") || "Alex").replace(/\s*\(.*?\)\s*/g, "").trim();
  const formacion = campoPerfil(perfil, "Education", "Formación");
  const intereses = campoPerfil(perfil, "Interests", "Intereses");
  const articulo = (t: string) => (/^(a|an|the)\s/i.test(t) ? "" : /^[aeiou]/i.test(t) ? "an " : "a ");
  const resumen = [
    formacion ? `I am ${articulo(formacion)}${minusculaInicial(formacion.replace(/\.$/, ""))}.` : "",
    intereses ? `My main interests are ${minusculaInicial(intereses.replace(/\.$/, ""))}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return plantilla
    .replaceAll("{empresa}", v.empresa || "hiring")
    .replaceAll("{puesto}", v.puesto)
    .replaceAll("{resumen_perfil}", resumen)
    .replaceAll("{motivo}", MOTIVOS[v.area] ?? MOTIVOS.Software)
    .replaceAll("{nombre}", nombre);
}

export function construirPeticion(perfil: string, plantilla: string, v: Vacante) {
  const sistema = [
    "You write short cover letters (180 words maximum) for Alex.",
    "Strict rules:",
    "1. Write the letter in English.",
    "2. Use ONLY facts from the profile and the job posting provided. Never invent experience, employers, numbers, certifications or achievements.",
    "3. Do not mention salary, pay, compensation or money.",
    "4. Do not use em dashes or en dashes (— or –). Use commas, periods or parentheses.",
    "5. Return only the letter text, with no comments.",
  ].join("\n");
  const usuario = `ALEX'S PROFILE:\n${perfil}\n\nJOB POSTING:\n${datosVacante(v)}\n\nREFERENCE TEMPLATE (structure and tone):\n${plantilla}`;
  return { sistema, usuario, respaldo: rellenarPlantilla(plantilla, perfil, v) };
}

export function cartasDe(db: DB, vacanteId: number): Carta[] {
  return db.select().from(cartas).where(eq(cartas.vacanteId, vacanteId)).orderBy(desc(cartas.version)).all();
}

export function cartaAprobada(db: DB, vacanteId: number): Carta | undefined {
  return db.select().from(cartas).where(and(eq(cartas.vacanteId, vacanteId), eq(cartas.estado, "Aprobada"))).get();
}

export function fuentesPermitidas(db: DB, v: Vacante): string {
  const f = leerFiltros(db);
  return `${f.perfil}\n${datosVacante(v)}\n${f.plantilla_carta}`;
}

export function revisar(db: DB, carta: Carta): Revision {
  const v = obtenerVacante(db, carta.vacanteId);
  return revisarCarta(carta.texto, v ? fuentesPermitidas(db, v) : "");
}

/** Genera un nuevo borrador (versión n+1). Siempre queda en Borrador. */
export async function generarBorrador(db: DB, vacanteId: number, proveedorForzado?: ProveedorIA): Promise<Carta> {
  const v = obtenerVacante(db, vacanteId);
  if (!v) throw new Error("Vacante no encontrada");
  const f = leerFiltros(db);
  const proveedor = proveedorForzado ?? obtenerProveedor(configIA(f));
  const peticion = construirPeticion(f.perfil, f.plantilla_carta, v);
  const texto = limpiarSalidaIA(await proveedor.generar(peticion));
  const ultima = cartasDe(db, vacanteId)[0];
  const carta = db
    .insert(cartas)
    .values({ vacanteId, texto, estado: "Borrador", version: (ultima?.version ?? 0) + 1, proveedor: proveedor.id, creada: ahoraISO() })
    .returning()
    .get();
  registrar(db, "carta", carta.id, "borrador", `vacante ${vacanteId}, v${carta.version}, ${proveedor.id}`);
  return carta;
}

/** Guardar cambios a mano devuelve la carta a Borrador. */
export function editarCarta(db: DB, id: number, texto: string) {
  db.update(cartas).set({ texto, estado: "Borrador" }).where(eq(cartas.id, id)).run();
  registrar(db, "carta", id, "editada");
}

/** Aprueba una carta si pasa la revisión. Solo una aprobada por vacante. */
export function aprobarCarta(db: DB, id: number): Revision {
  const carta = db.select().from(cartas).where(eq(cartas.id, id)).get();
  if (!carta) throw new Error("Carta no encontrada");
  const rev = revisar(db, carta);
  if (rev.errores.length) return rev;
  db.update(cartas).set({ estado: "Borrador" }).where(and(eq(cartas.vacanteId, carta.vacanteId), ne(cartas.id, id))).run();
  db.update(cartas).set({ estado: "Aprobada" }).where(eq(cartas.id, id)).run();
  registrar(db, "carta", id, "aprobada", `vacante ${carta.vacanteId}`);
  return rev;
}
