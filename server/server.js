import express from 'express';
import axios from 'axios';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3006);
const prometheusUrl = process.env.PROMETHEUS_URL || 'http://127.0.0.1:9090';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nodes = [
  { id: 'gateway', node: 'gateway', label: 'Gateway', ip: '192.168.8.1' },
  { id: 'aqn-node1', node: 'aqn-node1', label: 'aqn-node1', ip: '192.168.8.101' },
  { id: 'aqn-node2', node: 'aqn-node2', label: 'aqn-node2', ip: '192.168.8.102' },
  { id: 'aqn-node3', node: 'aqn-node3', label: 'aqn-node3', ip: '192.168.8.103' },
  { id: 'aqn-node4', node: 'aqn-node4', label: 'aqn-node4', ip: '192.168.8.104' },
  { id: 'aqn-node5', node: 'aqn-node5', label: 'aqn-node5', ip: '192.168.8.105' },
  { id: 'ergoquipt', node: 'ergoquipt', label: 'Ergoquipt', ip: '192.168.8.106' },
  { id: 'home', node: 'home', label: 'Home', ip: '192.168.8.127' },
];

async function queryPrometheus(query) {
  const response = await axios.get(`${prometheusUrl}/api/v1/query`, {
    params: { query },
    timeout: 8000,
  });

  return response.data?.data?.result ?? [];
}

function coerceMetricMap(results) {
  const metricMap = new Map();

  results.forEach((item) => {
    metricMap.set(item.metric.instance, Number(item.value?.[1] ?? 0));
  });

  return metricMap;
}

function serviceLinks(hostname) {
  const host = hostname || 'localhost';
  return {
    grafana: 'https://monitoring.inkubasistartupunhas.id/',
    prometheus: `http://${host}:9090`,
  };
}

function nodeState({ isUp, cpu, memory, temperature }) {
  if (!isUp) {
    return 'down';
  }

  if (cpu >= 75 || memory >= 85 || temperature >= 70) {
    return 'warn';
  }

  return 'up';
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/metrics', async (req, res) => {
  const serverNow = new Date();
  try {
    const [upResults, cpuResults, memoryResults, hwmonTempResults, thermalZoneTempResults] = await Promise.all([
      queryPrometheus('up{job="raspi-all"}'),
      queryPrometheus('100 - (avg by(instance) (rate(node_cpu_seconds_total{job="raspi-all",mode="idle"}[5m])) * 100)'),
      queryPrometheus('100 * (1 - (node_memory_MemAvailable_bytes{job="raspi-all"} / node_memory_MemTotal_bytes{job="raspi-all"}))'),
      queryPrometheus('max by(instance) (node_hwmon_temp_celsius{job="raspi-all"})'),
      queryPrometheus('max by(instance) (node_thermal_zone_temp{job="raspi-all"} / 1000)'),
    ]);

    const upMap = coerceMetricMap(upResults);
    const cpuMap = coerceMetricMap(cpuResults);
    const memoryMap = coerceMetricMap(memoryResults);
    const hwmonTempMap = coerceMetricMap(hwmonTempResults);
    const thermalZoneTempMap = coerceMetricMap(thermalZoneTempResults);

    const payload = nodes.map((node) => {
      const instance = `${node.ip}:9100`;
      const isUp = upMap.get(instance) === 1;
      const cpu = Number((cpuMap.get(instance) ?? 0).toFixed(1));
      const memory = Number((memoryMap.get(instance) ?? 0).toFixed(1));
      const tempMetric = hwmonTempMap.get(instance) ?? thermalZoneTempMap.get(instance) ?? null;
      const temperature = tempMetric === null ? null : Number(tempMetric.toFixed(1));
      const state = nodeState({ isUp, cpu, memory, temperature: temperature ?? 0 });

      return {
        ...node,
        status: isUp ? 'up' : 'down',
        state,
        cpu,
        memory,
        temperature,
        serviceUrl: `http://${node.ip}:9100`,
      };
    });

    res.json({
      generatedAt: serverNow.toISOString(),
      serverTimeUtc: serverNow.toISOString(),
      prometheusUrl,
      services: serviceLinks(req.hostname),
      nodes: payload,
      summary: {
        up: payload.filter((node) => node.status === 'up').length,
        warn: payload.filter((node) => node.state === 'warn').length,
        down: payload.filter((node) => node.status !== 'up').length,
      },
    });
  } catch (error) {
    res.status(502).json({
      error: 'prometheus_unavailable',
      message: error.message,
      generatedAt: serverNow.toISOString(),
      serverTimeUtc: serverNow.toISOString(),
      nodes: nodes.map((node) => ({
        ...node,
        status: 'down',
        state: 'down',
        cpu: 0,
        memory: 0,
        temperature: null,
        serviceUrl: `http://${node.ip}:9100`,
      })),
    });
  }
});

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`homelab-3d-dashboard backend listening on ${port}`);
});
