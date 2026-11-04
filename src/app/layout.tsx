import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Navegacion } from "@/components/Navegacion";
import { BotonTema, scriptTema } from "@/components/Tema";
import { leerDb } from "@/db/servidor";
import { listarNuevas } from "@/lib/vacantes";

export const metadata: Metadata = {
  title: "Chamba",
  description: "Busca y prepara aplicaciones a vacantes remotas, con el último clic siempre tuyo.",
};

export const dynamic = "force-dynamic";

/** Contador de la bandeja Nuevas: llega aparte, así el resto de la página no espera al Sheet. */
async function ContadorNuevas() {
  const nuevas = listarNuevas(await leerDb()).length;
  return nuevas > 0 ? <span className="rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">{nuevas}</span> : null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col gap-4 border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="px-3 pt-1">
              <div className="text-lg font-bold tracking-tight">Chamba</div>
              <div className="text-xs text-zinc-500">Tú das el último clic.</div>
            </div>
            <Navegacion contadorNuevas={<Suspense fallback={null}><ContadorNuevas /></Suspense>} />
            <div className="mt-auto flex flex-col gap-2 px-1">
              <a href="/api/exportar?tipo=seguimiento" className="btn-sec btn-chico w-full">Exportar CSV</a>
              <BotonTema />
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
