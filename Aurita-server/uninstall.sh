#!/usr/bin/env bash
# ============================================================
#  uninstall.sh — Desinstalación completa de Aurita Server
#  Uso: sudo bash uninstall.sh
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

[[ "$EUID" -ne 0 ]] && error "Ejecuta con sudo: sudo bash uninstall.sh"

INSTALL_DIR="/opt/aurita-server"

echo ""
echo -e "${RED}════════════════════════════════════════${NC}"
echo -e "${RED}   Desinstalación de Aurita Server       ${NC}"
echo -e "${RED}════════════════════════════════════════${NC}"
echo ""
warn "Esto ELIMINARÁ por completo Aurita Server:"
echo "  - Servicio systemd"
echo "  - $INSTALL_DIR"
echo "  - Usuario 'aurita'"
echo "  - Caché de imágenes y audio"
echo "  - Base de datos local"
echo ""

read -r -p "¿Continuar? (s/N): " CONFIRM
[[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]] && echo "Cancelado." && exit 0

# ── Detener y eliminar servicio ──────────────────────────────
if systemctl is-active --quiet aurita-server 2>/dev/null; then
  systemctl stop aurita-server
  info "Servicio detenido"
fi

if systemctl is-enabled --quiet aurita-server 2>/dev/null; then
  systemctl disable aurita-server
  info "Servicio deshabilitado"
fi

if [ -f /etc/systemd/system/aurita-server.service ]; then
  rm -f /etc/systemd/system/aurita-server.service
  systemctl daemon-reload
  info "Archivo de servicio eliminado"
fi

# ── Eliminar directorio de instalación ───────────────────────
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  info "Directorio $INSTALL_DIR eliminado"
fi

# ── Eliminar usuario del sistema ─────────────────────────────
if id "aurita" &>/dev/null; then
  userdel aurita
  info "Usuario 'aurita' eliminado"
fi

# ── Firewall ─────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  # Lee el puerto desde el servicio viejo si existe, sino usa 3000
  PORT=$(grep -oP 'Environment=PORT=\K\d+' /etc/systemd/system/aurita-server.service 2>/dev/null || echo "3000")
  if ufw status 2>/dev/null | grep -q "$PORT/tcp"; then
    ufw delete allow "$PORT/tcp" >/dev/null 2>&1 || true
    info "Regla ufw del puerto $PORT eliminada"
  fi
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}   Aurita Server desinstalado           ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  Para eliminar Node.js si ya no lo necesitas:"
echo "    sudo apt-get purge -y nodejs && sudo rm -rf /etc/apt/sources.list.d/nodesource.list"
echo ""
