"use client";
import { useEffect, useState } from "react";

/** Script que se ejecuta antes de pintar para evitar parpadeo de tema. */
export const scriptTema = `(function(){try{var t=localStorage.getItem('tema');var d=t?t==='oscuro':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})();`;

export function BotonTema() {
  const [oscuro, setOscuro] = useState<boolean | null>(null);
  useEffect(() => setOscuro(document.documentElement.classList.contains("dark")), []);
  const cambiar = () => {
    const nuevo = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nuevo);
    try {
      localStorage.setItem("tema", nuevo ? "oscuro" : "claro");
    } catch {
      /* sin almacenamiento: solo esta sesión */
    }
    setOscuro(nuevo);
  };
  return (
    <button type="button" onClick={cambiar} className="btn-sec btn-chico w-full" aria-label="Cambiar tema">
      {oscuro === null ? "Tema" : oscuro ? "☀ Modo claro" : "☾ Modo oscuro"}
    </button>
  );
}
