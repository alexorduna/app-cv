/** npm run import: importa data/import/{seguimiento,banco_respuestas,filtros}.csv de forma idempotente. */
import path from "node:path";
import { cargarEnv } from "../src/lib/env";
import { abrirBaseDatos, rutaBaseDatos } from "../src/db";
import { sembrarFiltros } from "../src/lib/filtros/repo";
import { hayCsvParaImportar, importarCarpeta } from "../src/lib/importacion";

cargarEnv();
const carpeta = path.resolve(process.argv[2] ?? "data/import");
if (!hayCsvParaImportar(carpeta)) {
  console.error(`No encontré seguimiento.csv, banco_respuestas.csv ni filtros.csv en ${carpeta}`);
  process.exit(1);
}
const db = abrirBaseDatos(rutaBaseDatos());
sembrarFiltros(db);
for (const r of importarCarpeta(db, carpeta)) {
  console.log(`${r.archivo}: ${r.insertadas} nuevas, ${r.actualizadas} actualizadas, ${r.sinCambios} sin cambios, ${r.omitidas} omitidas`);
}
db.$client.close();
