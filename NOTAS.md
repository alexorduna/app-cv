# Notas de decisiones

Decisiones tomadas eligiendo la opción más simple cuando había dudas. Todas se pueden cambiar.

## Datos y esquema

- Además de las tablas pedidas agregué `listas_github` (repos, rama, formato, SHA de la última lectura) y `ejecuciones_fuentes` (resultado de la última corrida de cada fuente, para mostrar errores en la UI).
- `vacantes` tiene columnas extra: `id_externo` (el ID del Sheet, para exportar igual), `ubicacion` (texto original), `en_tablero` (0 = bandeja Nuevas o descartada por filtros; 1 = tablero), `creada` y `actualizada`.
- El perfil y la plantilla de carta viven en la tabla `filtros` (claves `perfil` y `plantilla_carta`), editables en Configuración. La semilla es un perfil ficticio.
- Fechas se guardan como `AAAA-MM-DD`. Al importar acepto también `DD/MM/AAAA`.
- La importación es la fuente de verdad: si una fila cambió en el Sheet, se actualiza en Chamba. Se busca por `ID` y luego por huella del enlace.
- Encabezados de `banco_respuestas.csv` asumidos: `Categoría, Pregunta, Respuesta, Estado`. Los de `filtros.csv`: `Clave, Valor`.
- Cualquier pregunta del banco que hable de salario/sueldo/compensación se guarda sin respuesta y en "Preguntar a Alex", venga de donde venga (CSV o interfaz).
- El export de seguimiento incluye solo lo que está en el tablero; las descartadas automáticas y la bandeja Nuevas no se exportan.

## Filtros

- "Remote in USA", "Remote, United States", "US only" y estados de EE. UU. (", TX") cuentan como exigir estar en EE. UU. y se descartan, aunque no tengan 🛂. Igual para Reino Unido y para otros países concretos (Canadá, India, APAC…).
- Europa (incluye "Remote in Germany", EMEA, EU) **no** se descarta: pasa con aviso "confirma que no exija residencia, que el sueldo sea bueno y que puedas empezar de inmediato". Solo se descarta si el texto dice explícitamente "EU residents only", "must reside in the EU", "right to work in the EU", etc.
- Si la ubicación es restringida pero el texto menciona contractor, independent contractor, employer of record, EOR o B2B, pasa con aviso.
- "Remote" sin país pasa (región "Remoto sin especificar").
- "North America" y "Americas" se tratan distinto: "Americas" está en LATAM (incluye México); "North America" sola se descarta como otro país salvo que también diga México o LATAM.
- Las exclusiones (UI/UX, sales, recruiter, hybrid…) se buscan solo en título y ubicación, no en la descripción, para evitar falsos positivos ("hybrid cloud", "work with the sales team").
- Residencia, permiso de trabajo, clearance y ciudadanía sí se buscan en la descripción completa.
- El área se decide solo por el **título** del puesto, en orden ofensiva → defensiva → software. Las palabras de nivel (junior, associate, intern, trainee…) no deciden el área por sí solas; si no, "Junior Accountant" sería ofensiva.
- Agregué a defensiva: `cybersecurity, information security, infosec, SOC, security operations` (sin ellas se perdían "Cybersecurity Intern" y similares). También agregué variantes: `pentest`, `appsec`, `software developer`, `back-end`, `fullstack`, `site reliability`, `UI designer`, `onsite`.
- Horas de prácticas: si el texto dice "20 hours/week" o "6 horas al día" se calcula; si no se sabe, pasa con aviso "confirma máximo 6 h/día".
- **Solo nivel de entrada** (pedido por Alex):
  - Se descarta si el título tiene alguna palabra de `excluir_seniority`: senior, sr, staff, principal, lead, manager, director, head of, VP, chief, CTO, CISO, architect, distinguished, fellow, expert, mid-level, semi senior, experienced… (editable en Configuración).
  - Niveles II, III, IV, "Level 3", L4/P4 o un número al final ("Engineer 2") se descartan, salvo que el título también diga I, 1, Junior, Entry, Graduate, Intern, Trainee, Apprentice o Associate ("SOC Analyst I/II" pasa).
  - Si la fuente informa el nivel (Get on Board: Semi Senior/Senior/Expert; Jobgether: Mid-level/Senior/Expert), también se usa.
  - Si la descripción pide 3 o más años de experiencia ("3+ years of experience", "minimum 4 years", "3 años de experiencia") se descarta. Se toma el mayor de los mínimos mencionados y se ignoran cifras mayores a 15 (p. ej. "20 years in business"). El máximo permitido es `max_anios_experiencia` = 2.
  - "Associate" cuenta como entrada, aunque en consultoras a veces es nivel intermedio.

## Fuentes

- **isecjobs.com**: `isecjobs.com/robots.txt`, `/feed` y `/rss` redirigen (301) a `foorilla.com`. No hay RSS ni API propia de isecjobs. Queda desactivada.
- **Remotive**: su robots.txt tiene `Disallow: /api/*` y `Disallow: /jobs/*`. Aunque documentan una API pública, robots.txt la prohíbe. El módulo existe pero está apagado, y si lo enciendes el cliente HTTP lo bloquea con el mensaje "robots.txt no permite leer…".
- **RemoteRocketship**: su API (`remoterocketship.com/llms.txt`) exige suscripción de pago y API key. No la implementé para no guardar tokens. Queda como "No disponible".
- **Get on Board**: API pública v0, búsqueda por las palabras de `consultas_busqueda`. "remote_local" se acepta con nota (puede pedir residir en el país de la empresa).
- **Jobgether**: uso `/astroapi/ai/jobs.json?keyword=…&remoteType=full-remote`. Su robots.txt permite explícitamente esa ruta con query y pide Crawl-delay 2 s (se respeta). Uso máximo dos parámetros porque su robots.txt bloquea URLs con muchos `&`.
- **Greenhouse/Lever/Ashby**: por slug de empresa. Probé unos 300 candidatos (empresas de seguridad, infraestructura, fintech y remote-first) contra las APIs públicas y dejé los que existen y hoy tienen vacantes remotas, más las de seguridad aunque hoy no tengan remotas: 80 en Greenhouse, 16 en Lever y 45 en Ashby. Una búsqueda completa lee unas 12 000 vacantes en ~100 s.
- Las fuentes corren en paralelo; el límite de 1 petición por segundo sigue siendo por dominio.
- **api.github.com**: su robots.txt es para crawlers web; como pediste usar explícitamente la API de GitHub, ese host está en una lista de "APIs autorizadas" del cliente HTTP y no consulta robots.txt (sí respeta 1 req/s y los límites de la API: lee `x-ratelimit-remaining` y se detiene antes de agotarlo). `raw.githubusercontent.com` sí pasa por robots.txt.
- **Listas de GitHub**: si la rama está vacía, uso la rama por defecto del repo (`default_branch`) y luego `main` y `dev`. Busco `.github/scripts/listings.json` y `listings.json`; si no existen, leo tablas HTML o Markdown del README. En los repos de SimplifyJobs, `listings.json` está en `.github/scripts/` de la rama `dev` (la rama `main` no existe).
- `paralax/awesome-cybersecurity-internships` queda con formato "Lista de enlaces" (`* Empresa [Puesto](url), Ubicación`).
- En `listings.json` se omiten entradas con `is_visible: false`. **Las cerradas (🔒, `active: false`) no se guardan** (pedido por Alex); la migración `0001` borra las que ya estaban. Si el repo tiene "intern" en el nombre, el tipo es Prácticas.
- Probado con datos reales (noviembre 2026): las tres listas por defecto se leyeron, se guardó su SHA y la segunda corrida se saltó por "sin cambios". En el sandbox donde se construyó, `api.github.com` está bloqueado, así que esas dos llamadas (rama por defecto y SHA) se respondieron con `git ls-remote`; en tu máquina la app llama a la API pública directamente (sin login, 60 peticiones/hora, usa 2 por lista).
- El SHA se guarda al leer la lista con éxito.

## Historial de descartes

- Cada descarte guarda quién lo hizo (`descartada_por`: `alex` o `filtros`) y cuándo (`fecha_descarte`).
- Lo que descartas tú (tablero, detalle, bandeja Nuevas o filas "Descartada" del Sheet) queda en **Historial de descartes** con tu motivo y fecha, y nunca se borra solo. Desde ahí puedes restaurarla al tablero.
- Lo que descartan los filtros sigue en Buscar vacantes → Descartadas por filtros.

## Pegar alerta

- Reglas simples: cada enlace de vacante (LinkedIn `/jobs/view/123`, Wellfound `/jobs/…`, Handshake `/jobs/123`) cierra un bloque; de las líneas anteriores se toman puesto, empresa y ubicación, ignorando ruido ("Easy Apply", "3 connections", "Actively recruiting"…). Si no hay enlaces (texto copiado sin hipervínculos), se separa por líneas en blanco.
- Acepta HTML pegado (conserva los href).
- Los enlaces de LinkedIn se limpian a `https://www.linkedin.com/jobs/view/<id>` para que la deduplicación funcione.

## Cartas

- La revisión marca **errores** (bloquean aprobar): rayas largas (— y –), menciones de salario o dinero, correos o enlaces que no están en el perfil ni en la vacante, marcadores sin llenar.
- Marca **avisos** (no bloquean): números y nombres propios que no aparecen en el perfil ni en la vacante (posibles datos inventados). Es una heurística, puede dar falsos positivos.
- La salida de la IA se limpia automáticamente de rayas largas antes de guardarse.
- Solo una carta aprobada por vacante. Editar el texto la regresa a Borrador. Cada "Generar" crea una versión nueva.
- **Las cartas se redactan en inglés** (pedido por Alex): plantilla, perfil de ejemplo, frases del proveedor mock e instrucciones a la IA. La interfaz sigue en español. El perfil acepta campos en inglés o español (Name/Nombre, Education/Formación, Interests/Intereses).
- Modelo por defecto de Anthropic: `claude-sonnet-5-5` (configurable). Ollama: `llama3.1` (configurable).

## Arranque e instalación

- `start.sh` usa `npm run dev` para arrancar (sin compilar cada vez). Para modo producción: `npm run build && npm start`.
- `npm ci` se salta si `node_modules` ya corresponde al `package-lock.json` y a tu versión de Node (marca en `node_modules/.chamba-lock`). Así los arranques siguientes no descargan nada.
- `better-sqlite3` 12.11.1 tiene binarios precompilados para Linux x64 glibc y Node 20, 22, 24 y 26.
- Next.js 15.5 (no 16) por madurez. Fuentes del sistema, sin `next/font/google`. Telemetría apagada en todos los scripts.
- Repositorio: github.com/alexorduna/app-cv. Estaba vacío, así que el historial completo se subió directo a `main` (no había rama base contra la cual abrir un PR).
