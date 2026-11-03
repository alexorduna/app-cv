"use client";
import { useState, useTransition } from "react";
import type { ListaGithub } from "@/db/schema";
import { actualizarListaAccion, agregarListaAccion, borrarListaAccion } from "@/app/acciones";

export function ListasGithub({ listas }: { listas: ListaGithub[] }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr><th className="py-1">Activa</th><th>Repo</th><th>Rama</th><th>Formato</th><th>Última lectura</th><th></th></tr>
        </thead>
        <tbody>
          {listas.map((l) => (
            <tr key={l.id} className="border-t border-zinc-100 align-top dark:border-zinc-800">
              <td className="py-1.5"><input type="checkbox" checked={!!l.activa} disabled={pendiente} onChange={(e) => iniciar(() => actualizarListaAccion(l.id, { activa: e.target.checked ? 1 : 0 }))} /></td>
              <td className="py-1.5 pr-2">
                <a className="enlace font-mono text-xs" href={`https://github.com/${l.repo}`} target="_blank" rel="noopener noreferrer">{l.repo}</a>
                {l.ultimoError && <div className="text-xs text-red-600 dark:text-red-400">{l.ultimoError}</div>}
              </td>
              <td className="py-1.5 pr-2">
                <input className="campo w-28 py-0.5 text-xs" defaultValue={l.rama} placeholder="(principal)" onBlur={(e) => e.target.value !== l.rama && iniciar(() => actualizarListaAccion(l.id, { rama: e.target.value }))} />
              </td>
              <td className="py-1.5 pr-2">
                <select className="campo w-auto py-0.5 text-xs" defaultValue={l.formato} onChange={(e) => iniciar(() => actualizarListaAccion(l.id, { formato: e.target.value }))}>
                  <option value="auto">Vacantes (auto)</option>
                  <option value="enlaces">Lista de enlaces</option>
                </select>
              </td>
              <td className="py-1.5 pr-2 text-xs text-zinc-500">
                {l.ultimaLectura ? l.ultimaLectura.slice(0, 16).replace("T", " ") : "Nunca"}
                {l.ultimoSha && <div className="font-mono">{l.ultimoSha.slice(0, 7)}</div>}
              </td>
              <td className="py-1.5 text-right whitespace-nowrap">
                <button className="btn-sec btn-chico mr-1" title="Olvidar el SHA para releer completa" onClick={() => iniciar(() => actualizarListaAccion(l.id, { reiniciarSha: true }))}>Releer</button>
                <button className="btn-peligro btn-chico" onClick={() => confirm(`¿Quitar ${l.repo}?`) && iniciar(() => borrarListaAccion(l.id))}>Quitar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
        action={(fd) => iniciar(async () => { const r = await agregarListaAccion(fd); setError(r.error ?? ""); })}
      >
        <label><span className="etiqueta">Repo (owner/nombre o URL)</span><input name="repo" className="campo w-80" placeholder="owner/awesome-security-jobs" required /></label>
        <label><span className="etiqueta">Rama</span><input name="rama" className="campo w-28" placeholder="(principal)" /></label>
        <label><span className="etiqueta">Formato</span>
          <select name="formato" className="campo w-auto"><option value="auto">Vacantes (auto)</option><option value="enlaces">Lista de enlaces</option></select>
        </label>
        <button className="btn-primario" disabled={pendiente}>Agregar lista</button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </form>
    </div>
  );
}
