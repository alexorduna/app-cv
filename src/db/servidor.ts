import { cache } from "react";
import { obtenerDb } from "./almacen";

/**
 * Base de datos para leer en páginas: una sola lectura del Sheet por petición (layout + página la comparten),
 * en modo "lectura" (sin pestañas pesadas). Las páginas que necesitan más usan cargarExtra().
 */
export const leerDb = cache(() => obtenerDb("lectura"));
