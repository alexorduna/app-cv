#!/usr/bin/env bash
# Chamba: búsqueda automática en tu laptop (sin GitHub Actions), guardando en tu Google Sheet.
# La ejecuta el timer de systemd (systemd/chamba-buscar.timer) o tú a mano: ./scripts/buscar-local.sh
#
# Variables: se leen de ~/.config/chamba/env (fuera del repo). Mínimo:
#   GOOGLE_SHEET_ID=<URL o ID de tu Sheet>
#   GOOGLE_SERVICE_ACCOUNT_FILE=<ruta absoluta a la llave JSON, FUERA del repo>
# Opcional: NODE_BIN=/ruta/a/node (si usas nvm u otro Node que systemd no encuentra).
#
# Este script NUNCA imprime el contenido de la llave ni contraseñas: solo nombres de variables y rutas.
set -Eeuo pipefail
umask 077

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${CHAMBA_ENV_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/chamba/env}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/chamba"
LOG="$STATE_DIR/buscar.log"
mkdir -p "$STATE_DIR"

# Rota el log si pasa de ~5 MB (se conserva una copia anterior).
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 5242880 ]; then mv -f "$LOG" "$LOG.1"; fi

# Todo lo que sigue va a la terminal (si la hay) y al log.
exec > >(tee -a "$LOG") 2>&1
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*"; }
falla() { log "✖ $*"; exit 1; }
trap 'log "✖ La búsqueda terminó con error (línea $LINENO)."' ERR

log "▶ Chamba: búsqueda automática (repo: $REPO)"

# Una sola ejecución a la vez (por si el timer coincide con una corrida manual).
exec 9>"$STATE_DIR/buscar.lock"
flock -n 9 || { log "ℹ Ya hay una búsqueda en curso; esta se omite."; exit 0; }

# 1) Variables desde el archivo fuera del repo
[ -f "$ENV_FILE" ] || falla "No existe $ENV_FILE. Créalo con GOOGLE_SHEET_ID y GOOGLE_SERVICE_ACCOUNT_FILE (ver README, 'Búsqueda automática sin GitHub Actions')."
if [ -n "$(find "$ENV_FILE" -perm /077 2>/dev/null)" ]; then
  log "⚠ $ENV_FILE lo pueden leer otros usuarios. Recomendado: chmod 600 \"$ENV_FILE\""
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
# Lo que la búsqueda no necesita, fuera del entorno.
unset CHAMBA_CLAVE CHAMBA_USUARIO ANTHROPIC_API_KEY 2>/dev/null || true

[ -n "${GOOGLE_SHEET_ID:-}" ] || falla "Falta GOOGLE_SHEET_ID en $ENV_FILE."
if [ -n "${GOOGLE_SERVICE_ACCOUNT_FILE:-}" ]; then
  [ -r "$GOOGLE_SERVICE_ACCOUNT_FILE" ] || falla "No puedo leer la llave en GOOGLE_SERVICE_ACCOUNT_FILE (revisa la ruta y los permisos)."
  LLAVE_ABS="$(realpath "$GOOGLE_SERVICE_ACCOUNT_FILE")"
  case "$LLAVE_ABS" in
    "$REPO"/*) falla "La llave está dentro del repo ($LLAVE_ABS). Muévela fuera, por ejemplo a ~/.config/chamba/, para que nunca se suba a GitHub." ;;
  esac
  export GOOGLE_SERVICE_ACCOUNT_FILE="$LLAVE_ABS"
  # Evita que un GOOGLE_SERVICE_ACCOUNT_JSON vacío o viejo del .env del repo tenga prioridad.
  export GOOGLE_SERVICE_ACCOUNT_JSON=""
elif [ -z "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]; then
  falla "Falta GOOGLE_SERVICE_ACCOUNT_FILE en $ENV_FILE (ruta a la llave JSON, fuera del repo)."
fi
log "✔ Variables cargadas desde $ENV_FILE (Sheet y llave configurados; no se muestran)."

# 2) Node 20 o superior (systemd no carga tu shell: si usas nvm, define NODE_BIN en el archivo env)
if [ -n "${NODE_BIN:-}" ]; then export PATH="$(dirname "$NODE_BIN"):$PATH"; fi
command -v node >/dev/null 2>&1 || falla "No encontré node. Instálalo (sudo pacman -S nodejs npm) o define NODE_BIN en $ENV_FILE."
command -v npm >/dev/null 2>&1 || falla "No encontré npm. Instálalo con: sudo pacman -S npm"
NODE_MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAYOR" -ge 20 ] || falla "Necesitas Node 20 o superior (tienes $(node -v))."
log "✔ Node $(node -v)"

cd "$REPO"
[ -d node_modules ] || falla "Faltan las dependencias. Corre una vez ./start.sh o npm ci en $REPO."

# 3) Espera a tener red (al encender la laptop el timer puede dispararse antes de conectarse al Wi-Fi).
for i in $(seq 1 24); do
  if getent hosts sheets.googleapis.com >/dev/null 2>&1; then break; fi
  [ "$i" -eq 24 ] && falla "Sin conexión a internet después de 2 minutos; se reintentará en la siguiente ejecución."
  sleep 5
done

# 4) La búsqueda (respeta robots.txt, 1 petición/s por dominio y User-Agent ChambaBot/1.0; ver README)
export NEXT_TELEMETRY_DISABLED=1
if npm run --silent buscar; then
  log "✔ Búsqueda terminada. Revisa la pestaña \"Nuevas\" de tu Sheet."
else
  falla "npm run buscar terminó con error (detalles arriba)."
fi
