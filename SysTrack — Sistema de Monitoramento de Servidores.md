> Este projeto foi gerado pela IA Manus, em resposta a uma solicitação do usuário.

# SysTrack — Sistema de Monitoramento de Servidores

**SysTrack** é um sistema de monitoramento de servidores leve, moderno e totalmente autônomo, inspirado no [Cockpit Project](https://cockpit-project.org/). Ele foi projetado para ser executado de forma 100% offline e local, sem depender de APIs externas, cookies ou acesso à internet. O sistema oferece uma visão em tempo real da saúde e do desempenho do seu servidor Linux através de uma interface web limpa e responsiva.

![SysTrack Screenshot](https://i.imgur.com/YOUR_SCREENSHOT_URL.png) <!-- Placeholder para screenshot -->

## Índice

1.  [Funcionalidades](#funcionalidades)
2.  [Demonstração Rápida](#demonstração-rápida-sem-instalação)
3.  [Instalação como Serviço (systemd)](#instalação-como-serviço-systemd)
4.  [Arquitetura e Detalhes Técnicos](#arquitetura-e-detalhes-técnicos)
    *   [Stack Tecnológica](#stack-tecnológica)
    *   [Estrutura do Projeto](#estrutura-do-projeto)
    *   [Backend (Flask)](#backend-flask)
    *   [Frontend (Vanilla JS)](#frontend-vanilla-js)
    *   [Comunicação em Tempo Real (SSE)](#comunicação-em-tempo-real-server-sent-events)
    *   [Tema Claro e Escuro](#tema-claro-e-escuro)
5.  [Bibliotecas e Dependências](#bibliotecas-e-dependências)

---

## Funcionalidades

O SysTrack oferece um conjunto focado de funcionalidades para monitoramento essencial do servidor.

| Categoria           | Funcionalidades                                                                                                                                |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visão Geral**     | Dashboard unificado com métricas chave: CPU, RAM, Disco, Rede, Uptime e Processos.                                                             |
| **CPU**             | Monitoramento do uso total e por núcleo, frequência, carga do sistema (load average) e informações detalhadas do processador.                    |
| **Memória**         | Visualização do uso de memória RAM e Swap, incluindo detalhes sobre memória usada, livre, em cache e buffers.                                  |
| **Disco**           | Análise do uso de todas as partições montadas, com detalhes de espaço total, usado e livre. Monitoramento de I/O (leitura/escrita).           |
| **Rede**            | Acompanhamento do tráfego de rede em tempo real (velocidade de download/upload) e estatísticas totais. Listagem de interfaces de rede.          |
| **Processos**       | Listagem de processos em execução com opção de ordenação por uso de CPU ou memória. Permite filtrar e encerrar processos diretamente da interface. |
| **Serviços**        | Verificação do status dos principais serviços do sistema gerenciados pelo `systemd`.                                                             |
| **Logs**            | Visualização em tempo real das últimas linhas de log do sistema (`journalctl` ou `syslog`).                                                    |
| **Alertas**         | Sistema de alertas que notifica sobre uso elevado de CPU, memória ou disco, com thresholds pré-definidos.                                      |
| **Interface**       | Tema claro e escuro com persistência no navegador. Interface responsiva para acesso em desktops e dispositivos móveis.                           |
| **Autonomia**       | Totalmente offline. Não requer internet, não usa cookies e não depende de APIs externas. Todas as bibliotecas são locais ou empacotadas.        |

---

## Demonstração Rápida (Sem Instalação)

Para testar o SysTrack rapidamente sem instalá-lo como um serviço permanente no sistema, utilize o script `start.sh`. Ele instalará as dependências Python necessárias para o usuário atual e iniciará o servidor.

**Pré-requisitos:**
*   `python3`
*   `pip3`

**Passos:**

1.  Navegue até o diretório do projeto:
    ```bash
    cd /caminho/para/systrack
    ```

2.  Execute o script de inicialização:
    ```bash
    ./start.sh
    ```

3.  O script instalará as dependências (Flask, psutil, Gunicorn) se não estiverem presentes e iniciará o servidor na porta `9090`.

4.  Acesse a interface no seu navegador:
    **[http://SEU_IP_DO_SERVIDOR:9090](http://localhost:9090)**

5.  Para parar o servidor, pressione `Ctrl+C` no terminal.

---

## Instalação como Serviço (systemd)

O script `install.sh` automatiza a instalação completa do SysTrack como um serviço `systemd` no Ubuntu Server. Isso garante que o monitoramento inicie automaticamente com o sistema e seja executado em segundo plano de forma robusta.

**Pré-requisitos:**
*   Ubuntu Server (20.04 ou superior recomendado)
*   Acesso `root` ou `sudo`

**Passos:**

1.  Navegue até o diretório do projeto:
    ```bash
    cd /caminho/para/systrack
    ```

2.  Execute o script de instalação com `sudo`:
    ```bash
    sudo ./install.sh
    ```

**O que o script faz?**

1.  **Instala Dependências:** Atualiza o `apt` e instala `python3`, `pip3`, `venv` e `curl`.
2.  **Copia os Arquivos:** Move o projeto para `/opt/systrack`.
3.  **Cria um Ambiente Virtual:** Isola as dependências Python em `/opt/systrack/venv`.
4.  **Cria um Usuário de Serviço:** Adiciona um usuário de sistema `systrack` sem privilégios para executar a aplicação com segurança.
5.  **Configura o Serviço `systemd`:** Cria o arquivo `/etc/systemd/system/systrack.service` para gerenciar o processo com `gunicorn`.
6.  **Inicia e Habilita o Serviço:** Recarrega o `systemd`, habilita o SysTrack para iniciar no boot e inicia o serviço imediatamente.

Após a instalação, você pode gerenciar o serviço com os comandos `systemd` padrão:

*   **Verificar Status:** `sudo systemctl status systrack`
*   **Ver Logs:** `sudo journalctl -u systrack -f`
*   **Reiniciar:** `sudo systemctl restart systrack`
*   **Parar:** `sudo systemctl stop systrack`

---

## Arquitetura e Detalhes Técnicos

O SysTrack foi construído com simplicidade e eficiência em mente, utilizando uma stack de tecnologia mínima e comprovada.

### Stack Tecnológica

*   **Backend:** Python 3, Flask, Gunicorn
*   **Coleta de Métricas:** `psutil`
*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS)
*   **Gráficos:** Chart.js (biblioteca local)
*   **Comunicação Real-Time:** Server-Sent Events (SSE)

### Estrutura do Projeto

```
/systrack/
├── app.py                # Backend Flask: API, SSE e lógica principal
├── install.sh            # Script de instalação (systemd)
├── start.sh              # Script de inicialização rápida
├── README.md             # Esta documentação
├── requisitos.md         # Requisitos levantados na fase de análise
├── arquitetura.md        # Documento de design da arquitetura
├── static/               # Arquivos estáticos do frontend
│   ├── css/style.css     # Folha de estilos (com temas)
│   └── js/
│       ├── app.js        # Lógica do frontend (Vanilla JS)
│       └── chart.min.js  # Biblioteca Chart.js local
└── templates/
    └── index.html        # Estrutura HTML principal da interface
```

### Backend (Flask)

O coração do SysTrack é o `app.py`, uma aplicação Flask que desempenha três papéis:

1.  **Servir o Frontend:** Renderiza a página `index.html` e serve os arquivos estáticos (CSS, JS).
2.  **API RESTful:** Expõe uma série de endpoints (`/api/...`) que fornecem dados sob demanda para funcionalidades que não exigem atualização constante (ex: lista de partições de disco, informações do sistema).
3.  **Streaming de Dados:** Fornece um endpoint `/stream` que utiliza Server-Sent Events (SSE) para empurrar continuamente novas métricas para o frontend.

A coleta de dados do sistema é realizada primariamente pela biblioteca `psutil`, que oferece uma API multiplataforma para acessar informações de CPU, memória, disco, rede e processos com baixo overhead.

### Frontend (Vanilla JS)

O frontend é uma Single-Page Application (SPA) construída sem frameworks, utilizando apenas HTML, CSS e JavaScript puro ("Vanilla JS"). Isso resulta em um carregamento extremamente rápido e zero dependências de compilação.

*   **`index.html`**: Define a estrutura de toda a interface, incluindo a sidebar, o header e as seções de conteúdo para cada categoria de monitoramento.
*   **`static/css/style.css`**: Contém todos os estilos, utilizando variáveis CSS para permitir a troca de temas (claro/escuro) de forma eficiente.
*   **`static/js/app.js`**: Gerencia todo o estado da aplicação, a conexão SSE, a atualização da UI, a renderização dos gráficos com Chart.js e a navegação entre as seções.

### Comunicação em Tempo Real (Server-Sent Events)

Para as atualizações em tempo real, o SysTrack utiliza **Server-Sent Events (SSE)** em vez de WebSockets. SSE é uma tecnologia mais simples que estabelece uma conexão HTTP unidirecional e persistente, onde o servidor pode "empurrar" dados para o cliente a qualquer momento.

1.  O frontend (em `app.js`) usa a API nativa `EventSource` do navegador para se conectar ao endpoint `/stream` do backend.
2.  No backend (em `app.py`), o endpoint `/stream` inicia um loop que, a cada 2 segundos, coleta as métricas do sistema.
3.  As métricas são formatadas como uma string JSON e enviadas ao cliente no formato `data: {...}\n\n`.
4.  O frontend recebe o evento, decodifica o JSON e atualiza os elementos da DOM e os gráficos para refletir os novos dados.

Essa abordagem é ideal para o SysTrack, pois é mais leve que WebSockets e perfeitamente adequada para o fluxo de dados unidirecional (servidor para cliente) necessário para o monitoramento.

### Tema Claro e Escuro

A funcionalidade de tema é implementada de forma moderna e eficiente usando variáveis CSS.

1.  **Definição de Variáveis:** O arquivo `style.css` define dois conjuntos de variáveis de cor dentro dos seletores `:root` (padrão, escuro) e `[data-theme="light"]` (claro).

    ```css
    /* Tema Escuro (padrão) */
    :root {
      --bg-primary: #0f1117;
      --text-primary: #e2e8f0;
      /* ...outras cores */
    }

    /* Tema Claro */
    [data-theme="light"] {
      --bg-primary: #f0f4f8;
      --text-primary: #1e293b;
      /* ...outras cores */
    }
    ```

2.  **Uso das Variáveis:** Todos os componentes da UI usam essas variáveis (ex: `background-color: var(--bg-primary);`).

3.  **Troca de Tema:** Quando o usuário clica no botão de tema, o JavaScript (`app.js`) simplesmente alterna o atributo `data-theme` no elemento `<html>` entre `"dark"` e `"light"`. O navegador aplica instantaneamente o novo conjunto de variáveis CSS, mudando a aparência de todo o site.

4.  **Persistência:** A preferência de tema é salva no `localStorage` do navegador, garantindo que a escolha do usuário seja mantida entre as visitas.

---

## Bibliotecas e Dependências

O SysTrack mantém suas dependências ao mínimo para garantir leveza e facilidade de instalação.

### Backend (Python)

*   **Flask:** Um microframework web para criar o servidor e a API. É conhecido por sua simplicidade e extensibilidade.
*   **psutil:** A biblioteca principal para acessar informações do sistema e métricas de hardware de forma eficiente e multiplataforma.
*   **Gunicorn:** Um servidor WSGI HTTP para Python, usado na instalação como serviço para executar a aplicação Flask de forma robusta e performática em produção.

### Frontend (JavaScript)

*   **Chart.js:** Uma biblioteca poderosa e flexível para criar gráficos interativos e animados. A biblioteca é incluída localmente (`chart.min.js`) para garantir o funcionamento offline.

Todas as outras funcionalidades do frontend são implementadas com APIs padrão do navegador, sem a necessidade de bibliotecas ou frameworks adicionais.
