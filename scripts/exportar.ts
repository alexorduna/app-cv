/** npm run export: genera CSV con las mismas columnas del Google Sheet en data/export/. */
import fs from "node:fs";
import path from "node:path";
import { cargarEnv } from "../src/lib/env";
import { abrirBaseDatos, rutaBaseDatos } from "../src/db";
import { exportarBanco, exportarSeguimiento } from "../src/lib/importacion";
import { hoyISO } from "../src/lib/texto";

cargarEnv();
const db = abrirBaseDatos(rutaBaseDatos());
const carpeta = path.resolve("data/export");
fs.mkdirSync(carpeta, { recursive: true });
const seg = path.join(carpeta, `seguimiento-${hoyISO()}.csv`);
const banco = path.join(carpeta, `banco_respuestas-${hoyISO()}.csv`);
fs.writeFileSync(seg, exportarSeguimiento(db));
fs.writeFileSync(banco, exportarBanco(db));
console.log(`✔ ${path.relative(process.cwd(), seg)}\n✔ ${path.relative(process.cwd(), banco)}`);
db.$client.close();
