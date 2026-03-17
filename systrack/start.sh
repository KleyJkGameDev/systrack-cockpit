#!/bin/bash
# ============================================================
# SysTrack — Inicialização Rápida (sem instalação)
# Use este script para testar sem instalar como serviço.
# ============================================================

PORT=${SYSTRACK_PORT:-9090}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=============================================="
echo "  SysTrack — Inicialização Rápida"
echo "  Porta: $PORT"
echo "=============================================="

cd "$SCRIPT_DIR"

# Verifica se Python3 e pip estão disponíveis
if ! command -v python3 &>/dev/null; then
  echo "ERRO: Python3 não encontrado. Instale com: sudo apt install python3"
  exit 1
fi

# Instala dependências se necessário
echo "Verificando dependências..."
python3 -c "import flask, psutil" 2>/dev/null || {
  echo "Instalando dependências Python..."
  pip3 install flask psutil gunicorn
}

echo "Iniciando SysTrack em http://0.0.0.0:$PORT ..."
echo "Pressione Ctrl+C para parar."
echo ""

# Inicia com gunicorn se disponível, senão usa Flask dev server
if command -v gunicorn &>/dev/null || python3 -c "import gunicorn" 2>/dev/null; then
  gunicorn --bind "0.0.0.0:$PORT" \
           --workers 2 \
           --threads 4 \
           --worker-class gthread \
           --timeout 120 \
           --keep-alive 5 \
           app:app
else
  python3 app.py
fi
