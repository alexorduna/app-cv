# Chamba

App web local para buscar vacantes remotas y preparar aplicaciones de forma masiva pero supervisada.
Todo se automatiza hasta antes de aplicar: **el último clic lo das tú**. Chamba nunca envía solicitudes, formularios ni mensajes por ti.

## Inicio rápido

```bash
git clone https://github.com/alexorduna/app-cv.git chamba
cd chamba
./start.sh
```

Se abre solo en http://localhost:3000 (si no, ábrelo en el navegador).

## Qué hace `./start.sh`

1. Verifica Node 20 o superior y npm (si falta algo, te dice el comando de `pacman`).
2. Corre `npm ci` con el `package-lock.json` commiteado (se salta si `node_modules` ya está al día).
3. Crea `.env` desde `.env.example` si no existe. Funciona sin editar nada: IA en modo `mock`.
4. Crea `data/chamba.db` y aplica las migraciones de Drizzle que ya vienen en `drizzle/`.
5. Si hay CSV en `data/import/`, los importa (idempotente). Si no, y la base está vacía, carga datos de ejemplo ficticios.
6. Arranca la app en el puerto 3000 y abre el navegador.

Sin el script: `npm run setup` hace los pasos 2 a 5 y luego `npm run dev`.

## Importar tus CSV del Google Sheet

1. En el Sheet, exporta cada hoja como CSV (Archivo → Descargar → CSV).
2. Guárdalos en `data/import/` con estos nombres:
   - `seguimiento.csv` con las columnas exactas: `ID, Fecha encontrada, Empresa, Puesto, Área, Plataforma, Región, Tipo, Horas por día, Salario, Enlace para aplicar, Prioridad, Estado, Fecha de aplicación, Fecha de seguimiento, Siguiente paso, Versión de CV`
   - `banco_respuestas.csv` con `Categoría, Pregunta, Respuesta, Estado`
   - `filtros.csv` con `Clave, Valor` (las claves válidas están en `src/lib/filtros/semilla.ts`)
3. Corre `npm run import` (o vuelve a correr `./start.sh`).

La importación es idempotente: puedes repetirla las veces que quieras. Busca cada fila por su `ID` y luego por el enlace normalizado; si algo cambió en el Sheet lo actualiza, si no, no toca nada.
La pregunta de expectativa salarial nunca se guarda: queda como "Preguntar a Alex".

`data/import/`, la base de datos y `.env` están en `.gitignore` y nunca se suben.

## Exportar de vuelta al Sheet

- Botón **Exportar CSV** en la barra lateral, o
- `npm run export` → genera `data/export/seguimiento-AAAA-MM-DD.csv` y `banco_respuestas-AAAA-MM-DD.csv`.

El CSV de seguimiento tiene las mismas columnas y orden del Sheet. Solo incluye lo que está en el tablero (no las descartadas automáticas ni la bandeja Nuevas sin revisar).

## Pantallas

| Pantalla | Para qué |
|---|---|
| **Tablero** | Tabla filtrable y ordenable o Kanban por estado. Chips por área, prioridad, región y tipo, búsqueda, cambio de estado en línea y resumen (registradas, aplicadas, tasa de respuesta, entrevistas). |
| **Detalle** | Datos, notas, enlace, historial, ATS detectado. Botones: Abrir enlace, Marcar lista, Marcar aplicada (hoy), Descartar con motivo. |
| **Aplicar asistido** | Cola de "Lista para aplicar" por prioridad. Abre el enlace en otra pestaña, muestra tu banco de respuestas (buscador y copiar), la carta aprobada y los campos que suele pedir el ATS (Greenhouse, Lever, Ashby, Workable, Workday, LinkedIn, Wellfound, Handshake). "Ya apliqué" solo registra la fecha. |
| **Cartas** | Borrador por vacante con tu plantilla, tu perfil y los datos de la vacante. Revisa que no invente datos, no mencione salario y no use rayas largas. Siempre queda en Borrador hasta que la apruebes. |
| **Buscar vacantes** | Nuevas (aceptar o descartar en lote), Fuentes (buscar ahora y estado de cada fuente), Pegar alerta, Pegar enlace y Descartadas por filtros (con motivo y botón para rescatar). |
| **Historial de descartes** | Lo que tú descartaste, con tu motivo y la fecha. No se borra solo; puedes restaurar al tablero. |
| **Banco de respuestas** | Editar las respuestas que copias al aplicar. |
| **Configuración** | Filtros y palabras clave, fuentes, empresas de Greenhouse/Lever/Ashby, listas de GitHub, proveedor de IA, perfil y plantilla. |

## Fuentes de vacantes

Cada fuente es un módulo independiente (`src/lib/fuentes/`) con interruptor en Configuración. Si una falla, se muestra el error y se sigue con las demás.

| Fuente | Estado por defecto | Cómo |
|---|---|---|
| Get on Board | Activa | API pública `getonbrd.com/api/v0` |
| Jobgether | Activa | API pública documentada en `jobgether.com/llms.txt` |
| Greenhouse / Lever / Ashby | Activas | APIs públicas por empresa: 141 empresas verificadas (editables en Configuración) |
| Listas de GitHub | Activa | `raw.githubusercontent.com` y `api.github.com`, sin login. Guarda el SHA para no repetir trabajo |
| Remotive | Apagada | Su robots.txt prohíbe `/api/*`; si la enciendes, el cliente la bloquea igual |
| RemoteRocketship | No disponible | Exige suscripción y API key |
| isecjobs.com | No disponible | Redirige a foorilla.com, sin RSS ni API |

LinkedIn, Wellfound y Handshake **no se leen**: usa **Pegar alerta** (texto de tus correos de alertas) o **Pegar enlace** (capturas título y empresa a mano).

Reglas de red: respeta robots.txt, máximo 1 petición por segundo por dominio (más lento si el sitio pide Crawl-delay), User-Agent `ChambaBot/1.0` y ningún dato personal en las peticiones.

## Filtros

- Solo remoto total; se descarta híbrido y presencial.
- Se descarta si exige residir o tener permiso de trabajo en EE. UU., UE o Reino Unido, ciudadanía o security clearance.
- Se acepta México, LATAM, worldwide, anywhere y remoto sin país. Europa pasa con aviso (sueldo, inicio inmediato, residencia).
- Prácticas: máximo 6 h/día (si no se sabe, pasa con aviso).
- Solo nivel de entrada: se descartan Senior, Staff, Lead, Manager, Principal, Architect, niveles II/III y descripciones que piden 3+ años de experiencia.
- Área por palabras clave: Ofensiva (prioridad 1), Defensiva (2), Software (3).
- Lo que no pasa queda como **Descartada** con el motivo, para que lo revises. Las vacantes cerradas (🔒) de las listas no se guardan.

## IA para cartas

Las cartas se redactan en inglés. Proveedor en Configuración o en `.env`:

- `mock` (por defecto): plantilla sin IA ni red.
- `ollama`: modelo local en `OLLAMA_URL` (por defecto `http://localhost:11434`, modelo `llama3.1`).
- `anthropic`: solo si pones `ANTHROPIC_API_KEY` en `.env`. Tu perfil y los datos de la vacante se envían a la API de Anthropic.

## Scripts

| Comando | Qué hace |
|---|---|
| `./start.sh` | Todo: verifica, instala, prepara y arranca |
| `npm run setup` | Pasos 2 a 5 (dependencias, .env, base de datos, importación) |
| `npm run dev` | Arranca en http://localhost:3000 |
| `npm run build` | Compila para producción (`npm start` para correrla) |
| `npm test` | Pruebas (Vitest, sin internet) |
| `npm run import` | Importa `data/import/*.csv` |
| `npm run export` | Exporta CSV a `data/export/` |
| `npm run seed` | Carga los datos de ejemplo ficticios |

## Si algo falla

**`Necesitas Node 20 o superior` / `node: command not found`**
```bash
sudo pacman -S nodejs npm base-devel python
```
Si usas `nvm`, `nvm install 22 && nvm use 22`.

**Error de `node-gyp` o `better-sqlite3` al instalar**
Normalmente se descarga un binario precompilado. Si tu versión de Node es muy nueva o no hay red hacia GitHub, intenta compilarlo y para eso necesita herramientas:
```bash
sudo pacman -S base-devel python
```
```bash
rm -rf node_modules && ./start.sh
```

**`El puerto 3000 ya está ocupado`**
```bash
ss -ltnp | grep :3000
```
Cierra ese proceso (o la otra terminal donde ya corre Chamba) y vuelve a correr `./start.sh`.

**Ollama apagado o sin modelo** (al generar una carta con proveedor `ollama`)
```bash
ollama serve
```
```bash
ollama pull llama3.1
```
O cambia el proveedor a `mock` en Configuración.

**La base de datos quedó rara**: borra `data/chamba.db*` y vuelve a correr `./start.sh` (se reimportan tus CSV de `data/import/`).

## Privacidad

- Todo corre en localhost, sin telemetría (`NEXT_TELEMETRY_DISABLED=1`) y sin fuentes ni recursos externos al arrancar.
- No se guardan contraseñas, tokens de plataformas, tarjetas ni identificaciones. La API key de Anthropic solo vive en `.env`.
- Tu salario mínimo no se guarda en ningún lado.
- `.env`, `data/chamba.db`, `data/import/*` y `data/export/` están en `.gitignore`.

## Estructura

```
src/app/            Páginas (App Router) y acciones del servidor
src/components/     Componentes de interfaz
src/db/             Esquema Drizzle y conexión SQLite
src/lib/filtros/    Motor de filtros y valores semilla
src/lib/fuentes/    Una fuente por archivo + lector de listas de GitHub
src/lib/cartas/     Proveedores de IA y revisión de cartas
drizzle/            Migraciones generadas (commiteadas)
data/ejemplo/       Datos ficticios
tests/              Pruebas y archivos de ejemplo (sin internet)
```
