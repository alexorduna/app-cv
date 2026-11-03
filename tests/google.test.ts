import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ClienteSheets, idDeSheet, leerCredencial } from "@/db/sheets/google";
import { modoAlmacen } from "@/db/almacen";
import { middleware } from "@/middleware";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const credJson = JSON.stringify({ client_email: "chamba@proyecto.iam.gserviceaccount.com", private_key: pem.replace(/\n/g, "\\n") });

describe("conexión con Google", () => {
  it("acepta el ID o la URL del Sheet", () => {
    expect(idDeSheet("https://docs.google.com/spreadsheets/d/16c9frcaV50J_x-y/edit?usp=drivesdk")).toBe("16c9frcaV50J_x-y");
    expect(idDeSheet("abc123")).toBe("abc123");
  });

  it("lee la llave en JSON o en base64", () => {
    expect(leerCredencial({ GOOGLE_SERVICE_ACCOUNT_JSON: credJson })?.private_key).toContain("BEGIN PRIVATE KEY");
    expect(leerCredencial({ GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(credJson).toString("base64") })?.client_email).toMatch(/iam/);
    expect(leerCredencial({})).toBeNull();
  });

  it("firma el JWT de la cuenta de servicio y usa el token en las peticiones", async () => {
    const pedidas: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const fetchFalso = async (url: string, init?: RequestInit) => {
      pedidas.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string });
      if (url.includes("oauth2")) {
        const jwt = new URLSearchParams(String(init?.body)).get("assertion")!;
        const [h, c, f] = jwt.split(".");
        const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(f, "base64url"));
        const reclamos = JSON.parse(Buffer.from(c, "base64url").toString());
        if (!ok || reclamos.scope !== "https://www.googleapis.com/auth/spreadsheets") return new Response("mal", { status: 400 });
        return new Response(JSON.stringify({ access_token: "tok-123", expires_in: 3600 }));
      }
      return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: "Seguimiento" } }] }));
    };
    const c = new ClienteSheets("ID", leerCredencial({ GOOGLE_SERVICE_ACCOUNT_JSON: credJson }), { fetch: fetchFalso });
    expect((await c.pestanas())[0].title).toBe("Seguimiento");
    await c.pestanas();
    expect(pedidas.filter((p) => p.url.includes("oauth2"))).toHaveLength(1); // el token se reutiliza
    expect(pedidas.at(-1)!.headers.Authorization).toBe("Bearer tok-123");
  });

  it("explica el error si el Sheet no está compartido con la cuenta de servicio", async () => {
    const c = new ClienteSheets("ID", null, { fetch: async () => new Response("forbidden", { status: 403 }) });
    await expect(c.pestanas()).rejects.toThrow(/compartiste como Editor/);
  });

  it("usa el Sheet solo si hay GOOGLE_SHEET_ID", () => {
    expect(modoAlmacen({})).toBe("local");
    expect(modoAlmacen({ GOOGLE_SHEET_ID: "x" })).toBe("sheets");
  });
});

describe("contraseña del sitio", () => {
  afterEach(() => {
    delete process.env.CHAMBA_CLAVE;
  });
  const pedir = (auth?: string) => middleware(new NextRequest("https://chamba.test/", { headers: auth ? { authorization: auth } : {} }));

  it("sin CHAMBA_CLAVE no pide nada (uso local)", () => {
    expect(pedir().status).toBe(200);
  });
  it("con CHAMBA_CLAVE pide usuario y contraseña", () => {
    process.env.CHAMBA_CLAVE = "s3creta";
    expect(pedir().status).toBe(401);
    expect(pedir(`Basic ${btoa("alex:mala")}`).status).toBe(401);
    expect(pedir(`Basic ${btoa("alex:s3creta")}`).status).toBe(200);
  });
});
