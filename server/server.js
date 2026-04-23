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
  { id: 'mtc-core-router', node: 'mtc-core-router', label: 'MTC Core Router', ip: '192.168.8.1', kind: 'core', source: 'mikrotik', role: 'network', type: 'core' },
  { id: 'aqn-node1', node: 'aqn-node1', label: 'aqn-node1', ip: '192.168.8.101', kind: 'monitoring', source: 'raspi', role: 'monitoring', type: 'compute' },
  { id: 'aqn-node2', node: 'aqn-node2', label: 'aqn-node2', ip: '192.168.8.102', kind: 'cluster', source: 'raspi', role: 'cluster', type: 'compute' },
  { id: 'aqn-node3', node: 'aqn-node3', label: 'aqn-node3', ip: '192.168.8.103', kind: 'cluster', source: 'raspi', role: 'cluster', type: 'compute' },
  { id: 'aqn-node4', node: 'aqn-node4', label: 'aqn-node4', ip: '192.168.8.104', kind: 'cluster', source: 'raspi', role: 'cluster', type: 'compute' },
  { id: 'aqn-node5', node: 'aqn-node5', label: 'aqn-node5', ip: '192.168.8.105', kind: 'cluster', source: 'raspi', role: 'cluster', type: 'compute' },
  { id: 'ergoquipt', node: 'ergoquipt', label: 'Ergoquipt', ip: '192.168.8.106', kind: 'edge', source: 'raspi', role: 'edge', type: 'compute' },
  { id: 'home', node: 'home', label: 'Home', ip: '192.168.8.127', kind: 'edge', source: 'raspi', role: 'edge', type: 'compute' },
  { id: 'aerasea', node: 'aerasea', label: 'Aerasea', ip: '192.168.8.95', kind: 'edge', source: 'raspi', role: 'edge', type: 'compute' },
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

function metricValue(results, selector = () => true) {
  const item = results.find((entry) => selector(entry.metric ?? {}));
  if (!item) {
    return null;
  }

  return Number(item.value?.[1] ?? 0);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/metrics', async (req, res) => {
  const serverNow = new Date();
  try {
    const [
      raspiUpResults,
      cpuResults,
      memoryResults,
      hwmonTempResults,
      thermalZoneTempResults,
      mikrotikUpResults,
      mikrotikCpuResults,
      mikrotikFreeMemoryResults,
      mikrotikTotalMemoryResults,
      mikrotikTempResults,
    ] = await Promise.all([
      queryPrometheus('up{job="raspi-all"}'),
      queryPrometheus('100 - (avg by(instance) (rate(node_cpu_seconds_total{job="raspi-all",mode="idle"}[5m])) * 100)'),
      queryPrometheus('100 * (1 - (node_memory_MemAvailable_bytes{job="raspi-all"} / node_memory_MemTotal_bytes{job="raspi-all"}))'),
      queryPrometheus('max by(instance) (node_hwmon_temp_celsius{job="raspi-all"})'),
      queryPrometheus('max by(instance) (node_thermal_zone_temp{job="raspi-all"} / 1000)'),
      queryPrometheus('up{job="mikrotik"}'),
      queryPrometheus('mktxp_system_cpu_load{job="mikrotik",routerboard_name="mtc-core-router"}'),
      queryPrometheus('mktxp_system_free_memory{job="mikrotik",routerboard_name="mtc-core-router"}'),
      queryPrometheus('mktxp_system_total_memory{job="mikrotik",routerboard_name="mtc-core-router"}'),
      queryPrometheus('mktxp_system_cpu_temperature{job="mikrotik",routerboard_name="mtc-core-router"}'),
    ]);

    const upMap = coerceMetricMap(raspiUpResults);
    const cpuMap = coerceMetricMap(cpuResults);
    const memoryMap = coerceMetricMap(memoryResults);
    const hwmonTempMap = coerceMetricMap(hwmonTempResults);
    const thermalZoneTempMap = coerceMetricMap(thermalZoneTempResults);
    const mikrotikUp = metricValue(mikrotikUpResults, (metric) => metric.instance === 'localhost:9436') === 1;
    const mikrotikCpu = metricValue(mikrotikCpuResults, (metric) => metric.routerboard_name === 'mtc-core-router') ?? 0;
    const mikrotikFreeMemory = metricValue(mikrotikFreeMemoryResults, (metric) => metric.routerboard_name === 'mtc-core-router');
    const mikrotikTotalMemory = metricValue(mikrotikTotalMemoryResults, (metric) => metric.routerboard_name === 'mtc-core-router');
    const mikrotikMemory = mikrotikFreeMemory !== null && mikrotikTotalMemory
      ? 100 * (1 - (mikrotikFreeMemory / mikrotikTotalMemory))
      : 0;
    const mikrotikTemperature = metricValue(mikrotikTempResults, (metric) => metric.routerboard_name === 'mtc-core-router');

    const payload = nodes.map((node) => {
      let isUp;
      let cpu;
      let memory;
      let temperature;
      let serviceUrl;

      if (node.source === 'mikrotik') {
        isUp = mikrotikUp;
        cpu = Number(mikrotikCpu.toFixed(1));
        memory = Number(mikrotikMemory.toFixed(1));
        temperature = mikrotikTemperature === null ? null : Number(mikrotikTemperature.toFixed(1));
        serviceUrl = `http://${node.ip}`;
      } else {
        const instance = `${node.ip}:9100`;
        isUp = upMap.get(instance) === 1;
        cpu = Number((cpuMap.get(instance) ?? 0).toFixed(1));
        memory = Number((memoryMap.get(instance) ?? 0).toFixed(1));
        const tempMetric = hwmonTempMap.get(instance) ?? thermalZoneTempMap.get(instance) ?? null;
        temperature = tempMetric === null ? null : Number(tempMetric.toFixed(1));
        serviceUrl = `http://${node.ip}:9100`;
      }

      const state = nodeState({ isUp, cpu, memory, temperature: temperature ?? 0 });

      return {
        ...node,
        status: isUp ? 'up' : 'down',
        state,
        cpu,
        memory,
        temperature,
        serviceUrl,
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
        serviceUrl: node.source === 'mikrotik' ? `http://${node.ip}` : `http://${node.ip}:9100`,
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
