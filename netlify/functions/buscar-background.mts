/**
 * Función de segundo plano de Netlify (hasta 15 minutos): corre la búsqueda de vacantes y guarda en el Google Sheet.
 * La disparan buscar-programada (cada 6 horas) y el botón "Buscar ahora" del sitio.
 * Protegida: solo corre si la petición trae la misma CHAMBA_CLAVE configurada en Netlify.
 * Netlify responde 202 de inmediato y la búsqueda sigue en segundo plano.
 */
import { timingSafeEqual } from "node:crypto";
import { guardar, obtenerDb } from "../../src/db/almacen";
import { buscarVacantes } from "../../src/lib/buscar";

function claveValida(recibida: string | null): boolean {
  const esperada = process.env.CHAMBA_CLAVE ?? "";
  if (!esperada || !recibida) return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request) => {
  if (req.method !== "POST" || !claveValida(req.headers.get("x-chamba-clave"))) {
    console.log("buscar-background: petición rechazada (falta o no coincide la clave)");
    return new Response("No autorizado", { status: 401 });
  }
  const inicio = Date.now();
  try {
    const db = await obtenerDb();
    const resultados = await buscarVacantes(db);
    await guardar(db);
    for (const r of resultados) {
      console.log(`${r.ok ? "ok" : "ERROR"} ${r.nombre}: ${r.encontradas} leídas, ${r.nuevas} nuevas, ${r.descartadas} descartadas${r.mensaje ? ` · ${r.mensaje.slice(0, 300)}` : ""}`);
    }
    console.log(`buscar-background: terminó en ${Math.round((Date.now() - inicio) / 1000)} s`);
  } catch (e) {
    // Solo el mensaje: nunca se imprimen variables de entorno ni la llave.
    console.error(`buscar-background: falló: ${(e as Error).message}`);
  }
  return new Response("ok");
};

export const config = { background: true };
