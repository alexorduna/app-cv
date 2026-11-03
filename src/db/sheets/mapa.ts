/**
 * Qué pestaña del Google Sheet corresponde a cada tabla y qué columna a cada campo.
 * Las columnas se buscan por encabezado (no por posición), así que puedes reordenarlas.
 * Las columnas que empiezan con "_" son técnicas: se crean ocultas.
 */
import { normalizar } from "@/lib/texto";

export type Formato = "texto" | "fecha" | "numero";

export interface Columna {
  campo: string;
  /** Encabezados aceptados; el primero es el que se usa al crear la columna. */
  encabezados: string[];
  formato?: Formato;
  oculta?: boolean;
  /** Conversión de lo que hay en la celda al valor de la app (y de vuelta). */
  leer?: (celda: string) => unknown;
  escribir?: (valor: unknown) => string;
}

export interface DefTabla {
  tabla: string;
  /** Nombre del campo que identifica la fila (y la columna de la tabla en SQLite). */
  clave: string;
  /** Pestañas posibles. Para vacantes son tres; las demás tablas usan una. */
  pestanas: string[];
  /** Las pestañas técnicas se crean ocultas. */
  oculta: boolean;
  columnas: Columna[];
}

const ESTADO_BANCO_A_APP: Record<string, string> = { listo: "Completa", completa: "Completa", pendiente: "Pendiente" };

export const PESTANA_SEGUIMIENTO = "Seguimiento";
export const PESTANA_NUEVAS = "Nuevas";
export const PESTANA_DESCARTADAS = "_Descartadas";
export const PESTANA_VISTAS = "_Vistas";

const colsVacante: Columna[] = [
  { campo: "id", encabezados: ["ID"], formato: "numero" },
  { campo: "fechaEncontrada", encabezados: ["Fecha encontrada"], formato: "fecha" },
  { campo: "empresa", encabezados: ["Empresa"] },
  { campo: "puesto", encabezados: ["Puesto"] },
  { campo: "area", encabezados: ["Área"] },
  { campo: "plataforma", encabezados: ["Plataforma"] },
  { campo: "region", encabezados: ["Región"] },
  { campo: "tipo", encabezados: ["Tipo"] },
  { campo: "horasPorDia", encabezados: ["Horas por día"] },
  { campo: "salario", encabezados: ["Salario"] },
  { campo: "enlace", encabezados: ["Enlace para aplicar", "Enlace"] },
  { campo: "prioridad", encabezados: ["Prioridad"], formato: "numero" },
  { campo: "estado", encabezados: ["Estado"] },
  { campo: "fechaAplicacion", encabezados: ["Fecha de aplicación"], formato: "fecha" },
  { campo: "fechaSeguimiento", encabezados: ["Fecha de seguimiento"], formato: "fecha" },
  { campo: "siguientePaso", encabezados: ["Siguiente paso"] },
  { campo: "versionCv", encabezados: ["Versión de CV"] },
  { campo: "notas", encabezados: ["Notas"] },
  { campo: "motivoDescarte", encabezados: ["Motivo de descarte"] },
  { campo: "ubicacion", encabezados: ["_ubicacion"], oculta: true },
  { campo: "huella", encabezados: ["_huella"], oculta: true },
  { campo: "descartadaPor", encabezados: ["_descartada_por"], oculta: true },
  { campo: "fechaDescarte", encabezados: ["_fecha_descarte"], oculta: true, formato: "fecha" },
  { campo: "creada", encabezados: ["_creada"], oculta: true },
  { campo: "actualizada", encabezados: ["_actualizada"], oculta: true },
];

export const TABLAS: DefTabla[] = [
  {
    tabla: "vacantes",
    clave: "id",
    pestanas: [PESTANA_SEGUIMIENTO, PESTANA_NUEVAS, PESTANA_DESCARTADAS],
    oculta: false,
    columnas: colsVacante,
  },
  {
    tabla: "banco_respuestas",
    clave: "id",
    pestanas: ["Banco de respuestas"],
    oculta: false,
    columnas: [
      { campo: "categoria", encabezados: ["Tema", "Categoría"] },
      { campo: "pregunta", encabezados: ["Pregunta frecuente", "Pregunta"] },
      { campo: "respuesta", encabezados: ["Respuesta (inglés)", "Respuesta"] },
      {
        campo: "estado",
        encabezados: ["Estado"],
        leer: (c) => ESTADO_BANCO_A_APP[normalizar(c)] ?? (/pregunt/i.test(c) ? "Preguntar a Alex" : "Pendiente"),
        escribir: (v) => (v === "Completa" ? "Listo" : String(v ?? "")),
      },
      { campo: "id", encabezados: ["_id"], oculta: true, formato: "numero" },
      { campo: "actualizado", encabezados: ["_actualizado"], oculta: true },
    ],
  },
  {
    tabla: "filtros",
    clave: "clave",
    pestanas: ["_Chamba config"],
    oculta: true,
    columnas: [
      { campo: "clave", encabezados: ["Clave"] },
      { campo: "valor", encabezados: ["Valor"] },
    ],
  },
  {
    tabla: "cartas",
    clave: "id",
    pestanas: ["_Cartas"],
    oculta: true,
    columnas: [
      { campo: "id", encabezados: ["ID"], formato: "numero" },
      { campo: "vacanteId", encabezados: ["Vacante ID"], formato: "numero" },
      { campo: "texto", encabezados: ["Texto"] },
      { campo: "estado", encabezados: ["Estado"] },
      { campo: "version", encabezados: ["Versión"], formato: "numero" },
      { campo: "proveedor", encabezados: ["Proveedor"] },
      { campo: "creada", encabezados: ["Creada"] },
    ],
  },
  {
    tabla: "listas_github",
    clave: "id",
    pestanas: ["_Listas GitHub"],
    oculta: true,
    columnas: [
      { campo: "id", encabezados: ["ID"], formato: "numero" },
      { campo: "repo", encabezados: ["Repo"] },
      { campo: "rama", encabezados: ["Rama"] },
      { campo: "formato", encabezados: ["Formato"] },
      { campo: "activa", encabezados: ["Activa"], formato: "numero" },
      { campo: "ultimoSha", encabezados: ["Último SHA"] },
      { campo: "ultimaLectura", encabezados: ["Última lectura"] },
      { campo: "ultimoError", encabezados: ["Último error"] },
    ],
  },
  {
    tabla: "ejecuciones_fuentes",
    clave: "fuente",
    pestanas: ["_Ejecuciones"],
    oculta: true,
    columnas: [
      { campo: "fuente", encabezados: ["Fuente"] },
      { campo: "fecha", encabezados: ["Fecha"] },
      { campo: "ok", encabezados: ["OK"], formato: "numero" },
      { campo: "mensaje", encabezados: ["Mensaje"] },
      { campo: "encontradas", encabezados: ["Encontradas"], formato: "numero" },
      { campo: "nuevas", encabezados: ["Nuevas"], formato: "numero" },
    ],
  },
  {
    tabla: "actividad",
    clave: "id",
    pestanas: ["_Actividad"],
    oculta: true,
    columnas: [
      { campo: "id", encabezados: ["ID"], formato: "numero" },
      { campo: "fecha", encabezados: ["Fecha"] },
      { campo: "entidad", encabezados: ["Entidad"] },
      { campo: "entidadId", encabezados: ["Entidad ID"] },
      { campo: "accion", encabezados: ["Acción"] },
      { campo: "detalle", encabezados: ["Detalle"] },
    ],
  },
];

/** Límites para que el Sheet no crezca sin control. */
export const MAX_DESCARTADAS_FILTROS = 500;
export const MAX_ACTIVIDAD = 1000;

export function colLetra(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const ref = (pestana: string, celda: string) => `'${pestana.replace(/'/g, "''")}'!${celda}`;
