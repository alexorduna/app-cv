import { getDb } from "@/db";
import { exportarBanco, exportarSeguimiento } from "@/lib/importacion";
import { hoyISO } from "@/lib/texto";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const tipo = new URL(req.url).searchParams.get("tipo") === "banco" ? "banco" : "seguimiento";
  const csv = tipo === "banco" ? exportarBanco(getDb()) : exportarSeguimiento(getDb());
  const nombre = tipo === "banco" ? `banco_respuestas-${hoyISO()}.csv` : `seguimiento-${hoyISO()}.csv`;
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
