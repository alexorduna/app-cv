#!/usr/bin/env bash
# Instala el timer de systemd (usuario) que corre la búsqueda cada 6 horas. No necesita sudo.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$DEST"
for u in chamba-buscar.service chamba-buscar.timer; do
  sed "s|@REPO@|$REPO|g" "$REPO/systemd/$u" > "$DEST/$u"
done
chmod +x "$REPO/scripts/buscar-local.sh"
systemctl --user daemon-reload
systemctl --user enable --now chamba-buscar.timer
echo "✔ Timer instalado. Próxima ejecución:"
systemctl --user list-timers chamba-buscar.timer --no-pager
