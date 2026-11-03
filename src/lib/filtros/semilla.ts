/**
 * Valores semilla de la tabla `filtros` (clave → valor). Todo es editable desde Configuración.
 * Las listas van separadas por comas. NO incluir aquí datos personales ni salario.
 */
export const FILTROS_SEMILLA: Record<string, string> = {
  palabras_ofensiva:
    "penetration tester, pentester, pentest, red team, offensive security, security consultant, application security, appsec, vulnerability assessment, ethical hacker, junior, associate, apprentice, trainee, intern",
  palabras_defensiva:
    "SOC analyst, security analyst, blue team, incident response, threat detection, vulnerability management, GRC analyst, DFIR, junior, associate, cybersecurity, information security, infosec",
  palabras_software:
    "software engineer, software developer, backend, back-end, full stack, fullstack, DevOps, SRE, site reliability, platform, automation, QA automation, security engineer, Python, C#, TypeScript, junior",
  // Palabras de nivel: cuentan como "bonus" pero no deciden el área por sí solas.
  palabras_nivel:
    "junior, jr, associate, apprentice, apprenticeship, trainee, intern, internship, entry level, graduate, new grad",
  excluir:
    "UI/UX, UX designer, UI designer, product designer, sales, recruiter, on-site, onsite, hybrid, US citizen only, EU residents only",

  // Ubicación
  regiones_aceptadas_mexico: "mexico, cdmx, guadalajara, monterrey",
  regiones_aceptadas_latam:
    "latam, latin america, latinoamerica, south america, central america, americas, argentina, brazil, brasil, chile, colombia, peru, uruguay, costa rica, ecuador, bolivia, paraguay, guatemala, panama, dominican republic",
  regiones_aceptadas_mundo: "worldwide, anywhere, global, international, work from anywhere, remote global",
  regiones_europa:
    "europe, european union, eu, emea, cet, cest, germany, deutschland, france, spain, espana, italy, netherlands, portugal, poland, ireland, belgium, austria, sweden, denmark, finland, norway, switzerland, czech republic, czechia, romania, greece, hungary, estonia, latvia, lithuania, croatia, slovakia, slovenia, bulgaria, luxembourg, cyprus, malta, berlin, munich, madrid, barcelona, paris, amsterdam, lisbon, warsaw, dublin",
  regiones_eeuu: "usa, us, u.s., u.s.a., united states, united states of america, us-based, us only, nationwide",
  regiones_reino_unido: "uk, u.k., united kingdom, england, scotland, wales, great britain, gb, london",
  regiones_otras_bloqueadas:
    "canada, india, australia, singapore, japan, philippines, south africa, israel, new zealand, pakistan, nigeria, kenya, egypt, china, korea, south korea, apac, asia, vietnam, indonesia, malaysia, turkey, uae, saudi arabia",
  modalidades_aceptadas: "independent contractor, contractor, employer of record, EOR, B2B contract",

  // Restricciones que descartan en cualquier parte del texto
  bloqueo_residencia:
    "us only, usa only, u.s. only, united states only, must reside in the us, must reside in the united states, must be located in the us, must be located in the united states, must live in the us, must be based in the us, uk only, must reside in the uk, must be based in the uk, eu only, eu residents only, must reside in the eu, must be based in the eu, must reside in europe, eu resident, uk resident",
  bloqueo_permiso:
    "authorized to work in the us, authorized to work in the united states, legally authorized to work in the united states, eligible to work in the us, eligible to work in the united states, us work authorization, right to work in the uk, right to work in the eu, eligible to work in the eu, eu work permit, uk work permit, valid work permit, green card",
  bloqueo_clearance:
    "security clearance, clearance required, active clearance, secret clearance, top secret, ts/sci, polygraph, dod clearance, public trust clearance",
  bloqueo_ciudadania:
    "us citizen, u.s. citizen, us citizenship, u.s. citizenship, citizenship is required, us citizens only, requires u.s. citizenship",

  max_horas_practicas: "6",

  // Búsquedas que se envían a las fuentes (sin datos personales)
  consultas_busqueda:
    "pentester, penetration tester, red team, offensive security, application security, soc analyst, security analyst, incident response, cybersecurity, junior security, junior software engineer, devops",

  // Fuentes (1 = activa, 0 = apagada)
  fuente_getonboard: "1",
  fuente_jobgether: "1",
  fuente_greenhouse: "1",
  fuente_lever: "1",
  fuente_ashby: "1",
  fuente_github: "1",
  fuente_remotive: "0",
  fuente_remoterocketship: "0",
  fuente_isecjobs: "0",

  // Empresas para las APIs públicas de ATS (slug del tablero)
  empresas_greenhouse: "gitlab",
  empresas_lever: "",
  empresas_ashby: "",

  // IA para cartas
  ia_proveedor: "",
  ollama_url: "",
  ollama_modelo: "",
  anthropic_modelo: "",

  // Perfil ficticio de ejemplo: reemplázalo por el tuyo desde Configuración.
  perfil: `Nombre: Alex (ejemplo)
Formación: estudiante de último año de Ingeniería en Computación y Ciberseguridad.
Ubicación: México. Busco trabajo 100% remoto.
Intereses: pruebas de penetración, red team, análisis de vulnerabilidades, SOC y desarrollo backend.
Herramientas: Burp Suite, Nmap, Metasploit, Wireshark, Linux, Python, TypeScript, C#.
Proyectos: (ejemplo) laboratorio casero de Active Directory; CTFs en plataformas públicas.
Idiomas: español nativo, inglés técnico.`,

  plantilla_carta: `Hola, equipo de {empresa}:

Me interesa la vacante de {puesto}. {resumen_perfil}

{motivo}

Puedo trabajar de forma 100% remota. Quedo atento para conversar.

Saludos,
{nombre}`,
};

export const CLAVES_FUENTES = Object.keys(FILTROS_SEMILLA).filter((k) => k.startsWith("fuente_"));
