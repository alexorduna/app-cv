/** Detecta el ATS por la URL y describe qué campos suele pedir (para preparar respuestas). */

export interface InfoAts {
  id: string;
  nombre: string;
  campos: string[];
  consejo: string;
}

const ATS: (InfoAts & { re: RegExp })[] = [
  {
    id: "greenhouse", nombre: "Greenhouse", re: /greenhouse\.io|gh_jid=/i,
    campos: ["Nombre y apellido", "Correo y teléfono", "CV (PDF)", "Carta (opcional, archivo o texto)", "LinkedIn / sitio web", "Preguntas de autorización de trabajo y patrocinio", "Encuesta voluntaria EEO (EE. UU.)"],
    consejo: "Suele tener preguntas personalizadas al final; revisa las de ubicación y permiso de trabajo.",
  },
  {
    id: "lever", nombre: "Lever", re: /lever\.co/i,
    campos: ["CV (PDF)", "Nombre completo", "Correo y teléfono", "Empresa actual", "LinkedIn, GitHub, portafolio", "Información adicional (texto libre: buen lugar para la carta)", "Preguntas personalizadas"],
    consejo: "El campo 'Additional information' acepta la carta pegada.",
  },
  {
    id: "ashby", nombre: "Ashby", re: /ashbyhq\.com|ashby_jid=/i,
    campos: ["Nombre", "Correo", "CV", "LinkedIn", "Ubicación actual", "Preguntas de patrocinio y autorización", "Preguntas personalizadas"],
    consejo: "A veces autocompleta desde el CV; revisa que no cambie tu ubicación.",
  },
  {
    id: "workable", nombre: "Workable", re: /workable\.com/i,
    campos: ["Nombre y apellido", "Correo y teléfono", "Dirección", "CV", "Carta de presentación (texto)", "Preguntas personalizadas", "Expectativa salarial (a veces)"],
    consejo: "Puede pedir expectativa salarial: decide caso por caso.",
  },
  {
    id: "workday", nombre: "Workday", re: /myworkdayjobs\.com|workday\.com/i,
    campos: ["Crear cuenta (correo y contraseña de Workday)", "Datos personales y dirección", "Experiencia laboral y educación (a mano)", "CV", "Preguntas de elegibilidad", "Autoidentificación voluntaria"],
    consejo: "Requiere cuenta por empresa; Chamba no guarda contraseñas. Ten a mano experiencia y educación para copiar.",
  },
  {
    id: "linkedin", nombre: "LinkedIn", re: /linkedin\.com/i,
    campos: ["Easy Apply: contacto y CV", "Preguntas de selección (años de experiencia, autorización)", "O redirige al sitio de la empresa"],
    consejo: "Chamba no automatiza LinkedIn; solo abre el enlace.",
  },
  {
    id: "wellfound", nombre: "Wellfound", re: /wellfound\.com|angel\.co/i,
    campos: ["Perfil de Wellfound completo", "Nota para el reclutador (carta corta)", "Disponibilidad y ubicación"],
    consejo: "La nota corta es clave: usa una versión breve de la carta.",
  },
  {
    id: "handshake", nombre: "Handshake", re: /joinhandshake\.com/i,
    campos: ["Perfil de Handshake", "CV y documentos", "Preguntas del empleador"],
    consejo: "Verifica que tu perfil de Handshake tenga el CV correcto antes de aplicar.",
  },
];

export function detectarAts(url: string | null | undefined): InfoAts | null {
  if (!url) return null;
  const a = ATS.find((x) => x.re.test(url));
  if (!a) return null;
  const { re: _re, ...info } = a;
  return info;
}
