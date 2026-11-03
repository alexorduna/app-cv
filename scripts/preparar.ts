/**
 * Pasos 4 y 5 del arranque: crea la BD, aplica migraciones, siembra filtros y listas,
 * e importa data/import/*.csv (o carga los datos de ejemplo ficticios si no hay CSV y la BD está vacía).
 */
import path from "node:path";
import { cargarEnv } from "../src/lib/env";
import { abrirBaseDatos, rutaBaseDatos } from "../src/db";
import { vacantes } from "../src/db/schema";
import { sembrarFiltros } from "../src/lib/filtros/repo";
import { sembrarListas } from "../src/lib/fuentes/github";
import { hayCsvParaImportar, importarCarpeta } from "../src/lib/importacion";

cargarEnv();
const ruta = rutaBaseDatos();
const db = abrirBaseDatos(ruta);
console.log(`✔ Base de datos lista y migrada: ${path.relative(process.cwd(), ruta)}`);
sembrarFiltros(db);
sembrarListas(db);
console.log("✔ Filtros y listas de GitHub por defecto sembrados (sin pisar tus cambios)");

const carpetaImport = path.join(process.cwd(), "data/import");
if (hayCsvParaImportar(carpetaImport)) {
  for (const r of importarCarpeta(db, carpetaImport)) {
    console.log(`✔ ${r.archivo}: ${r.insertadas} nuevas, ${r.actualizadas} actualizadas, ${r.sinCambios} sin cambios, ${r.omitidas} omitidas`);
  }
} else if (db.select({ id: vacantes.id }).from(vacantes).limit(1).all().length === 0) {
  for (const r of importarCarpeta(db, path.join(process.cwd(), "data/ejemplo"))) {
    console.log(`✔ Ejemplo ficticio ${r.archivo}: ${r.insertadas} filas`);
  }
  console.log("ℹ No hay CSV en data/import/: se cargaron datos de ejemplo ficticios.");
} else {
  console.log("ℹ No hay CSV en data/import/ y la base ya tiene datos: no se cambió nada.");
}
db.$client.close();
