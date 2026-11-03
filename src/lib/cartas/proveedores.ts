/**
 * Proveedores de IA para borradores de cartas.
 *  - mock: plantilla sin red (por defecto, para pruebas).
 *  - ollama: modelo local en OLLAMA_URL (por defecto http://localhost:11434).
 *  - anthropic: solo si existe ANTHROPIC_API_KEY en .env.
 */

export type IdProveedor = "mock" | "ollama" | "anthropic";

export interface ConfigIA {
  proveedor: IdProveedor;
  ollamaUrl: string;
  ollamaModelo: string;
  anthropicModelo: string;
  anthropicKey?: string;
}

export interface PeticionCarta {
  sistema: string;
  usuario: string;
  /** Respaldo determinista que usa el proveedor mock. */
  respaldo: string;
}

export interface ProveedorIA {
  id: IdProveedor;
  generar(p: PeticionCarta, fetchFn?: typeof fetch): Promise<string>;
}

export function configIA(valores: Record<string, string | undefined>, env: Record<string, string | undefined> = process.env): ConfigIA {
  const pedido = (valores.ia_proveedor || env.IA_PROVEEDOR || "mock").toLowerCase();
  const proveedor: IdProveedor = pedido === "ollama" || pedido === "anthropic" ? pedido : "mock";
  return {
    proveedor,
    ollamaUrl: (valores.ollama_url || env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, ""),
    ollamaModelo: valores.ollama_modelo || env.OLLAMA_MODELO || "llama3.1",
    anthropicModelo: valores.anthropic_modelo || env.ANTHROPIC_MODELO || "claude-sonnet-5-5",
    anthropicKey: env.ANTHROPIC_API_KEY || undefined,
  };
}

export const mock: ProveedorIA = {
  id: "mock",
  async generar(p) {
    return p.respaldo;
  },
};

export function ollama(cfg: ConfigIA): ProveedorIA {
  return {
    id: "ollama",
    async generar(p, fetchFn = fetch) {
      let r: Response;
      try {
        r = await fetchFn(`${cfg.ollamaUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: cfg.ollamaModelo, system: p.sistema, prompt: p.usuario, stream: false, options: { temperature: 0.4 } }),
        });
      } catch {
        throw new Error(`No se pudo conectar con Ollama en ${cfg.ollamaUrl}. ¿Está encendido? Prueba: ollama serve`);
      }
      if (r.status === 404) throw new Error(`Ollama no tiene el modelo "${cfg.ollamaModelo}". Prueba: ollama pull ${cfg.ollamaModelo}`);
      if (!r.ok) throw new Error(`Ollama respondió HTTP ${r.status}`);
      const j = (await r.json()) as { response?: string };
      return j.response ?? "";
    },
  };
}

export function anthropic(cfg: ConfigIA): ProveedorIA {
  return {
    id: "anthropic",
    async generar(p, fetchFn = fetch) {
      if (!cfg.anthropicKey) throw new Error("Falta ANTHROPIC_API_KEY en .env para usar el proveedor anthropic.");
      const r = await fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: cfg.anthropicModelo,
          max_tokens: 1200,
          system: p.sistema,
          messages: [{ role: "user", content: p.usuario }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic respondió HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { content?: { type: string; text?: string }[] };
      return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    },
  };
}

export function obtenerProveedor(cfg: ConfigIA): ProveedorIA {
  if (cfg.proveedor === "ollama") return ollama(cfg);
  if (cfg.proveedor === "anthropic") return anthropic(cfg);
  return mock;
}
