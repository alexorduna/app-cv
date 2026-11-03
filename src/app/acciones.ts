"use server";
/**
 * Acciones del servidor. NINGUNA envía solicitudes, formularios ni mensajes a terceros:
 * solo cambian la base de datos local o leen fuentes públicas de vacantes.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ESTADOS, ESTADOS_RESPUESTA, bancoRespuestas, listasGithub, type Estado, type EstadoRespuesta } from "@/db/schema";
import { extraerVacantesDeAlerta } from "@/lib/alertas";
import { buscarVacantes, ingresarLote, type ResultadoFuente } from "@/lib/buscar";
import { aprobarCarta, editarCarta, generarBorrador } from "@/lib/cartas";
import type { Revision } from "@/lib/cartas/validar";
import { FILTROS_SEMILLA } from "@/lib/filtros/semilla";
import { guardarFiltro, leerConfigFiltros } from "@/lib/filtros/repo";
import { evaluar } from "@/lib/filtros/motor";
import { normalizarRepo } from "@/lib/fuentes/github";
import { esPreguntaSalarial } from "@/lib/importacion";
import { ahoraISO, hoyISO } from "@/lib/texto";
import { registrar } from "@/lib/actividad";
import {
  aceptarNuevas, actualizarCampos, cambiarEstado, descartarVarias, ingresarCandidata, rescatarDescartada,
} from "@/lib/vacantes";

function refrescar() {
  revalidatePath("/", "layout");
}

// ---------- Vacantes ----------

export async function cambiarEstadoAccion(id: number, estado: Estado, motivo?: string) {
  if (!ESTADOS.includes(estado)) throw new Error("Estado inválido");
  cambiarEstado(getDb(), id, estado, { motivo });
  refrescar();
}

export async function marcarAplicadaAccion(id: number) {
  cambiarEstado(getDb(), id, "Aplicada", { fecha: hoyISO() });
  refrescar();
}

export async function guardarVacanteAccion(id: number, formData: FormData) {
  const campos: Record<string, string | number | null> = {};
  for (const k of ["empresa", "puesto", "area", "plataforma", "region", "tipo", "horasPorDia", "salario", "enlace", "siguientePaso", "versionCv", "notas", "motivoDescarte"]) {
    const v = formData.get(k);
    if (v !== null) campos[k] = String(v);
  }
  for (const k of ["fechaAplicacion", "fechaSeguimiento"]) {
    const v = formData.get(k);
    if (v !== null) campos[k] = String(v) || null;
  }
  const p = Number(formData.get("prioridad"));
  if (p >= 1 && p <= 3) campos.prioridad = p;
  actualizarCampos(getDb(), id, campos);
  refrescar();
}

export async function aceptarNuevasAccion(ids: number[]) {
  aceptarNuevas(getDb(), ids);
  refrescar();
}

export async function descartarNuevasAccion(ids: number[], motivo: string) {
  descartarVarias(getDb(), ids, motivo || "Descartada en lote desde Nuevas");
  refrescar();
}

export async function rescatarAccion(id: number) {
  rescatarDescartada(getDb(), id);
  refrescar();
}

// ---------- Búsqueda ----------

export async function buscarAhoraAccion(soloFuente?: string): Promise<ResultadoFuente[]> {
  const r = await buscarVacantes(getDb(), soloFuente ? { soloFuentes: [soloFuente] } : {});
  refrescar();
  return r;
}

export async function previsualizarAlertaAccion(texto: string) {
  const { plataforma, vacantes } = extraerVacantesDeAlerta(texto);
  const cfg = leerConfigFiltros(getDb());
  return {
    plataforma,
    vacantes: vacantes.map((v) => {
      const e = evaluar(v, cfg);
      return { puesto: v.puesto, empresa: v.empresa, ubicacion: v.ubicacion ?? "", enlace: v.enlace ?? "", pasa: e.pasa, motivo: e.motivo, area: e.area };
    }),
  };
}

export async function ingresarAlertaAccion(texto: string) {
  const db = getDb();
  const { plataforma, vacantes } = extraerVacantesDeAlerta(texto);
  const r = ingresarLote(db, vacantes, `${plataforma} (alerta)`, leerConfigFiltros(db));
  refrescar();
  return { ...r, total: vacantes.length };
}

export async function pegarEnlaceAccion(formData: FormData) {
  const db = getDb();
  const enlace = String(formData.get("enlace") ?? "").trim();
  const puesto = String(formData.get("puesto") ?? "").trim();
  const empresa = String(formData.get("empresa") ?? "").trim();
  if (!puesto || !empresa) return { error: "Escribe al menos el puesto y la empresa." };
  let plataforma = "Manual";
  if (/linkedin\.com/i.test(enlace)) plataforma = "LinkedIn";
  else if (/wellfound\.com|angel\.co/i.test(enlace)) plataforma = "Wellfound";
  else if (/joinhandshake\.com/i.test(enlace)) plataforma = "Handshake";
  const r = ingresarCandidata(
    db,
    {
      puesto,
      empresa,
      enlace,
      ubicacion: String(formData.get("ubicacion") ?? "").trim() || "Remote",
      remoto: formData.get("remoto") === "on" ? true : undefined,
      descripcion: String(formData.get("notas") ?? ""),
    },
    plataforma,
    leerConfigFiltros(db),
  );
  refrescar();
  if (r.estado === "duplicada") return { error: "Esa vacante ya estaba registrada." };
  return { estado: r.estado, motivo: r.evaluacion.motivo };
}

// ---------- Cartas ----------

export async function generarCartaAccion(vacanteId: number): Promise<{ error?: string }> {
  try {
    await generarBorrador(getDb(), vacanteId);
    refrescar();
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function guardarCartaAccion(id: number, texto: string) {
  editarCarta(getDb(), id, texto);
  refrescar();
}

export async function aprobarCartaAccion(id: number, texto: string): Promise<Revision> {
  const db = getDb();
  editarCarta(db, id, texto);
  const r = aprobarCarta(db, id);
  refrescar();
  return r;
}

// ---------- Banco de respuestas ----------

export async function guardarRespuestaAccion(formData: FormData) {
  const db = getDb();
  const id = Number(formData.get("id") || 0);
  const pregunta = String(formData.get("pregunta") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "").trim();
  let respuesta = String(formData.get("respuesta") ?? "");
  let estado = String(formData.get("estado") ?? "Pendiente") as EstadoRespuesta;
  if (!pregunta) return;
  if (!ESTADOS_RESPUESTA.includes(estado)) estado = "Pendiente";
  // Privacidad: la expectativa salarial nunca se guarda.
  if (esPreguntaSalarial(pregunta)) {
    respuesta = "";
    estado = "Preguntar a Alex";
  }
  if (id) db.update(bancoRespuestas).set({ pregunta, categoria, respuesta, estado, actualizado: ahoraISO() }).where(eq(bancoRespuestas.id, id)).run();
  else db.insert(bancoRespuestas).values({ pregunta, categoria, respuesta, estado, actualizado: ahoraISO() }).onConflictDoNothing().run();
  registrar(db, "banco", id || pregunta, id ? "editada" : "creada");
  refrescar();
}

export async function borrarRespuestaAccion(id: number) {
  getDb().delete(bancoRespuestas).where(eq(bancoRespuestas.id, id)).run();
  refrescar();
}

// ---------- Configuración ----------

const CLAVES_EDITABLES = new Set(Object.keys(FILTROS_SEMILLA));

export async function guardarFiltrosAccion(formData: FormData) {
  const db = getDb();
  for (const [k, v] of formData.entries()) {
    if (!CLAVES_EDITABLES.has(k) || typeof v !== "string") continue;
    if (/salari|sueldo/i.test(k)) continue;
    guardarFiltro(db, k, v.trim());
  }
  // Interruptores de fuentes: los checkbox apagados no llegan en el formulario.
  if (formData.get("_fuentes") === "1") {
    for (const k of Object.keys(FILTROS_SEMILLA).filter((x) => x.startsWith("fuente_"))) {
      guardarFiltro(db, k, formData.get(k) === "on" ? "1" : "0");
    }
  }
  registrar(db, "filtros", "", "guardados");
  refrescar();
}

export async function restaurarFiltroAccion(clave: string) {
  if (CLAVES_EDITABLES.has(clave)) guardarFiltro(getDb(), clave, FILTROS_SEMILLA[clave]);
  refrescar();
}

export async function agregarListaAccion(formData: FormData): Promise<{ error?: string }> {
  const repo = normalizarRepo(String(formData.get("repo") ?? ""));
  if (!repo) return { error: "Escribe el repo como owner/nombre o https://github.com/owner/nombre" };
  const rama = String(formData.get("rama") ?? "").trim();
  const formato = formData.get("formato") === "enlaces" ? "enlaces" : "auto";
  getDb().insert(listasGithub).values({ repo, rama, formato, activa: 1 }).onConflictDoUpdate({ target: listasGithub.repo, set: { rama, formato, activa: 1 } }).run();
  refrescar();
  return {};
}

export async function actualizarListaAccion(id: number, cambios: { rama?: string; formato?: string; activa?: number; reiniciarSha?: boolean }) {
  const set: Record<string, unknown> = {};
  if (cambios.rama !== undefined) set.rama = cambios.rama.trim();
  if (cambios.formato !== undefined) set.formato = cambios.formato === "enlaces" ? "enlaces" : "auto";
  if (cambios.activa !== undefined) set.activa = cambios.activa ? 1 : 0;
  if (cambios.reiniciarSha) set.ultimoSha = null;
  if (cambios.activa) set.ultimoError = null;
  getDb().update(listasGithub).set(set).where(eq(listasGithub.id, id)).run();
  refrescar();
}

export async function borrarListaAccion(id: number) {
  getDb().delete(listasGithub).where(eq(listasGithub.id, id)).run();
  refrescar();
}
