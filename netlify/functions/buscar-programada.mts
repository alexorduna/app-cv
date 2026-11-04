/**
 * Función programada de Netlify: cada 6 horas dispara buscar-background (que puede durar hasta 15 minutos).
 * Las programadas solo pueden durar 30 s, por eso no buscan aquí. Solo corren en el deploy de producción.
 */
export default async (req: Request) => {
  const origen = process.env.URL || new URL(req.url).origin;
  const clave = process.env.CHAMBA_CLAVE;
  if (!clave) {
    console.error("buscar-programada: falta CHAMBA_CLAVE en Netlify; no se dispara la búsqueda.");
    return;
  }
  const r = await fetch(`${origen}/.netlify/functions/buscar-background`, {
    method: "POST",
    headers: { "x-chamba-clave": clave },
  });
  console.log(`buscar-programada: búsqueda disparada (HTTP ${r.status})`);
};

// 00:17, 06:17, 12:17 y 18:17 UTC (minuto 17 para no coincidir con la hora en punto).
export const config = { schedule: "17 */6 * * *" };
