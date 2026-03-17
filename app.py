"""
SysTrack - Sistema de Monitoramento de Servidores
Backend principal em Flask com coleta de métricas via psutil.
Totalmente offline e local, sem autenticação.
"""

import json
import time
import platform
import socket
import subprocess
from collections import deque
from datetime import datetime, timedelta
from threading import Lock

import psutil
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# ─── Configurações ────────────────────────────────────────────────────────────
MAX_HISTORY = 60  # pontos de histórico mantidos em memória (1 por segundo)
UPDATE_INTERVAL = 2  # segundos entre cada coleta de métricas

# ─── Armazenamento de histórico em memória ────────────────────────────────────
history_lock = Lock()
history = {
    "cpu": deque(maxlen=MAX_HISTORY),
    "memory": deque(maxlen=MAX_HISTORY),
    "net_sent": deque(maxlen=MAX_HISTORY),
    "net_recv": deque(maxlen=MAX_HISTORY),
    "timestamps": deque(maxlen=MAX_HISTORY),
}

# Valores anteriores para calcular delta de rede
_prev_net = psutil.net_io_counters()
_prev_net_time = time.time()


# ─── Funções de coleta de métricas ────────────────────────────────────────────

def get_uptime():
    """Retorna o tempo de atividade do sistema formatado."""
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)
    td = timedelta(seconds=uptime_seconds)
    days = td.days
    hours, remainder = divmod(td.seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    parts.append(f"{seconds}s")
    return " ".join(parts)


def get_system_info():
    """Retorna informações gerais do sistema."""
    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = "N/A"

    try:
        ip_address = socket.gethostbyname(hostname)
    except Exception:
        ip_address = "127.0.0.1"

    uname = platform.uname()
    cpu_info = platform.processor() or uname.processor or "N/A"

    # Tenta obter o modelo da CPU de forma mais detalhada no Linux
    try:
        with open("/proc/cpuinfo", "r") as f:
            for line in f:
                if "model name" in line:
                    cpu_info = line.split(":")[1].strip()
                    break
    except Exception:
        pass

    return {
        "hostname": hostname,
        "ip": ip_address,
        "os": f"{uname.system} {uname.release}",
        "os_version": platform.version(),
        "kernel": uname.release,
        "arch": uname.machine,
        "cpu_model": cpu_info,
        "cpu_count_physical": psutil.cpu_count(logical=False) or 1,
        "cpu_count_logical": psutil.cpu_count(logical=True) or 1,
        "uptime": get_uptime(),
        "boot_time": datetime.fromtimestamp(psutil.boot_time()).strftime("%d/%m/%Y %H:%M:%S"),
        "python_version": platform.python_version(),
    }


def get_cpu_metrics():
    """Retorna métricas de CPU."""
    per_cpu = psutil.cpu_percent(percpu=True, interval=None)
    freq = psutil.cpu_freq()
    load_avg = [0, 0, 0]
    try:
        load_avg = [round(x, 2) for x in psutil.getloadavg()]
    except AttributeError:
        pass

    return {
        "percent": psutil.cpu_percent(interval=None),
        "per_cpu": per_cpu,
        "freq_current": round(freq.current, 0) if freq else 0,
        "freq_max": round(freq.max, 0) if freq else 0,
        "load_avg_1": load_avg[0],
        "load_avg_5": load_avg[1],
        "load_avg_15": load_avg[2],
        "count_logical": psutil.cpu_count(logical=True) or 1,
        "count_physical": psutil.cpu_count(logical=False) or 1,
    }


def get_memory_metrics():
    """Retorna métricas de memória RAM e Swap."""
    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()

    def fmt(b):
        return round(b / (1024 ** 3), 2)

    return {
        "ram_total": fmt(vm.total),
        "ram_used": fmt(vm.used),
        "ram_free": fmt(vm.available),
        "ram_percent": vm.percent,
        "ram_cached": fmt(getattr(vm, "cached", 0)),
        "ram_buffers": fmt(getattr(vm, "buffers", 0)),
        "swap_total": fmt(swap.total),
        "swap_used": fmt(swap.used),
        "swap_free": fmt(swap.free),
        "swap_percent": swap.percent,
    }


def get_disk_metrics():
    """Retorna métricas de disco para cada partição montada."""
    partitions = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            partitions.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": round(usage.total / (1024 ** 3), 2),
                "used": round(usage.used / (1024 ** 3), 2),
                "free": round(usage.free / (1024 ** 3), 2),
                "percent": usage.percent,
            })
        except (PermissionError, OSError):
            continue

    # I/O de disco
    disk_io = psutil.disk_io_counters()
    io_data = {}
    if disk_io:
        io_data = {
            "read_bytes": round(disk_io.read_bytes / (1024 ** 2), 2),
            "write_bytes": round(disk_io.write_bytes / (1024 ** 2), 2),
            "read_count": disk_io.read_count,
            "write_count": disk_io.write_count,
        }

    return {"partitions": partitions, "io": io_data}


def get_network_metrics():
    """Retorna métricas de rede com velocidade calculada."""
    global _prev_net, _prev_net_time

    current_net = psutil.net_io_counters()
    current_time = time.time()
    elapsed = current_time - _prev_net_time

    if elapsed > 0:
        sent_speed = (current_net.bytes_sent - _prev_net.bytes_sent) / elapsed
        recv_speed = (current_net.bytes_recv - _prev_net.bytes_recv) / elapsed
    else:
        sent_speed = 0
        recv_speed = 0

    _prev_net = current_net
    _prev_net_time = current_time

    # Interfaces de rede
    interfaces = []
    net_if_addrs = psutil.net_if_addrs()
    net_if_stats = psutil.net_if_stats()
    for iface, addrs in net_if_addrs.items():
        ipv4 = next((a.address for a in addrs if a.family == socket.AF_INET), "N/A")
        stats = net_if_stats.get(iface)
        interfaces.append({
            "name": iface,
            "ipv4": ipv4,
            "is_up": stats.isup if stats else False,
            "speed": stats.speed if stats else 0,
        })

    return {
        "bytes_sent": round(current_net.bytes_sent / (1024 ** 2), 2),
        "bytes_recv": round(current_net.bytes_recv / (1024 ** 2), 2),
        "packets_sent": current_net.packets_sent,
        "packets_recv": current_net.packets_recv,
        "sent_speed_kb": round(sent_speed / 1024, 2),
        "recv_speed_kb": round(recv_speed / 1024, 2),
        "interfaces": interfaces,
    }


def get_processes(limit=30, sort_by="cpu"):
    """Retorna uma lista dos processos mais ativos."""
    procs = []
    for proc in psutil.process_iter(
        ["pid", "name", "username", "status", "cpu_percent", "memory_percent", "create_time", "cmdline"]
    ):
        try:
            info = proc.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"] or "N/A",
                "user": info["username"] or "N/A",
                "status": info["status"] or "N/A",
                "cpu": round(info["cpu_percent"] or 0, 1),
                "mem": round(info["memory_percent"] or 0, 1),
                "started": datetime.fromtimestamp(info["create_time"]).strftime("%H:%M:%S")
                if info["create_time"] else "N/A",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    # Ordenar por CPU ou memória
    if sort_by == "mem":
        procs.sort(key=lambda x: x["mem"], reverse=True)
    else:
        procs.sort(key=lambda x: x["cpu"], reverse=True)

    return procs[:limit]


def get_services():
    """Retorna o status dos principais serviços systemd."""
    services_to_check = [
        "ssh", "sshd", "nginx", "apache2", "mysql", "postgresql",
        "docker", "ufw", "fail2ban", "cron", "rsyslog", "networking",
        "systemd-resolved", "snapd",
    ]
    results = []
    for svc in services_to_check:
        try:
            result = subprocess.run(
                ["systemctl", "is-active", svc],
                capture_output=True, text=True, timeout=2
            )
            status = result.stdout.strip()
            results.append({
                "name": svc,
                "status": status,
                "active": status == "active",
            })
        except (subprocess.TimeoutExpired, FileNotFoundError):
            results.append({"name": svc, "status": "unknown", "active": False})

    return [s for s in results if s["status"] != "inactive"]


def get_logs(lines=50):
    """Retorna as últimas linhas do log do sistema."""
    try:
        result = subprocess.run(
            ["journalctl", "-n", str(lines), "--no-pager", "-o", "short-iso"],
            capture_output=True, text=True, timeout=5
        )
        log_lines = result.stdout.strip().split("\n")
        return [line for line in log_lines if line]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        try:
            with open("/var/log/syslog", "r") as f:
                lines_data = f.readlines()
                return [l.strip() for l in lines_data[-lines:] if l.strip()]
        except Exception:
            return ["Logs não disponíveis neste ambiente."]


def collect_all_metrics():
    """Coleta todas as métricas de uma vez e atualiza o histórico."""
    cpu = get_cpu_metrics()
    mem = get_memory_metrics()
    net = get_network_metrics()

    timestamp = datetime.now().strftime("%H:%M:%S")

    with history_lock:
        history["cpu"].append(cpu["percent"])
        history["memory"].append(mem["ram_percent"])
        history["net_sent"].append(net["sent_speed_kb"])
        history["net_recv"].append(net["recv_speed_kb"])
        history["timestamps"].append(timestamp)

    return {
        "cpu": cpu,
        "memory": mem,
        "network": net,
        "timestamp": timestamp,
    }


# ─── Rotas da API ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve a página principal do dashboard."""
    return render_template("index.html")


@app.route("/api/system")
def api_system():
    """Retorna informações gerais do sistema."""
    return jsonify(get_system_info())


@app.route("/api/cpu")
def api_cpu():
    """Retorna métricas de CPU."""
    return jsonify(get_cpu_metrics())


@app.route("/api/memory")
def api_memory():
    """Retorna métricas de memória."""
    return jsonify(get_memory_metrics())


@app.route("/api/disk")
def api_disk():
    """Retorna métricas de disco."""
    return jsonify(get_disk_metrics())


@app.route("/api/network")
def api_network():
    """Retorna métricas de rede."""
    return jsonify(get_network_metrics())


@app.route("/api/processes")
def api_processes():
    """Retorna lista de processos."""
    sort_by = request.args.get("sort", "cpu")
    limit = int(request.args.get("limit", 30))
    return jsonify(get_processes(limit=limit, sort_by=sort_by))


@app.route("/api/process/kill/<int:pid>", methods=["POST"])
def api_kill_process(pid):
    """Encerra um processo pelo PID."""
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        return jsonify({"success": True, "message": f"Processo {pid} encerrado com sucesso."})
    except psutil.NoSuchProcess:
        return jsonify({"success": False, "message": f"Processo {pid} não encontrado."}), 404
    except psutil.AccessDenied:
        return jsonify({"success": False, "message": f"Acesso negado para encerrar o processo {pid}."}), 403
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/api/services")
def api_services():
    """Retorna o status dos serviços systemd."""
    return jsonify(get_services())


@app.route("/api/logs")
def api_logs():
    """Retorna os logs do sistema."""
    lines = int(request.args.get("lines", 50))
    return jsonify({"logs": get_logs(lines=lines)})


@app.route("/api/history")
def api_history():
    """Retorna o histórico de métricas."""
    with history_lock:
        return jsonify({
            "cpu": list(history["cpu"]),
            "memory": list(history["memory"]),
            "net_sent": list(history["net_sent"]),
            "net_recv": list(history["net_recv"]),
            "timestamps": list(history["timestamps"]),
        })


@app.route("/api/alerts")
def api_alerts():
    """Verifica e retorna alertas baseados em thresholds."""
    alerts = []
    cpu = get_cpu_metrics()
    mem = get_memory_metrics()
    disk = get_disk_metrics()

    if cpu["percent"] > 85:
        alerts.append({
            "type": "danger",
            "icon": "cpu",
            "message": f"CPU em uso elevado: {cpu['percent']}%",
        })
    elif cpu["percent"] > 70:
        alerts.append({
            "type": "warning",
            "icon": "cpu",
            "message": f"CPU com uso moderado: {cpu['percent']}%",
        })

    if mem["ram_percent"] > 90:
        alerts.append({
            "type": "danger",
            "icon": "memory",
            "message": f"Memória RAM crítica: {mem['ram_percent']}%",
        })
    elif mem["ram_percent"] > 75:
        alerts.append({
            "type": "warning",
            "icon": "memory",
            "message": f"Memória RAM elevada: {mem['ram_percent']}%",
        })

    for part in disk["partitions"]:
        if part["percent"] > 90:
            alerts.append({
                "type": "danger",
                "icon": "disk",
                "message": f"Disco {part['mountpoint']} crítico: {part['percent']}%",
            })
        elif part["percent"] > 80:
            alerts.append({
                "type": "warning",
                "icon": "disk",
                "message": f"Disco {part['mountpoint']} com uso elevado: {part['percent']}%",
            })

    return jsonify({"alerts": alerts, "count": len(alerts)})


@app.route("/stream")
def stream():
    """
    Server-Sent Events (SSE) endpoint.
    Transmite métricas em tempo real para o frontend.
    """
    def event_generator():
        # Inicializa a coleta de CPU (primeiro call é sempre 0)
        psutil.cpu_percent(interval=None)
        time.sleep(0.5)

        while True:
            try:
                metrics = collect_all_metrics()
                data = json.dumps(metrics)
                yield f"data: {data}\n\n"
                time.sleep(UPDATE_INTERVAL)
            except GeneratorExit:
                break
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                time.sleep(UPDATE_INTERVAL)

    return Response(
        event_generator(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─── Inicialização ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  SysTrack - Sistema de Monitoramento de Servidores")
    print("  Acesse: http://0.0.0.0:9090")
    print("=" * 60)
    # Pré-aquece o psutil para leituras de CPU mais precisas
    psutil.cpu_percent(interval=1)
    app.run(host="0.0.0.0", port=9090, debug=False, threaded=True)
