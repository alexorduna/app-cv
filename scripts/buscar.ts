/**
 * npm run buscar: corre todas las fuentes activas y guarda el resultado (en SQLite o en el Google Sheet).
 * Es lo que ejecuta GitHub Actions cada cierto tiempo cuando la app vive en Netlify.
 */
import { cargarEnv } from "../src/lib/env";
import { guardar, modoAlmacen, obtenerDb } from "../src/db/almacen";
import { buscarVacantes } from "../src/lib/buscar";

(async () => {
  try {
    await buscar();
  } catch (e) {
    // Mensaje claro, sin volcar la pila (y sin variables de entorno: nunca se imprimen la llave ni contraseñas).
    console.error(`✖ ${(e as Error).message}`);
    process.exit(1);
  }
})();

async function buscar() {
  cargarEnv();
  console.log(`▶ Buscando vacantes (almacén: ${modoAlmacen() === "sheets" ? "Google Sheet" : "SQLite local"})`);
  const db = await obtenerDb();
  const resultados = await buscarVacantes(db);
  await guardar(db);
  let errores = 0;
  for (const r of resultados) {
    if (!r.ok) errores++;
    console.log(`${r.ok ? "✔" : "✖"} ${r.nombre}: ${r.encontradas} leídas, ${r.nuevas} nuevas, ${r.descartadas} descartadas, ${r.duplicadas} ya vistas${r.mensaje ? ` · ${r.mensaje.slice(0, 300)}` : ""}`);
  }
  // Una fuente caída no hace fallar todo (la app sigue con las demás).
  if (errores === resultados.length && resultados.length > 0) process.exit(1);
}
