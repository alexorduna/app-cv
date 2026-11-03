import { and, desc, eq, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { cartas, type Carta, type Vacante } from "@/db/schema";
import { registrar } from "@/lib/actividad";
import { leerFiltros } from "@/lib/filtros/repo";
import { ahoraISO } from "@/lib/texto";
import { obtenerVacante } from "@/lib/vacantes";
import { configIA, obtenerProveedor, type ProveedorIA } from "./proveedores";
import { limpiarSalidaIA, revisarCarta, type Revision } from "./validar";

const MOTIVOS: Record<string, string> = {
  Ofensiva: "Me interesa especialmente la seguridad ofensiva: pruebas de penetración, análisis de vulnerabilidades y entender cómo se atacan los sistemas para ayudar a protegerlos.",
  Defensiva: "Me interesa la seguridad defensiva: monitoreo, detección y respuesta a incidentes para proteger la operación del equipo.",
  Software: "Me interesa construir software confiable y seguro, con buenas prácticas de desarrollo y automatización.",
};

function campoPerfil(perfil: string, campo: string): string {
  const m = perfil.match(new RegExp(`^\\s*${campo}\\s*:\\s*(.+)$`, "im"));
  return m ? m[1].trim() : "";
}

/** Datos de la vacante que la carta puede usar (nada más). */
export function datosVacante(v: Pick<Vacante, "empresa" | "puesto" | "area" | "tipo" | "region" | "notas" | "plataforma">): string {
  return [`Empresa: ${v.empresa}`, `Puesto: ${v.puesto}`, `Área: ${v.area}`, `Tipo: ${v.tipo}`, `Región: ${v.region}`, v.notas ? `Notas de Alex: ${v.notas}` : ""]
    .filter(Boolean)
    .join("\n");
}

/** Rellena la plantilla sin IA (lo usa el proveedor mock y sirve de respaldo). */
export function rellenarPlantilla(plantilla: string, perfil: string, v: Pick<Vacante, "empresa" | "puesto" | "area">): string {
  const nombre = (campoPerfil(perfil, "Nombre") || "Alex").replace(/\s*\(.*?\)\s*/g, "").trim();
  const formacion = campoPerfil(perfil, "Formación");
  const intereses = campoPerfil(perfil, "Intereses");
  const resumen = [formacion ? `Soy ${formacion.replace(/\.$/, "")}.` : "", intereses ? `Me enfoco en ${intereses.replace(/\.$/, "")}.` : ""]
    .filter(Boolean)
    .join(" ");
  return plantilla
    .replaceAll("{empresa}", v.empresa || "su empresa")
    .replaceAll("{puesto}", v.puesto)
    .replaceAll("{resumen_perfil}", resumen)
    .replaceAll("{motivo}", MOTIVOS[v.area] ?? MOTIVOS.Software)
    .replaceAll("{nombre}", nombre);
}

export function construirPeticion(perfil: string, plantilla: string, v: Vacante) {
  const sistema = [
    "Eres un asistente que redacta cartas de presentación breves (máximo 180 palabras) para Alex.",
    "Reglas estrictas:",
    "1. Usa SOLO datos del perfil y de la vacante que se te dan. No inventes experiencia, empresas, cifras, certificaciones ni logros.",
    "2. No menciones salario, sueldo, compensación ni dinero.",
    "3. No uses rayas largas (— ni –). Usa comas, puntos o paréntesis.",
    "4. Escribe en el idioma del puesto (si el título está en inglés, en inglés; si no, en español).",
    "5. Devuelve solo el texto de la carta, sin comentarios.",
  ].join("\n");
  const usuario = `PERFIL DE ALEX:\n${perfil}\n\nVACANTE:\n${datosVacante(v)}\n\nPLANTILLA DE REFERENCIA (estructura y tono):\n${plantilla}`;
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
