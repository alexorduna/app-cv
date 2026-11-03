/**
 * Revisión de cartas: que no inventen datos, que no mencionen salario y que no usen rayas largas.
 * Errores bloquean la aprobación; avisos son para revisar a ojo.
 */
import { normalizar } from "@/lib/texto";

export interface Revision {
  errores: string[];
  avisos: string[];
}

const SALARIO = /\b(salari[oa]s?|sueldos?|salary|salaries|compensation|compensaci[oó]n|remuneraci[oó]n|pay range|pay expectations?|wages?|hourly rate|tarifa|pretensi[oó]n(es)? econ[oó]mica)\b|[$€£]\s?\d|\b\d+\s?k\b|\b(usd|mxn|eur)\b/i;
const RAYAS = /[—–―]/; // raya (—), semirraya (–) y barra horizontal

const COMUNES = new Set(
  "hola estimado estimada equipo saludos atentamente gracias me quedo quedo puedo tengo soy estoy mi mis el la los las un una en de del por para con y o que como cuando donde este esta estos estas hi hello dear team best regards thank thanks sincerely i my the a an and or of to in for with as at on this that it is am be have has will would can could your you we our me". split(" "),
);

function palabrasPropias(texto: string): string[] {
  const res: string[] = [];
  for (const oracion of texto.split(/(?<=[.!?:\n])\s+/)) {
    const palabras = oracion.trim().split(/\s+/);
    palabras.forEach((p, i) => {
      const limpia = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
      if (i === 0 || limpia.length < 3) return; // inicio de oración: mayúscula normal
      if (/^\p{Lu}/u.test(limpia) && !COMUNES.has(limpia.toLowerCase())) res.push(limpia);
    });
  }
  return res;
}

/** `fuentes` es todo lo que la carta puede usar: perfil, datos de la vacante y plantilla. */
export function revisarCarta(texto: string, fuentes: string): Revision {
  const errores: string[] = [];
  const avisos: string[] = [];
  const base = normalizar(fuentes);

  if (RAYAS.test(texto)) errores.push("Usa rayas largas (— o –). Cámbialas por comas, puntos o paréntesis.");
  const sal = texto.match(SALARIO);
  if (sal) errores.push(`Menciona salario o dinero ("${sal[0]}"). La expectativa salarial se decide caso por caso, fuera de la carta.`);
  const marcador = texto.match(/\{[a-z_]+\}/);
  if (marcador) errores.push(`Quedó un marcador sin llenar: ${marcador[0]}`);
  if (!texto.trim()) errores.push("La carta está vacía.");

  const numeros = texto.match(/\b\d+(?:[.,]\d+)?%?/g) ?? [];
  for (const n of new Set(numeros)) if (!base.includes(normalizar(n)) && n !== "100%") avisos.push(`Número no respaldado por tu perfil ni la vacante: ${n}`);
  const correos = texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  for (const c of correos) if (!base.includes(normalizar(c))) errores.push(`Correo no respaldado: ${c}`);
  const urls = texto.match(/https?:\/\/\S+/g) ?? [];
  for (const u of urls) if (!base.includes(normalizar(u))) errores.push(`Enlace no respaldado: ${u}`);
  const propias = [...new Set(palabrasPropias(texto))].filter((p) => !base.includes(normalizar(p)));
  if (propias.length) avisos.push(`Nombres o términos que no aparecen en tu perfil ni en la vacante (¿inventados?): ${propias.slice(0, 12).join(", ")}`);
  return { errores, avisos };
}

/** Limpieza automática de la salida de la IA: sin rayas largas. */
export function limpiarSalidaIA(texto: string): string {
  return texto
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/\s*–\s*/g, " - ")
    .replace(/^\s*(Aquí tienes|Here is|Here's)[^\n]*\n+/i, "")
    .trim();
}
