#!/usr/bin/env bash
# ============================================================
#  install.sh — Instalación de Aurita Server en Debian/Ubuntu
#  Uso: sudo bash install.sh
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
ask()   { echo -e "${CYAN}[?]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

[[ "$EUID" -ne 0 ]] && error "Ejecuta con sudo: sudo bash install.sh"

echo ""
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${CYAN}   Instalación de Aurita Server       ${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo ""

# ── Dos únicas preguntas al admin ────────────────────────────
ask "¿URL interna de Jellyfin? (Enter para http://localhost:8096)"
read -r JELLYFIN_URL
JELLYFIN_URL="${JELLYFIN_URL:-http://localhost:8096}"

ask "¿URL externa de Jellyfin? (la que usan los usuarios, ej: https://jellyfin.tudominio.com)"
read -r JELLYFIN_EXTERNAL_URL
[[ -z "$JELLYFIN_EXTERNAL_URL" ]] && error "La URL externa de Jellyfin es obligatoria."

ask "¿Puerto para Aurita Server? (Enter para 3000)"
read -r PORT
PORT="${PORT:-3000}"

echo ""
info "Jellyfin interno:  $JELLYFIN_URL"
info "Jellyfin externo:  $JELLYFIN_EXTERNAL_URL"
info "Puerto:            $PORT"
echo ""

# ── Node.js 20 LTS ───────────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Instalando Node.js 20 LTS…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
else
  info "Node.js ya instalado: $(node --version)"
fi

# ── Dependencias del sistema ──────────────────────────────────
apt-get install -y python3 make g++ >/dev/null 2>&1 || true

# ── Usuario del sistema ───────────────────────────────────────
if ! id "aurita" &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false aurita
  info "Usuario 'aurita' creado"
fi

# ── Directorio de instalación ─────────────────────────────────
INSTALL_DIR="/opt/aurita-server"
mkdir -p "$INSTALL_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR"/. "$INSTALL_DIR"/
info "Archivos copiados a $INSTALL_DIR"

# ── npm install ───────────────────────────────────────────────
info "Instalando dependencias npm…"
cd "$INSTALL_DIR"
npm install --omit=dev --no-fund --no-audit >/dev/null 2>&1
info "Dependencias instaladas"

# ── Directorios de caché ──────────────────────────────────────
mkdir -p "$INSTALL_DIR/cache/images"
info "Directorios de caché creados"

# ── Permisos ──────────────────────────────────────────────────
chown -R aurita:aurita "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"

# ── Servicio systemd con las variables de entorno ─────────────
cat > /etc/systemd/system/aurita-server.service << EOF
[Unit]
Description=Aurita Server — Intermediario Jellyfin
After=network.target

[Service]
Type=simple
User=aurita
Group=aurita
WorkingDirectory=/opt/aurita-server
ExecStart=/usr/bin/node /opt/aurita-server/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aurita-server

Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=JELLYFIN_URL=${JELLYFIN_URL}
Environment=JELLYFIN_EXTERNAL_URL=${JELLYFIN_EXTERNAL_URL}
# Sync cada 5 minutos (cambiar si se desea otro intervalo)
# Environment=SYNC_INTERVAL_MINUTES=5

EOF

info "Servicio systemd configurado"

systemctl daemon-reload
systemctl enable aurita-server >/dev/null 2>&1
systemctl restart aurita-server

sleep 2
if systemctl is-active --quiet aurita-server; then
  info "Aurita Server arrancado en el puerto $PORT"
else
  warn "El servicio no arrancó. Comprueba: journalctl -u aurita-server -n 20"
fi

# ── Firewall (si ufw está activo) ─────────────────────────────
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp comment 'Aurita Server' >/dev/null 2>&1
  info "Puerto $PORT abierto en ufw"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}   Instalación completada             ${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "  Siguiente paso:"
echo "  → Añade en tu Caddy: aurita.tudominio.com → localhost:${PORT}"
echo "  → Abre Aurita, selecciona 'Aurita Server'"
echo "  → Escribe https://aurita.tudominio.com y tus credenciales de Jellyfin"
echo "  → La primera vez que entres, el servidor sincroniza tu biblioteca solo"
echo ""
echo "  Gestión del servicio:"
echo "    sudo systemctl status aurita-server"
echo "    sudo journalctl -u aurita-server -f"
echo ""
