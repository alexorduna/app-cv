import { leerDb } from "@/db/servidor";
import { listasGithub } from "@/db/schema";
import { guardarFiltrosAccion } from "@/app/acciones";
import { ListasGithub } from "@/components/ListasGithub";
import { FUENTES } from "@/lib/fuentes";
import { configIA } from "@/lib/cartas/proveedores";
import { leerFiltros } from "@/lib/filtros/repo";
import { modoAlmacen } from "@/db/almacen";

export const dynamic = "force-dynamic";

const GRUPOS: { titulo: string; ayuda?: string; claves: [string, string][] }[] = [
  {
    titulo: "Palabras clave por área",
    ayuda: "Separadas por comas. El área se decide en orden: ofensiva (P1), defensiva (P2), software (P3). Las palabras de nivel (junior, intern…) no deciden el área por sí solas.",
    claves: [["palabras_ofensiva", "Ofensiva"], ["palabras_defensiva", "Defensiva"], ["palabras_software", "Software"], ["palabras_nivel", "Palabras de nivel"], ["excluir", "Excluir (título o ubicación)"]],
  },
  {
    titulo: "Ubicación",
    ayuda: "Se acepta México, LATAM, worldwide y remoto sin país. Europa pasa con aviso. EE. UU., Reino Unido y otros países se descartan salvo que mencione contratista o EOR.",
    claves: [["regiones_aceptadas_mexico", "México"], ["regiones_aceptadas_latam", "LATAM"], ["regiones_aceptadas_mundo", "Mundial"], ["regiones_europa", "Europa (pasa con aviso)"], ["regiones_eeuu", "EE. UU. (descarta)"], ["regiones_reino_unido", "Reino Unido (descarta)"], ["regiones_otras_bloqueadas", "Otros países (descarta)"], ["modalidades_aceptadas", "Modalidades aceptadas (contratista, EOR)"]],
  },
  {
    titulo: "Restricciones que descartan",
    claves: [["bloqueo_residencia", "Residencia"], ["bloqueo_permiso", "Permiso de trabajo"], ["bloqueo_clearance", "Security clearance"], ["bloqueo_ciudadania", "Ciudadanía"], ["max_horas_practicas", "Máximo de horas por día en prácticas"]],
  },
];

function Area({ name, label, valor, filas = 2 }: { name: string; label: string; valor: string; filas?: number }) {
  return (
    <label className="block">
      <span className="etiqueta">{label}</span>
      <textarea name={name} defaultValue={valor} rows={filas} className="campo text-xs" />
    </label>
  );
}

export default async function PaginaConfiguracion() {
  const db = await leerDb();
  const v = leerFiltros(db);
  const ia = configIA(v);
  const hayKey = !!process.env.ANTHROPIC_API_KEY;
  const listas = db.select().from(listasGithub).orderBy(listasGithub.id).all();

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="titulo">Configuración</h1>
        <p className="subtitulo">
          Filtros, palabras clave, fuentes y proveedor de IA.{" "}
          {modoAlmacen() === "sheets"
            ? "Todo se guarda en tu Google Sheet (pestañas ocultas que empiezan con \"_\")."
            : "Todo se guarda en tu base local (data/chamba.db)."}
        </p>
      </div>

      <form action={guardarFiltrosAccion} className="flex flex-col gap-5">
        {GRUPOS.map((g) => (
          <section key={g.titulo} className="tarjeta flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">{g.titulo}</h2>
              {g.ayuda && <p className="text-xs text-zinc-500">{g.ayuda}</p>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {g.claves.map(([k, t]) => <Area key={k} name={k} label={t} valor={v[k] ?? ""} />)}
            </div>
          </section>
        ))}

        <section id="fuentes" className="tarjeta flex flex-col gap-3">
          <h2 className="font-semibold">Fuentes</h2>
          <input type="hidden" name="_fuentes" value="1" />
          <div className="grid gap-2 md:grid-cols-2">
            {FUENTES.map((f) => (
              <label key={f.id} className={`flex items-start gap-2 rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800 ${f.bloqueada ? "opacity-60" : ""}`}>
                <input type="checkbox" name={f.clave} defaultChecked={v[f.clave] === "1" && !f.bloqueada} disabled={f.bloqueada} className="mt-1" />
                <span><span className="font-medium">{f.nombre}</span><br /><span className="text-xs text-zinc-500">{f.descripcion}</span></span>
              </label>
            ))}
          </div>
          <Area name="consultas_busqueda" label="Búsquedas que se envían a Get on Board y Jobgether (sin datos personales)" valor={v.consultas_busqueda} />
          <div className="grid gap-3 md:grid-cols-3">
            <Area name="empresas_greenhouse" label="Empresas en Greenhouse (slugs)" valor={v.empresas_greenhouse} />
            <Area name="empresas_lever" label="Empresas en Lever (slugs)" valor={v.empresas_lever} />
            <Area name="empresas_ashby" label="Empresas en Ashby (slugs)" valor={v.empresas_ashby} />
          </div>
          <p className="text-xs text-zinc-500">El slug es la parte de la URL del tablero: boards.greenhouse.io/<b>gitlab</b>, jobs.lever.co/<b>empresa</b>, jobs.ashbyhq.com/<b>empresa</b>.</p>
        </section>

        <section id="ia" className="tarjeta flex flex-col gap-3">
          <h2 className="font-semibold">Proveedor de IA para cartas</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label>
              <span className="etiqueta">Proveedor (actual: {ia.proveedor})</span>
              <select name="ia_proveedor" defaultValue={v.ia_proveedor || ia.proveedor} className="campo">
                <option value="mock">mock (sin IA, plantilla)</option>
                <option value="ollama">Ollama local</option>
                <option value="anthropic" disabled={!hayKey}>Anthropic {hayKey ? "" : "(falta ANTHROPIC_API_KEY)"}</option>
              </select>
            </label>
            <label><span className="etiqueta">URL de Ollama</span><input name="ollama_url" defaultValue={v.ollama_url} placeholder={ia.ollamaUrl} className="campo" /></label>
            <label><span className="etiqueta">Modelo de Ollama</span><input name="ollama_modelo" defaultValue={v.ollama_modelo} placeholder={ia.ollamaModelo} className="campo" /></label>
            <label><span className="etiqueta">Modelo de Anthropic</span><input name="anthropic_modelo" defaultValue={v.anthropic_modelo} placeholder={ia.anthropicModelo} className="campo" /></label>
          </div>
          <p className="text-xs text-zinc-500">Con Anthropic, tu perfil y los datos de la vacante se envían a la API de Anthropic para redactar el borrador. Con mock u Ollama todo queda en tu máquina. La API key solo se lee de .env, nunca de la base de datos.</p>
        </section>

        <section id="perfil" className="tarjeta flex flex-col gap-3">
          <h2 className="font-semibold">Perfil y plantilla de carta</h2>
          <p className="text-xs text-zinc-500">La carta solo puede usar lo que escribas aquí y los datos de la vacante. Marcadores de la plantilla: {"{empresa} {puesto} {resumen_perfil} {motivo} {nombre}"}. No pongas salario.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Area name="perfil" label="Tu perfil" valor={v.perfil} filas={10} />
            <Area name="plantilla_carta" label="Plantilla" valor={v.plantilla_carta} filas={10} />
          </div>
        </section>

        <div className="sticky bottom-0 -mx-1 border-t border-zinc-200 bg-zinc-50/90 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <button className="btn-primario">Guardar configuración</button>
        </div>
      </form>

      <section className="tarjeta flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Listas de GitHub</h2>
          <p className="text-xs text-zinc-500">Repos públicos con listas de vacantes. Si existe listings.json se usa; si no, se leen las tablas del README. &quot;Lista de enlaces&quot; sirve para directorios como awesome-cybersecurity-internships. Si un formato no se entiende, la lista se desactiva y se anota en NOTAS.md.</p>
        </div>
        <ListasGithub listas={listas} />
      </section>
    </div>
  );
}
