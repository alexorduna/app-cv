import { cache } from "react";
import { obtenerDb } from "./almacen";

/** Base de datos para leer en páginas: una sola lectura del Sheet por petición (layout + página la comparten). */
export const leerDb = cache(obtenerDb);
