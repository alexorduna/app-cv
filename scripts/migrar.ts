/** npm run db:migrate: crea la base si no existe y aplica las migraciones commiteadas en /drizzle. */
import { cargarEnv } from "../src/lib/env";
import { abrirBaseDatos, rutaBaseDatos } from "../src/db";

cargarEnv();
abrirBaseDatos(rutaBaseDatos()).$client.close();
console.log("✔ Migraciones aplicadas");
