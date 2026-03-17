#!/bin/bash
# ============================================================
# SysTrack — Script de Instalação para Ubuntu Server
# ============================================================
set -e

SYSTRACK_DIR="/opt/systrack"
SERVICE_USER="systrack"
PORT=9090

echo "=============================================="
echo "  SysTrack — Instalador"
echo "=============================================="

# Verifica root
if [ "$EUID" -ne 0 ]; then
  echo "ERRO: Execute este script como root (sudo ./install.sh)"
  exit 1
fi

# Instala dependências do sistema
echo "[1/6] Instalando dependências do sistema..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv curl

# Cria diretório de instalação
echo "[2/6] Criando diretório de instalação em $SYSTRACK_DIR..."
mkdir -p "$SYSTRACK_DIR"
cp -r . "$SYSTRACK_DIR/"
chmod -R 755 "$SYSTRACK_DIR"

# Cria ambiente virtual Python
echo "[3/6] Criando ambiente virtual Python..."
python3 -m venv "$SYSTRACK_DIR/venv"
"$SYSTRACK_DIR/venv/bin/pip" install --upgrade pip -q
"$SYSTRACK_DIR/venv/bin/pip" install flask psutil gunicorn -q

# Cria usuário de serviço (sem shell, sem home)
echo "[4/6] Criando usuário de serviço '$SERVICE_USER'..."
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$SYSTRACK_DIR"

# Cria serviço systemd
echo "[5/6] Criando serviço systemd..."
cat > /etc/systemd/system/systrack.service << EOF
[Unit]
Description=SysTrack - Sistema de Monitoramento de Servidores
After=network.target
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$SYSTRACK_DIR
ExecStart=$SYSTRACK_DIR/venv/bin/gunicorn \\
    --bind 0.0.0.0:$PORT \\
    --workers 2 \\
    --threads 4 \\
    --worker-class gthread \\
    --timeout 120 \\
    --keep-alive 5 \\
    --access-logfile - \\
    --error-logfile - \\
    app:app
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=systrack
# Permissões necessárias para leitura de métricas do sistema
AmbientCapabilities=CAP_NET_ADMIN CAP_SYS_PTRACE
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
EOF

# Habilita e inicia o serviço
echo "[6/6] Habilitando e iniciando o serviço SysTrack..."
systemctl daemon-reload
systemctl enable systrack
systemctl start systrack

sleep 2

if systemctl is-active --quiet systrack; then
  echo ""
  echo "=============================================="
  echo "  ✅ SysTrack instalado com sucesso!"
  echo "  Acesse: http://$(hostname -I | awk '{print $1}'):$PORT"
  echo "  Ou: http://localhost:$PORT"
  echo "=============================================="
  echo ""
  echo "  Comandos úteis:"
  echo "  sudo systemctl status systrack   # Status"
  echo "  sudo systemctl restart systrack  # Reiniciar"
  echo "  sudo systemctl stop systrack     # Parar"
  echo "  sudo journalctl -u systrack -f   # Logs"
  echo "=============================================="
else
  echo "ERRO: O serviço não iniciou. Verifique os logs:"
  echo "  sudo journalctl -u systrack -n 50"
  exit 1
fi
