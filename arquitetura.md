# Arquitetura do Sistema SysTrack

## 1. Visão Geral

O SysTrack é um sistema de monitoramento de servidores web, projetado para ser totalmente offline e autônomo. Ele é inspirado no Cockpit, mas com um escopo focado nas funcionalidades essenciais definidas no documento de requisitos. A arquitetura é baseada em um modelo cliente-servidor simples, com um backend em Python (Flask) que coleta os dados e um frontend em HTML/CSS/JS que os exibe em tempo real.

## 2. Componentes

O sistema é dividido em dois componentes principais:

| Componente | Tecnologia      | Responsabilidade                                                                   |
| :--------- | :-------------- | :--------------------------------------------------------------------------------- |
| **Backend**  | Python + Flask  | Coletar métricas do sistema, expor uma API RESTful e servir o frontend.            |
| **Frontend** | HTML/CSS/JS     | Exibir os dados de monitoramento em um dashboard interativo e em tempo real.       |

### 2.1. Backend (Servidor Flask)

O backend será construído com o micro-framework **Flask**. A principal biblioteca utilizada para a coleta de métricas do sistema será a `psutil`, que fornece uma interface multiplataforma para recuperar informações sobre processos em execução e utilização do sistema (CPU, memória, discos, rede).

**Endpoints da API:**

- `/api/system`: Retorna informações gerais do sistema (hostname, OS, uptime).
- `/api/cpu`: Retorna o uso de CPU (total e por núcleo) e informações do modelo.
- `/api/memory`: Retorna o uso de memória RAM e swap.
- `/api/disk`: Retorna o uso de disco para cada partição.
- `/api/network`: Retorna estatísticas de tráfego de rede.
- `/api/processes`: Retorna uma lista de processos em execução.
- `/stream`: Um endpoint de Server-Sent Events (SSE) que transmite as métricas em tempo real para o frontend.

### 2.2. Frontend (Cliente Web)

O frontend será uma aplicação de página única (SPA) construída com HTML5, CSS3 e JavaScript puro (Vanilla JS). Nenhuma framework de frontend (como React ou Vue) será utilizada para manter a simplicidade e a ausência de um passo de compilação.

**Principais Características:**

- **Dashboard:** A página principal exibirá todos os widgets de monitoramento.
- **Gráficos em Tempo Real:** A biblioteca **Chart.js** (incluída localmente) será usada para renderizar gráficos de linha que mostram o histórico de uso de CPU, memória e rede.
- **Atualizações em Tempo Real:** O frontend se conectará ao endpoint `/stream` do backend usando a API `EventSource` para receber atualizações de métricas em tempo real sem a necessidade de polling.
- **Tema Claro/Escuro:** Um seletor permitirá ao usuário alternar entre um tema claro e um escuro. A preferência será salva no `localStorage` do navegador.
- **Responsividade:** A interface será projetada para ser utilizável em diferentes tamanhos de tela, de desktops a dispositivos móveis.

## 3. Fluxo de Dados

1. O usuário acessa a URL raiz do servidor Flask em seu navegador.
2. O Flask renderiza e serve o arquivo `index.html` principal.
3. O JavaScript no `index.html` estabelece uma conexão `EventSource` com o endpoint `/stream` do backend.
4. O backend, ao receber a conexão, inicia um loop que periodicamente coleta as métricas do sistema usando `psutil`.
5. As métricas coletadas são formatadas como JSON e enviadas para o frontend através da conexão SSE.
6. O JavaScript no frontend recebe os eventos, decodifica os dados JSON e atualiza dinamicamente o conteúdo do DOM para refletir as novas métricas nos widgets e gráficos.

## 4. Estrutura de Diretórios

```
/home/ubuntu/systrack/
├── app.py
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       └── chart.js
└── templates/
    └── index.html
```
