# Requisitos SysTrack - Extraídos do PDF

## Resumo do Projeto
Sistema inteligente de monitoramento contínuo de servidores, capaz de coletar e exibir dados
sobre uso de CPU, memória, disco e rede, além de permitir ações corretivas em tempo real.
Voltado para pequenas e médias empresas.

## Funcionalidades Principais (do PDF)

### Monitoramento em Tempo Real
- Uso de CPU (percentual, por núcleo)
- Uso de Memória RAM
- Uso de Disco (partições, I/O)
- Tráfego de Rede (bytes enviados/recebidos, velocidade)
- Processos em execução

### Dashboard Web
- Interface web acessível via browser
- Visualização de dados em tempo real
- Dados históricos / informações históricas
- Exibição intuitiva de consumo de recursos

### Sistema de Alertas
- Alertas sobre uso excessivo de recursos
- Notificações sobre status dos recursos esgotáveis
- Configuração de limites/thresholds

### Gerenciamento de Processos
- Listagem de processos em execução
- Ações corretivas em tempo real (matar processo, etc.)

### Monitoramento de Rede
- Tráfego de dados
- Dispositivos conectados
- Uso de largura de banda
- Latência
- Identificação de gargalos

## Funcionalidades Extras (além do PDF, para melhor experiência)
- Tema claro e escuro (toggle)
- Informações do sistema (hostname, OS, uptime, kernel)
- Monitoramento de serviços systemd
- Terminal web integrado (básico)
- Logs do sistema
- Informações de hardware (CPU model, RAM total, etc.)
- Gráficos históricos com Chart.js
- Atualização automática via WebSocket/SSE
- Interface responsiva (mobile-friendly)
- Sem autenticação (acesso direto, sem cookies)
- 100% offline, sem dependências externas de internet

## Stack Tecnológica
- Backend: Python 3 + Flask + psutil
- Frontend: HTML5 + CSS3 + JavaScript (Vanilla) + Chart.js (local)
- Comunicação: Server-Sent Events (SSE) para tempo real
- Servidor: Gunicorn ou Flask dev server
- Sistema: Ubuntu Server 20.04+
- Sem banco de dados externo (dados em memória/deque)
