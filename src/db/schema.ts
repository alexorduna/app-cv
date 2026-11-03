import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const AREAS = ["Ofensiva", "Defensiva", "Software"] as const;
export type Area = (typeof AREAS)[number];

export const TIPOS = ["Tiempo completo", "Prácticas", "Contrato"] as const;
export type Tipo = (typeof TIPOS)[number];

export const ESTADOS = [
  "Por revisar",
  "Lista para aplicar",
  "Aplicada",
  "Respuesta recibida",
  "Entrevista",
  "Prueba técnica",
  "Oferta",
  "Descartada",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const ESTADOS_RESPUESTA = ["Completa", "Pendiente", "Preguntar a Alex"] as const;
export type EstadoRespuesta = (typeof ESTADOS_RESPUESTA)[number];

export const ESTADOS_CARTA = ["Borrador", "Aprobada"] as const;
export type EstadoCarta = (typeof ESTADOS_CARTA)[number];

export const vacantes = sqliteTable(
  "vacantes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // ID que trae el Google Sheet (columna "ID"); se conserva para exportar igual.
    idExterno: text("id_externo"),
    fechaEncontrada: text("fecha_encontrada"),
    empresa: text("empresa").notNull().default(""),
    puesto: text("puesto").notNull().default(""),
    area: text("area").$type<Area | "">().notNull().default(""),
    plataforma: text("plataforma").notNull().default(""),
    region: text("region").notNull().default(""),
    tipo: text("tipo").$type<Tipo | "">().notNull().default(""),
    horasPorDia: text("horas_por_dia").notNull().default(""),
    salario: text("salario").notNull().default(""),
    enlace: text("enlace").notNull().default(""),
    prioridad: integer("prioridad").notNull().default(3),
    estado: text("estado").$type<Estado>().notNull().default("Por revisar"),
    fechaAplicacion: text("fecha_aplicacion"),
    fechaSeguimiento: text("fecha_seguimiento"),
    siguientePaso: text("siguiente_paso").notNull().default(""),
    versionCv: text("version_cv").notNull().default(""),
    notas: text("notas").notNull().default(""),
    motivoDescarte: text("motivo_descarte").notNull().default(""),
    // Quién la descartó: "alex" (a mano, queda en el historial) o "filtros" (automático). Vacío si no está descartada.
    descartadaPor: text("descartada_por").$type<"" | "alex" | "filtros">().notNull().default(""),
    fechaDescarte: text("fecha_descarte"),
    huella: text("huella").notNull(),
    // 1 = está en el tablero (importada, capturada a mano o aceptada desde "Nuevas").
    // 0 = bandeja "Nuevas" (Por revisar) o descartada por filtros/lote sin pasar por el tablero.
    enTablero: integer("en_tablero").notNull().default(1),
    ubicacion: text("ubicacion").notNull().default(""),
    creada: text("creada").notNull(),
    actualizada: text("actualizada").notNull(),
  },
  (t) => [
    uniqueIndex("vacantes_huella_unq").on(t.huella),
    index("vacantes_estado_idx").on(t.estado),
  ],
);

export const bancoRespuestas = sqliteTable(
  "banco_respuestas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoria: text("categoria").notNull().default(""),
    pregunta: text("pregunta").notNull(),
    respuesta: text("respuesta").notNull().default(""),
    estado: text("estado").$type<EstadoRespuesta>().notNull().default("Pendiente"),
    actualizado: text("actualizado").notNull(),
  },
  (t) => [uniqueIndex("banco_cat_preg_unq").on(t.categoria, t.pregunta)],
);

export const filtros = sqliteTable("filtros", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull().default(""),
});

export const cartas = sqliteTable("cartas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vacanteId: integer("vacante_id")
    .notNull()
    .references(() => vacantes.id, { onDelete: "cascade" }),
  texto: text("texto").notNull().default(""),
  estado: text("estado").$type<EstadoCarta>().notNull().default("Borrador"),
  version: integer("version").notNull().default(1),
  proveedor: text("proveedor").notNull().default(""),
  creada: text("creada").notNull(),
});

export const actividad = sqliteTable("actividad", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fecha: text("fecha").notNull(),
  entidad: text("entidad").notNull(),
  entidadId: text("entidad_id").notNull().default(""),
  accion: text("accion").notNull(),
  detalle: text("detalle").notNull().default(""),
});

// Listas de GitHub (repos públicos con tablas o listings.json de vacantes).
export const listasGithub = sqliteTable(
  "listas_github",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repo: text("repo").notNull(), // "owner/nombre"
    rama: text("rama").notNull().default(""), // vacío = probar main y luego dev
    formato: text("formato").notNull().default("auto"), // auto | enlaces
    activa: integer("activa").notNull().default(1),
    ultimoSha: text("ultimo_sha"),
    ultimaLectura: text("ultima_lectura"),
    ultimoError: text("ultimo_error"),
  },
  (t) => [uniqueIndex("listas_repo_unq").on(t.repo)],
);

// Resultado de la última ejecución de cada fuente, para mostrar errores en la UI.
export const ejecucionesFuentes = sqliteTable("ejecuciones_fuentes", {
  fuente: text("fuente").primaryKey(),
  fecha: text("fecha").notNull(),
  ok: integer("ok").notNull().default(1),
  mensaje: text("mensaje").notNull().default(""),
  encontradas: integer("encontradas").notNull().default(0),
  nuevas: integer("nuevas").notNull().default(0),
});

export type Vacante = typeof vacantes.$inferSelect;
export type NuevaVacante = typeof vacantes.$inferInsert;
export type Respuesta = typeof bancoRespuestas.$inferSelect;
export type Carta = typeof cartas.$inferSelect;
export type ListaGithub = typeof listasGithub.$inferSelect;
