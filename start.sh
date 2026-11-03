#!/usr/bin/env bash
# Chamba: instala, prepara y arranca en http://localhost:3000 con un solo comando.
set -euo pipefail
cd "$(dirname "$0")"
export NEXT_TELEMETRY_DISABLED=1
PUERTO=3000
URL="http://localhost:${PUERTO}"

falla() { echo -e "\n✖ $1" >&2; [ $# -gt 1 ] && echo -e "  $2" >&2; exit 1; }

echo "▶ Verificando Node y npm"
command -v node >/dev/null 2>&1 || falla "No encontré Node.js." "Instálalo con: sudo pacman -S nodejs npm base-devel python"
command -v npm  >/dev/null 2>&1 || falla "No encontré npm." "Instálalo con: sudo pacman -S nodejs npm base-devel python"
NODE_MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAYOR" -ge 20 ] || falla "Necesitas Node 20 o superior (tienes $(node -v))." "Actualiza con: sudo pacman -S nodejs npm base-devel python"
echo "✔ Node $(node -v), npm $(npm -v)"

# Pasos 2 a 5: dependencias, .env, base de datos, migraciones e importación
node scripts/setup.mjs || falla "La preparación falló (mira el mensaje de arriba)."

echo -e "\n▶ Verificando que el puerto ${PUERTO} esté libre"
if (exec 3<>"/dev/tcp/127.0.0.1/${PUERTO}") 2>/dev/null; then
  falla "El puerto ${PUERTO} ya está ocupado." "Mira qué lo usa con: ss -ltnp | grep :${PUERTO}   (y ciérralo, o detén la otra instancia de Chamba)"
fi

echo "▶ Arrancando Chamba en ${URL} (Ctrl+C para detener)"
(
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null "${URL}" 2>/dev/null; then
      echo -e "\n✔ Chamba responde en ${URL}"
      if [ -z "${CHAMBA_NO_ABRIR:-}" ] && command -v xdg-open >/dev/null 2>&1; then xdg-open "${URL}" >/dev/null 2>&1 || true; fi
      exit 0
    fi
    sleep 1
  done
  echo "⚠ La app tardó demasiado en responder; revisa los mensajes de arriba." >&2
) &
exec npm run dev
