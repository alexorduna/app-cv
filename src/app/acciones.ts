"use server";
/**
 * Acciones del servidor. NINGUNA envía solicitudes, formularios ni mensajes a terceros:
 * solo cambian la base de datos local o leen fuentes públicas de vacantes.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { guardar, obtenerDb } from "@/db/almacen";
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
  aceptarNuevas, actualizarCampos, cambiarEstado, descartarVarias, ingresarCandidata, rescatarDescartada, restaurarDescartada,
} from "@/lib/vacantes";

/** Revalida las páginas después de guardar (en modo Sheet, guardar() ya escribió en Google). */
function refrescar() {
  revalidatePath("/", "layout");
}

// ---------- Vacantes ----------

export async function cambiarEstadoAccion(id: number, estado: Estado, motivo?: string) {
  const db = await obtenerDb("escritura");
  if (!ESTADOS.includes(estado)) throw new Error("Estado inválido");
  cambiarEstado(db, id, estado, { motivo });
  await guardar(db);
  refrescar();
}

export async function marcarAplicadaAccion(id: number) {
  const db = await obtenerDb("escritura");
  cambiarEstado(db, id, "Aplicada", { fecha: hoyISO() });
  await guardar(db);
  refrescar();
}

export async function guardarVacanteAccion(id: number, formData: FormData) {
  const db = await obtenerDb("escritura");
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
  actualizarCampos(db, id, campos);
  await guardar(db);
  refrescar();
}

export async function aceptarNuevasAccion(ids: number[]) {
  const db = await obtenerDb("escritura");
  aceptarNuevas(db, ids);
  await guardar(db);
  refrescar();
}

export async function descartarNuevasAccion(ids: number[], motivo: string) {
  const db = await obtenerDb("escritura");
  descartarVarias(db, ids, motivo || "Descartada en lote desde Nuevas");
  await guardar(db);
  refrescar();
}

export async function rescatarAccion(id: number) {
  const db = await obtenerDb("escritura");
  rescatarDescartada(db, id);
  await guardar(db);
  refrescar();
}

export async function restaurarAccion(id: number) {
  const db = await obtenerDb("escritura");
  restaurarDescartada(db, id);
  await guardar(db);
  refrescar();
}

// ---------- Búsqueda ----------

/**
 * En línea (Netlify), la búsqueda no cabe en una petición normal: se dispara la función de segundo plano
 * buscar-background, que responde de inmediato y sigue trabajando hasta 15 minutos.
 */
export async function dispararBusquedaEnLineaAccion(): Promise<{ ok: boolean; mensaje: string }> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const origen = process.env.URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const clave = process.env.CHAMBA_CLAVE;
  if (!clave) return { ok: false, mensaje: "Falta CHAMBA_CLAVE en Netlify." };
  try {
    const r = await fetch(`${origen}/.netlify/functions/buscar-background`, {
      method: "POST",
      headers: { "x-chamba-clave": clave },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 202 || r.ok) return { ok: true, mensaje: "La búsqueda empezó. Tarda unos minutos; después recarga la pestaña Nuevas." };
    return { ok: false, mensaje: `Netlify respondió HTTP ${r.status}. ¿Se desplegó la función buscar-background?` };
  } catch (e) {
    return { ok: false, mensaje: `No pude disparar la búsqueda: ${(e as Error).message}` };
  }
}

export async function buscarAhoraAccion(soloFuente?: string): Promise<ResultadoFuente[]> {
  const db = await obtenerDb("ingesta");
  const r = await buscarVacantes(db, soloFuente ? { soloFuentes: [soloFuente] } : {});
  await guardar(db);
  refrescar();
  return r;
}

export async function previsualizarAlertaAccion(texto: string) {
  const db = await obtenerDb("lectura");
  const { plataforma, vacantes } = extraerVacantesDeAlerta(texto);
  const cfg = leerConfigFiltros(db);
  return {
    plataforma,
    vacantes: vacantes.map((v) => {
      const e = evaluar(v, cfg);
      return { puesto: v.puesto, empresa: v.empresa, ubicacion: v.ubicacion ?? "", enlace: v.enlace ?? "", pasa: e.pasa, motivo: e.motivo, area: e.area };
    }),
  };
}

export async function ingresarAlertaAccion(texto: string) {
  const db = await obtenerDb("ingesta");
  const { plataforma, vacantes } = extraerVacantesDeAlerta(texto);
  const r = ingresarLote(db, vacantes, `${plataforma} (alerta)`, leerConfigFiltros(db));
  await guardar(db);
  refrescar();
  return { ...r, total: vacantes.length };
}

export async function pegarEnlaceAccion(formData: FormData) {
  const db = await obtenerDb("ingesta");
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
  await guardar(db);
  refrescar();
  if (r.estado === "duplicada") return { error: "Esa vacante ya estaba registrada." };
  return { estado: r.estado, motivo: r.evaluacion?.motivo ?? "" };
}

// ---------- Cartas ----------

export async function generarCartaAccion(vacanteId: number): Promise<{ error?: string }> {
  const db = await obtenerDb("escritura");
  try {
    await generarBorrador(db, vacanteId);
    await guardar(db);
  refrescar();
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function guardarCartaAccion(id: number, texto: string) {
  const db = await obtenerDb("escritura");
  editarCarta(db, id, texto);
  await guardar(db);
  refrescar();
}

export async function aprobarCartaAccion(id: number, texto: string): Promise<Revision> {
  const db = await obtenerDb("escritura");
  editarCarta(db, id, texto);
  const r = aprobarCarta(db, id);
  await guardar(db);
  refrescar();
  return r;
}

// ---------- Banco de respuestas ----------

export async function guardarRespuestaAccion(formData: FormData) {
  const db = await obtenerDb("escritura");
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
  await guardar(db);
  refrescar();
}

export async function borrarRespuestaAccion(id: number) {
  const db = await obtenerDb("escritura");
  db.delete(bancoRespuestas).where(eq(bancoRespuestas.id, id)).run();
  await guardar(db);
  refrescar();
}

// ---------- Configuración ----------

const CLAVES_EDITABLES = new Set(Object.keys(FILTROS_SEMILLA));

export async function guardarFiltrosAccion(formData: FormData) {
  const db = await obtenerDb("escritura");
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
  await guardar(db);
  refrescar();
}

export async function restaurarFiltroAccion(clave: string) {
  const db = await obtenerDb("escritura");
  if (CLAVES_EDITABLES.has(clave)) guardarFiltro(db, clave, FILTROS_SEMILLA[clave]);
  await guardar(db);
  refrescar();
}

export async function agregarListaAccion(formData: FormData): Promise<{ error?: string }> {
  const db = await obtenerDb("escritura");
  const repo = normalizarRepo(String(formData.get("repo") ?? ""));
  if (!repo) return { error: "Escribe el repo como owner/nombre o https://github.com/owner/nombre" };
  const rama = String(formData.get("rama") ?? "").trim();
  const formato = formData.get("formato") === "enlaces" ? "enlaces" : "auto";
  db.insert(listasGithub).values({ repo, rama, formato, activa: 1 }).onConflictDoUpdate({ target: listasGithub.repo, set: { rama, formato, activa: 1 } }).run();
  await guardar(db);
  refrescar();
  return {};
}

export async function actualizarListaAccion(id: number, cambios: { rama?: string; formato?: string; activa?: number; reiniciarSha?: boolean }) {
  const db = await obtenerDb("escritura");
  const set: Record<string, unknown> = {};
  if (cambios.rama !== undefined) set.rama = cambios.rama.trim();
  if (cambios.formato !== undefined) set.formato = cambios.formato === "enlaces" ? "enlaces" : "auto";
  if (cambios.activa !== undefined) set.activa = cambios.activa ? 1 : 0;
  if (cambios.reiniciarSha) set.ultimoSha = null;
  if (cambios.activa) set.ultimoError = null;
  db.update(listasGithub).set(set).where(eq(listasGithub.id, id)).run();
  await guardar(db);
  refrescar();
}

export async function borrarListaAccion(id: number) {
  const db = await obtenerDb("escritura");
  db.delete(listasGithub).where(eq(listasGithub.id, id)).run();
  await guardar(db);
  refrescar();
}
