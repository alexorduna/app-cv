/** npm run seed: carga los datos de ejemplo ficticios (idempotente). */
import path from "node:path";
import { cargarEnv } from "../src/lib/env";
import { abrirBaseDatos, rutaBaseDatos } from "../src/db";
import { sembrarFiltros } from "../src/lib/filtros/repo";
import { sembrarListas } from "../src/lib/fuentes/github";
import { importarCarpeta } from "../src/lib/importacion";

cargarEnv();
const db = abrirBaseDatos(rutaBaseDatos());
sembrarFiltros(db);
sembrarListas(db);
for (const r of importarCarpeta(db, path.join(process.cwd(), "data/ejemplo"))) console.log(`${r.archivo}: ${r.insertadas} nuevas`);
db.$client.close();
