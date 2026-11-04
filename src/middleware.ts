import { NextResponse, type NextRequest } from "next/server";

/**
 * Contraseña para el sitio en línea. Si CHAMBA_CLAVE está definida (p. ej. en Netlify), se pide usuario y contraseña.
 * En tu laptop, sin CHAMBA_CLAVE, no pide nada.
 */
export function middleware(req: NextRequest) {
  const clave = process.env.CHAMBA_CLAVE;
  if (!clave) return NextResponse.next();
  const usuario = process.env.CHAMBA_USUARIO || "alex";
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const [u, ...resto] = atob(auth.slice(6)).split(":");
    if (u === usuario && resto.join(":") === clave) return NextResponse.next();
  }
  return new NextResponse("Se necesita usuario y contraseña.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Chamba", charset="UTF-8"' },
  });
}

// /.netlify/functions/* se excluye: esas funciones validan CHAMBA_CLAVE por su cuenta (cabecera x-chamba-clave).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|\\.netlify/).*)"] };
