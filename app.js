/**
 * SysTrack — JavaScript Principal do Dashboard
 * Gerencia SSE, gráficos, navegação e todas as interações da UI.
 */

"use strict";

// ─── Estado Global ────────────────────────────────────────────────────────────
const state = {
  currentSection: "dashboard",
  theme: localStorage.getItem("systrack-theme") || "dark",
  procSort: "cpu",
  procData: [],
  eventSource: null,
  charts: {},
  history: { cpu: [], memory: [], net_sent: [], net_recv: [], timestamps: [] },
  killPid: null,
  sysInfo: null,
};

// ─── Configuração de Gráficos ─────────────────────────────────────────────────
const CHART_DEFAULTS = {
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(30,34,53,0.95)",
      titleColor: "#94a3b8",
      bodyColor: "#e2e8f0",
      borderColor: "#2d3748",
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.04)" },
      ticks: { color: "#64748b", maxTicksLimit: 6, font: { size: 10 } },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.04)" },
      ticks: { color: "#64748b", font: { size: 10 } },
      min: 0,
    },
  },
};

function getChartDefaults() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
  const tickColor = isDark ? "#64748b" : "#94a3b8";
  const tooltipBg = isDark ? "rgba(30,34,53,0.95)" : "rgba(15,23,42,0.9)";
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: "#94a3b8",
        bodyColor: "#e2e8f0",
        borderColor: "#2d3748",
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: tickColor, maxTicksLimit: 6, font: { size: 10 } },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 } },
        min: 0,
      },
    },
  };
}

// ─── Inicialização ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.theme);
  initCharts();
  loadInitialData();
  connectSSE();
  startClock();
  // Atualiza processos e serviços periodicamente
  setInterval(loadProcesses, 10000);
  setInterval(loadAlerts, 15000);
});

// ─── Relógio ──────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const el = document.getElementById("headerTime");
    if (el) el.textContent = now.toLocaleTimeString("pt-BR");
  }
  tick();
  setInterval(tick, 1000);
}

// ─── Tema ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("systrack-theme", state.theme);
  applyTheme(state.theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  if (label) label.textContent = theme === "dark" ? "Claro" : "Escuro";
  // Atualiza cores dos gráficos
  Object.values(state.charts).forEach((chart) => {
    if (!chart) return;
    const d = getChartDefaults();
    chart.options.scales.x.grid.color = d.scales.x.grid.color;
    chart.options.scales.x.ticks.color = d.scales.x.ticks.color;
    chart.options.scales.y.grid.color = d.scales.y.grid.color;
    chart.options.scales.y.ticks.color = d.scales.y.ticks.color;
    chart.update("none");
  });
}

// ─── Navegação ────────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: ["Dashboard", "Visão geral do sistema"],
  cpu: ["CPU", "Processador e carga do sistema"],
  memory: ["Memória", "RAM e Swap"],
  disk: ["Disco", "Partições e I/O"],
  network: ["Rede", "Tráfego e interfaces"],
  processes: ["Processos", "Gerenciamento de processos"],
  services: ["Serviços", "Serviços do sistema (systemd)"],
  logs: ["Logs", "Registros do sistema"],
  sysinfo: ["Informações", "Detalhes do hardware e sistema operacional"],
  alerts: ["Alertas", "Monitoramento de thresholds"],
};

function navigate(section, el) {
  // Esconde seção atual
  document.getElementById(`section-${state.currentSection}`)?.classList.remove("active");
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));

  state.currentSection = section;
  document.getElementById(`section-${section}`)?.classList.add("active");
  el.classList.add("active");

  const [title, subtitle] = PAGE_TITLES[section] || [section, ""];
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;

  closeSidebar();

  // Carrega dados específicos da seção
  if (section === "processes") loadProcesses();
  if (section === "services") loadServices();
  if (section === "logs") loadLogs();
  if (section === "disk") loadDisk();
  if (section === "sysinfo") loadSysInfo();
  if (section === "alerts") loadAlerts();
}

// ─── Sidebar Mobile ───────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}

// ─── SSE — Server-Sent Events ─────────────────────────────────────────────────
function connectSSE() {
  if (state.eventSource) state.eventSource.close();

  state.eventSource = new EventSource("/stream");

  state.eventSource.onopen = () => {
    setConnectionStatus(true);
  };

  state.eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) return;
      updateDashboard(data);
    } catch (e) {
      console.error("SSE parse error:", e);
    }
  };

  state.eventSource.onerror = () => {
    setConnectionStatus(false);
    setTimeout(connectSSE, 5000);
  };
}

function setConnectionStatus(connected) {
  const dot = document.getElementById("connDot");
  const status = document.getElementById("connStatus");
  const statusDot = document.getElementById("statusDot");
  if (dot) dot.className = `connection-dot${connected ? "" : " disconnected"}`;
  if (status) status.textContent = connected ? "Conectado" : "Reconectando...";
  if (statusDot) statusDot.style.background = connected ? "var(--accent-green)" : "var(--accent-red)";
}

// ─── Atualização do Dashboard ─────────────────────────────────────────────────
function updateDashboard(data) {
  const { cpu, memory, network, timestamp } = data;

  // Atualiza histórico local
  state.history.cpu.push(cpu.percent);
  state.history.memory.push(memory.ram_percent);
  state.history.net_sent.push(network.sent_speed_kb);
  state.history.net_recv.push(network.recv_speed_kb);
  state.history.timestamps.push(timestamp);

  const MAX = 60;
  Object.keys(state.history).forEach((k) => {
    if (state.history[k].length > MAX) state.history[k].shift();
  });

  // ── Métricas do Dashboard ──
  setText("dash-cpu-val", `${cpu.percent.toFixed(1)}%`);
  setText("dash-cpu-sub", `${cpu.count_logical} núcleos lógicos`);
  setText("dash-mem-val", `${memory.ram_percent.toFixed(1)}%`);
  setText("dash-mem-sub", `${memory.ram_used} / ${memory.ram_total} GB`);
  setText("dash-net-recv", `${network.recv_speed_kb.toFixed(1)} KB/s`);
  setText("dash-net-sent", `↑ ${network.sent_speed_kb.toFixed(1)} KB/s`);

  // ── Gráficos do Dashboard ──
  updateLineChart(state.charts.cpu, state.history.timestamps, state.history.cpu);
  updateLineChart(state.charts.mem, state.history.timestamps, state.history.memory);
  updateNetChart(state.history.timestamps, state.history.net_sent, state.history.net_recv);

  setText("chart-cpu-val", `${cpu.percent.toFixed(1)}%`);
  setText("chart-mem-val", `${memory.ram_percent.toFixed(1)}%`);

  // ── Load Average ──
  if (state.charts.load) {
    const la = [cpu.load_avg_1, cpu.load_avg_5, cpu.load_avg_15];
    state.charts.load.data.datasets[0].data = la;
    state.charts.load.update("none");
  }

  // ── CPU Detail ──
  if (state.currentSection === "cpu") {
    updateCpuSection(cpu);
  }

  // ── Memory Detail ──
  if (state.currentSection === "memory") {
    updateMemorySection(memory);
  }

  // ── Network Detail ──
  if (state.currentSection === "network") {
    updateNetworkSection(network);
  }

  // ── Alertas no Dashboard ──
  checkDashAlerts(cpu, memory);
}

function updateCpuSection(cpu) {
  setText("cpu-total-val", `${cpu.percent.toFixed(1)}%`);
  const bar = document.getElementById("cpu-total-bar");
  if (bar) {
    bar.style.width = `${cpu.percent}%`;
    bar.className = `progress-fill ${getColorClass(cpu.percent)}`;
  }
  updateLineChart(state.charts.cpuDetail, state.history.timestamps, state.history.cpu);

  // Núcleos
  const grid = document.getElementById("cpu-cores-grid");
  if (grid && cpu.per_cpu) {
    grid.innerHTML = cpu.per_cpu
      .map(
        (val, i) => `
      <div class="core-item">
        <div class="core-label">Núcleo ${i}</div>
        <div class="core-value" style="color:${getColorHex(val)}">${val.toFixed(1)}%</div>
        <div class="progress-bar" style="margin-top:4px;">
          <div class="progress-fill ${getColorClass(val)}" style="width:${val}%"></div>
        </div>
      </div>`
      )
      .join("");
  }
}

function updateMemorySection(memory) {
  setText("mem-percent-val", `${memory.ram_percent.toFixed(1)}%`);
  setText("mem-used-label", `${memory.ram_used} GB usados de ${memory.ram_total} GB`);
  const memBar = document.getElementById("mem-bar");
  if (memBar) {
    memBar.style.width = `${memory.ram_percent}%`;
    memBar.className = `progress-fill ${getColorClass(memory.ram_percent)}`;
  }
  updateLineChart(state.charts.memDetail, state.history.timestamps, state.history.memory);

  setText("swap-percent-val", `${memory.swap_percent.toFixed(1)}%`);
  setText("swap-used-label", `${memory.swap_used} GB usados de ${memory.swap_total} GB`);
  const swapBar = document.getElementById("swap-bar");
  if (swapBar) swapBar.style.width = `${memory.swap_percent}%`;

  const detailList = document.getElementById("mem-details-list");
  if (detailList) {
    detailList.innerHTML = `
      <div class="info-grid">
        ${infoItem("RAM Total", `${memory.ram_total} GB`)}
        ${infoItem("RAM Usada", `${memory.ram_used} GB`)}
        ${infoItem("RAM Livre", `${memory.ram_free} GB`)}
        ${infoItem("Cache", `${memory.ram_cached} GB`)}
        ${infoItem("Buffers", `${memory.ram_buffers} GB`)}
        ${infoItem("Swap Total", `${memory.swap_total} GB`)}
        ${infoItem("Swap Usada", `${memory.swap_used} GB`)}
        ${infoItem("Swap Livre", `${memory.swap_free} GB`)}
      </div>`;
  }
}

function updateNetworkSection(network) {
  setText("net-recv-speed", `${network.recv_speed_kb.toFixed(1)} KB/s`);
  setText("net-sent-speed", `${network.sent_speed_kb.toFixed(1)} KB/s`);
  setText("net-recv-total", `Total: ${network.bytes_recv} MB`);
  setText("net-sent-total", `Total: ${network.bytes_sent} MB`);
  setText("net-pkts-recv", network.packets_recv?.toLocaleString() || "--");
  setText("net-pkts-sent", `Enviados: ${network.packets_sent?.toLocaleString() || "--"}`);

  if (state.charts.netDetail) {
    updateNetChart2(state.charts.netDetail, state.history.timestamps, state.history.net_sent, state.history.net_recv);
  }

  const ifaceGrid = document.getElementById("iface-grid");
  if (ifaceGrid && network.interfaces) {
    ifaceGrid.innerHTML = network.interfaces
      .map(
        (iface) => `
      <div class="iface-card">
        <div class="iface-header">
          <span class="iface-name">${iface.name}</span>
          <span class="badge ${iface.is_up ? "green" : "red"}">${iface.is_up ? "UP" : "DOWN"}</span>
        </div>
        <div class="iface-ip">${iface.ipv4}</div>
        ${iface.speed ? `<div class="text-muted text-sm" style="margin-top:4px;">${iface.speed} Mbps</div>` : ""}
      </div>`
      )
      .join("");
  }
}

// ─── Alertas do Dashboard ─────────────────────────────────────────────────────
function checkDashAlerts(cpu, memory) {
  const container = document.getElementById("dashAlerts");
  if (!container) return;

  const alerts = [];
  if (cpu.percent > 85) alerts.push({ type: "danger", msg: `⚠️ CPU crítica: ${cpu.percent.toFixed(1)}%` });
  else if (cpu.percent > 70) alerts.push({ type: "warning", msg: `⚠️ CPU elevada: ${cpu.percent.toFixed(1)}%` });

  if (memory.ram_percent > 90) alerts.push({ type: "danger", msg: `⚠️ Memória crítica: ${memory.ram_percent.toFixed(1)}%` });
  else if (memory.ram_percent > 75) alerts.push({ type: "warning", msg: `⚠️ Memória elevada: ${memory.ram_percent.toFixed(1)}%` });

  // Atualiza badge
  const badge = document.getElementById("alertBadge");
  if (badge) {
    if (alerts.length > 0) {
      badge.textContent = alerts.length;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }

  if (alerts.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = alerts
    .map((a) => `<div class="alert-item ${a.type}">${a.msg}</div>`)
    .join("");
}

// ─── Carregamento de Dados Iniciais ──────────────────────────────────────────
async function loadInitialData() {
  try {
    const [sysRes, histRes, diskRes] = await Promise.all([
      fetch("/api/system"),
      fetch("/api/history"),
      fetch("/api/disk"),
    ]);

    const sys = await sysRes.json();
    state.sysInfo = sys;

    // Sidebar
    setText("sidebarHostname", sys.hostname);
    setText("sidebarUptime", `uptime: ${sys.uptime}`);
    setText("dash-uptime", sys.uptime);
    setText("dash-boot", `boot: ${sys.boot_time}`);

    // CPU info
    const cpuInfoList = document.getElementById("cpu-info-list");
    if (cpuInfoList) {
      cpuInfoList.innerHTML = `
        <div class="info-grid">
          ${infoItem("Modelo", sys.cpu_model)}
          ${infoItem("Núcleos Físicos", sys.cpu_count_physical)}
          ${infoItem("Núcleos Lógicos", sys.cpu_count_logical)}
          ${infoItem("Sistema", sys.os)}
          ${infoItem("Kernel", sys.kernel)}
          ${infoItem("Arquitetura", sys.arch)}
        </div>`;
    }

    // Histórico
    const hist = await histRes.json();
    state.history = {
      cpu: hist.cpu || [],
      memory: hist.memory || [],
      net_sent: hist.net_sent || [],
      net_recv: hist.net_recv || [],
      timestamps: hist.timestamps || [],
    };

    // Disco
    const disk = await diskRes.json();
    updateDiskSection(disk);

    const mainDisk = disk.partitions?.[0];
    if (mainDisk) {
      setText("dash-disk-val", `${mainDisk.percent}%`);
      setText("dash-disk-sub", `${mainDisk.used} / ${mainDisk.total} GB`);
    }

    // Processos (contagem)
    const procRes = await fetch("/api/processes?limit=5");
    const procs = await procRes.json();
    setText("dash-procs", procs.length > 0 ? "Ativo" : "--");

    // Conta total de processos
    const allProcs = await fetch("/api/processes?limit=500");
    const allProcsData = await allProcs.json();
    setText("dash-procs", allProcsData.length);

  } catch (e) {
    console.error("Erro ao carregar dados iniciais:", e);
  }
}

// ─── Carregamento de Processos ────────────────────────────────────────────────
let procSortBy = "cpu";

async function loadProcesses() {
  try {
    const res = await fetch(`/api/processes?sort=${procSortBy}&limit=50`);
    state.procData = await res.json();
    renderProcesses(state.procData);
  } catch (e) {
    console.error("Erro ao carregar processos:", e);
  }
}

function setSortProc(by) {
  procSortBy = by;
  document.getElementById("sortCpuBtn").className = `btn btn-sm ${by === "cpu" ? "btn-primary" : "btn-ghost"}`;
  document.getElementById("sortMemBtn").className = `btn btn-sm ${by === "mem" ? "btn-primary" : "btn-ghost"}`;
  loadProcesses();
}

function filterProcesses() {
  const query = document.getElementById("procSearch")?.value.toLowerCase() || "";
  const filtered = state.procData.filter(
    (p) => p.name.toLowerCase().includes(query) || String(p.pid).includes(query)
  );
  renderProcesses(filtered);
}

function renderProcesses(procs) {
  const tbody = document.getElementById("procTbody");
  if (!tbody) return;

  if (procs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum processo encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = procs
    .map(
      (p) => `
    <tr>
      <td><span class="badge blue">${p.pid}</span></td>
      <td title="${p.name}">${p.name}</td>
      <td>${p.user}</td>
      <td><span class="badge ${p.status === "running" ? "green" : "gray"}">${p.status}</span></td>
      <td style="color:${getColorHex(p.cpu)}">${p.cpu.toFixed(1)}%</td>
      <td style="color:${getColorHex(p.mem)}">${p.mem.toFixed(1)}%</td>
      <td>${p.started}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="confirmKill(${p.pid}, '${escapeHtml(p.name)}')">
          ✕ Encerrar
        </button>
      </td>
    </tr>`
    )
    .join("");
}

// ─── Matar Processo ───────────────────────────────────────────────────────────
function confirmKill(pid, name) {
  state.killPid = pid;
  document.getElementById("killModalBody").textContent =
    `Deseja realmente encerrar o processo "${name}" (PID: ${pid})?`;
  document.getElementById("confirmKillBtn").onclick = () => killProcess(pid);
  document.getElementById("killModal").classList.add("open");
}

function closeModal() {
  document.getElementById("killModal").classList.remove("open");
  state.killPid = null;
}

async function killProcess(pid) {
  closeModal();
  try {
    const res = await fetch(`/api/process/kill/${pid}`, { method: "POST" });
    const data = await res.json();
    showToast(data.success ? "success" : "error", data.message);
    if (data.success) setTimeout(loadProcesses, 1000);
  } catch (e) {
    showToast("error", "Erro ao encerrar processo.");
  }
}

// ─── Serviços ─────────────────────────────────────────────────────────────────
async function loadServices() {
  const grid = document.getElementById("services-grid");
  if (!grid) return;
  grid.innerHTML = `<div class="text-muted text-sm">Carregando serviços...</div>`;

  try {
    const res = await fetch("/api/services");
    const services = await res.json();

    if (services.length === 0) {
      grid.innerHTML = `<div class="text-muted text-sm">Nenhum serviço encontrado.</div>`;
      return;
    }

    grid.innerHTML = services
      .map(
        (s) => `
      <div class="service-card">
        <div class="service-dot ${s.active ? "active" : s.status === "unknown" ? "unknown" : "inactive"}"></div>
        <div>
          <div class="service-name">${s.name}</div>
          <div class="service-status">${s.status}</div>
        </div>
      </div>`
      )
      .join("");
  } catch (e) {
    grid.innerHTML = `<div class="text-muted text-sm">Erro ao carregar serviços.</div>`;
  }
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
async function loadLogs() {
  const container = document.getElementById("log-container");
  if (!container) return;
  container.innerHTML = `<div class="text-muted text-sm">Carregando logs...</div>`;

  try {
    const lines = document.getElementById("logLines")?.value || 50;
    const res = await fetch(`/api/logs?lines=${lines}`);
    const data = await res.json();

    if (!data.logs || data.logs.length === 0) {
      container.innerHTML = `<div class="text-muted text-sm">Nenhum log disponível.</div>`;
      return;
    }

    container.innerHTML = data.logs
      .map((line) => `<div class="log-line">${escapeHtml(line)}</div>`)
      .join("");
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    container.innerHTML = `<div class="text-muted text-sm">Erro ao carregar logs.</div>`;
  }
}

// ─── Disco ────────────────────────────────────────────────────────────────────
async function loadDisk() {
  try {
    const res = await fetch("/api/disk");
    const disk = await res.json();
    updateDiskSection(disk);
  } catch (e) {
    console.error("Erro ao carregar disco:", e);
  }
}

function updateDiskSection(disk) {
  const list = document.getElementById("disk-partitions-list");
  if (list && disk.partitions) {
    list.innerHTML = disk.partitions
      .map(
        (p) => `
      <div class="disk-partition">
        <div class="disk-partition-header">
          <div>
            <div class="disk-mount">${p.mountpoint}</div>
            <div class="disk-device">${p.device} — ${p.fstype}</div>
          </div>
          <span class="badge ${p.percent > 90 ? "red" : p.percent > 80 ? "yellow" : "green"}">${p.percent}%</span>
        </div>
        <div class="progress-bar" style="height:8px;">
          <div class="progress-fill ${getColorClass(p.percent)}" style="width:${p.percent}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.7rem;color:var(--text-muted);">
          <span>Usado: ${p.used} GB</span>
          <span>Livre: ${p.free} GB</span>
          <span>Total: ${p.total} GB</span>
        </div>
      </div>`
      )
      .join("");
  }

  const ioInfo = document.getElementById("disk-io-info");
  if (ioInfo && disk.io) {
    ioInfo.innerHTML = `
      <div class="info-grid">
        ${infoItem("Leituras (MB)", disk.io.read_bytes)}
        ${infoItem("Escritas (MB)", disk.io.write_bytes)}
        ${infoItem("Operações de Leitura", disk.io.read_count?.toLocaleString())}
        ${infoItem("Operações de Escrita", disk.io.write_count?.toLocaleString())}
      </div>`;
  }
}

// ─── Informações do Sistema ───────────────────────────────────────────────────
async function loadSysInfo() {
  const grid = document.getElementById("sysinfo-grid");
  if (!grid) return;

  try {
    const res = await fetch("/api/system");
    const sys = await res.json();
    state.sysInfo = sys;

    setText("sidebarHostname", sys.hostname);
    setText("sidebarUptime", `uptime: ${sys.uptime}`);
    setText("dash-uptime", sys.uptime);
    setText("dash-boot", `boot: ${sys.boot_time}`);

    grid.innerHTML = `
      ${infoItem("Hostname", sys.hostname)}
      ${infoItem("Endereço IP", sys.ip)}
      ${infoItem("Sistema Operacional", sys.os)}
      ${infoItem("Versão do Kernel", sys.kernel)}
      ${infoItem("Arquitetura", sys.arch)}
      ${infoItem("Modelo da CPU", sys.cpu_model)}
      ${infoItem("Núcleos Físicos", sys.cpu_count_physical)}
      ${infoItem("Núcleos Lógicos (Threads)", sys.cpu_count_logical)}
      ${infoItem("Uptime", sys.uptime)}
      ${infoItem("Inicializado em", sys.boot_time)}
      ${infoItem("Versão do Python", sys.python_version)}
    `;
  } catch (e) {
    grid.innerHTML = `<div class="text-muted text-sm">Erro ao carregar informações do sistema.</div>`;
  }
}

// ─── Alertas ──────────────────────────────────────────────────────────────────
async function loadAlerts() {
  const list = document.getElementById("alerts-list");
  if (!list) return;

  try {
    const res = await fetch("/api/alerts");
    const data = await res.json();

    const badge = document.getElementById("alertBadge");
    if (badge) {
      if (data.count > 0) {
        badge.textContent = data.count;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    }

    if (data.alerts.length === 0) {
      list.innerHTML = `<div class="alert-item success">✅ Todos os recursos estão dentro dos limites normais.</div>`;
      return;
    }

    list.innerHTML = data.alerts
      .map((a) => `<div class="alert-item ${a.type}">
        <span>${a.type === "danger" ? "🔴" : "🟡"}</span>
        <span>${a.message}</span>
      </div>`)
      .join("");
  } catch (e) {
    if (list) list.innerHTML = `<div class="text-muted text-sm">Erro ao verificar alertas.</div>`;
  }
}

// ─── Inicialização dos Gráficos ───────────────────────────────────────────────
function initCharts() {
  const d = getChartDefaults();

  // Gráfico de CPU (Dashboard)
  state.charts.cpu = new Chart(document.getElementById("cpuChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: { ...d, scales: { ...d.scales, y: { ...d.scales.y, max: 100, ticks: { ...d.scales.y.ticks, callback: (v) => `${v}%` } } } },
  });

  // Gráfico de Memória (Dashboard)
  state.charts.mem = new Chart(document.getElementById("memChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: { ...d, scales: { ...d.scales, y: { ...d.scales.y, max: 100, ticks: { ...d.scales.y.ticks, callback: (v) => `${v}%` } } } },
  });

  // Gráfico de Rede (Dashboard)
  state.charts.net = new Chart(document.getElementById("netChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Download",
          data: [],
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6,182,212,0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "Upload",
          data: [],
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.05)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...d,
      plugins: { ...d.plugins, legend: { display: true, labels: { color: "#94a3b8", font: { size: 10 } } } },
      scales: { ...d.scales, y: { ...d.scales.y, ticks: { ...d.scales.y.ticks, callback: (v) => `${v} KB/s` } } },
    },
  });

  // Gráfico de Load Average
  state.charts.load = new Chart(document.getElementById("loadChart"), {
    type: "bar",
    data: {
      labels: ["1 min", "5 min", "15 min"],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: ["rgba(59,130,246,0.7)", "rgba(139,92,246,0.7)", "rgba(6,182,212,0.7)"],
        borderRadius: 6,
      }],
    },
    options: {
      ...d,
      scales: {
        ...d.scales,
        y: { ...d.scales.y, ticks: { ...d.scales.y.ticks } },
      },
    },
  });

  // Gráfico de CPU (Seção CPU)
  const cpuDetailEl = document.getElementById("cpuDetailChart");
  if (cpuDetailEl) {
    state.charts.cpuDetail = new Chart(cpuDetailEl, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: { ...d, scales: { ...d.scales, y: { ...d.scales.y, max: 100, ticks: { ...d.scales.y.ticks, callback: (v) => `${v}%` } } } },
    });
  }

  // Gráfico de Memória (Seção Memória)
  const memDetailEl = document.getElementById("memDetailChart");
  if (memDetailEl) {
    state.charts.memDetail = new Chart(memDetailEl, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: { ...d, scales: { ...d.scales, y: { ...d.scales.y, max: 100, ticks: { ...d.scales.y.ticks, callback: (v) => `${v}%` } } } },
    });
  }

  // Gráfico de Rede (Seção Rede)
  const netDetailEl = document.getElementById("netDetailChart");
  if (netDetailEl) {
    state.charts.netDetail = new Chart(netDetailEl, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Download",
            data: [],
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6,182,212,0.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "Upload",
            data: [],
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.05)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        ...d,
        plugins: { ...d.plugins, legend: { display: true, labels: { color: "#94a3b8", font: { size: 10 } } } },
        scales: { ...d.scales, y: { ...d.scales.y, ticks: { ...d.scales.y.ticks, callback: (v) => `${v} KB/s` } } },
      },
    });
  }
}

// ─── Helpers de Gráfico ───────────────────────────────────────────────────────
function updateLineChart(chart, labels, data) {
  if (!chart) return;
  chart.data.labels = [...labels];
  chart.data.datasets[0].data = [...data];
  chart.update("none");
}

function updateNetChart(labels, sent, recv) {
  const chart = state.charts.net;
  if (!chart) return;
  chart.data.labels = [...labels];
  chart.data.datasets[0].data = [...recv];
  chart.data.datasets[1].data = [...sent];
  chart.update("none");
}

function updateNetChart2(chart, labels, sent, recv) {
  if (!chart) return;
  chart.data.labels = [...labels];
  chart.data.datasets[0].data = [...recv];
  chart.data.datasets[1].data = [...sent];
  chart.update("none");
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "--";
}

function infoItem(key, value) {
  return `
    <div class="info-item">
      <div class="info-key">${key}</div>
      <div class="info-val">${value ?? "N/A"}</div>
    </div>`;
}

function getColorClass(val) {
  if (val >= 90) return "red";
  if (val >= 75) return "yellow";
  return "green";
}

function getColorHex(val) {
  if (val >= 90) return "var(--accent-red)";
  if (val >= 75) return "var(--accent-yellow)";
  return "var(--accent-green)";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(type, message, duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Fecha modal ao clicar fora
document.getElementById("killModal")?.addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});
