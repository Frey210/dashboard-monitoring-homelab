import axios from 'axios';
import './style.css';
import { ADMIN_LINKS, getLinksForHost, NEON, NODE_LAYOUT } from './config.js';
import { HomelabScene } from './homelabScene.js';

const serviceLinks = getLinksForHost(window.location.hostname);
const MAX_HISTORY = 18;

document.querySelector('#app').innerHTML = `
  <div id="app-shell" class="app-shell relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.14),_transparent_36%)]"></div>
    <header class="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-4 md:px-8">
      <div class="hud-shell flex flex-wrap items-start justify-between gap-3">
        <div class="header-panel pointer-events-auto">
          <div class="header-panel__mobile mobile-only">
            <img src="/logo-mtc.png" alt="MTC" class="header-logo" />
            <span id="server-time-mobile" class="header-chip header-chip--time">SERVER_TIME: --</span>
          </div>
          <div class="header-panel__desktop desktop-only">
            <p class="text-[11px] uppercase tracking-[0.38em] text-cyan-300/80">MTC SERVER INFRASTRUCTURE</p>
            <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-fuchsia-300/70">SYS_OPS // CORE_DIAGNOSTIC_INTERFACE_V1.0</p>
            <h1 class="mt-3 text-2xl font-semibold text-white md:text-3xl">Gateway Topology</h1>
            <p class="header-copy mt-2 text-sm text-slate-300">
              Prometheus-linked gateway topology and node-fleet telemetry.
            </p>
            <div class="header-meta mt-4">
              <span class="header-chip">STATUS: NOMINAL</span>
              <span class="header-chip">TUNNEL: ACTIVE</span>
              <span id="server-time" class="header-chip header-chip--time">SERVER_TIME: --</span>
            </div>
          </div>
        </div>
        <div class="utility-bar pointer-events-auto desktop-only">
          <div class="utility-row">
            <button data-link="grafana" class="utility-link">Open Grafana</button>
            <button data-link="prometheus" class="utility-link">Open Prometheus</button>
            <button id="toggle-rotate" class="utility-link utility-link--secondary">Pause Orbit</button>
          </div>
          <div class="utility-row utility-row--shortcuts">
            ${ADMIN_LINKS.map((link) => `<button data-external-link="${link.url}" class="utility-link utility-link--ghost">${link.label}</button>`).join('')}
          </div>
        </div>
      </div>
    </header>
    <main class="relative z-10 min-h-screen">
      <section id="scene-host" class="absolute inset-0"></section>
      <button id="fleet-toggle" class="fleet-toggle pointer-events-auto absolute right-4 top-[8.25rem] z-40 md:right-8 md:top-[8.25rem]" aria-expanded="true" aria-controls="fleet-panel">
        <span class="fleet-toggle__icon" aria-hidden="true"></span>
        <span class="fleet-toggle__label desktop-only">Hide Fleet</span>
        <span class="fleet-toggle__label mobile-only">Node Fleet</span>
      </button>
      <aside id="selected-node-panel" class="selected-panel is-hidden pointer-events-auto absolute bottom-4 left-4 z-20 w-[min(100%-2rem,24rem)] rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 shadow-[0_0_45px_rgba(14,165,233,0.12)] backdrop-blur-xl md:bottom-8 md:left-8">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-cyan-300/75">Selected Node</p>
            <h2 id="selected-node-name" class="mt-2 text-2xl font-semibold text-white">aqn-node1</h2>
            <p id="selected-node-ip" class="tech-copy text-sm text-slate-400">192.168.8.101</p>
          </div>
          <div class="flex items-start gap-2">
            <div id="selected-node-state" class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Up</div>
            <button id="clear-selection" class="panel-dismiss" aria-label="Deselect node">X</button>
          </div>
        </div>
        <div class="mt-5 grid grid-cols-3 gap-3">
          <div class="metric-tile">
            <span class="metric-label">CPU Load</span>
            <strong id="selected-node-cpu" class="metric-value tech-copy">0%</strong>
          </div>
          <div class="metric-tile metric-tile--secondary">
            <span class="metric-label">Memory</span>
            <strong id="selected-node-memory" class="metric-value tech-copy">0%</strong>
          </div>
          <div class="metric-tile">
            <span class="metric-label">Device Temp</span>
            <strong id="selected-node-temperature" class="metric-value tech-copy">--</strong>
          </div>
        </div>
        <div class="mt-4 flex gap-3">
          <button id="open-node-service" class="action-button action-button--primary">Open Node Exporter</button>
          <button id="refresh-now" class="action-button">Refresh Now</button>
        </div>
      </aside>
      <section id="fleet-panel" class="fleet-panel pointer-events-auto absolute right-4 top-[10.75rem] z-20 w-[min(100%-2rem,26rem)] rounded-2xl border border-slate-800/80 bg-slate-950/58 p-4 shadow-[0_0_40px_rgba(168,85,247,0.08)] backdrop-blur-xl md:right-8 md:top-[10.75rem]">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-fuchsia-300/75">Realtime Status</p>
            <h2 class="mt-2 text-xl font-semibold text-white">Node Fleet</h2>
          </div>
          <div id="last-updated" class="tech-copy text-xs text-slate-400">Waiting for metrics...</div>
        </div>
        <div class="mobile-actions mobile-only mt-4">
          <div class="mobile-actions__row">
            <button data-link="grafana" class="utility-link utility-link--compact">Grafana</button>
            <button data-link="prometheus" class="utility-link utility-link--compact">Prometheus</button>
            <button id="toggle-rotate-mobile" class="utility-link utility-link--secondary utility-link--compact">Pause Orbit</button>
          </div>
          <div class="mobile-actions__row">
            ${ADMIN_LINKS.map((link) => `<button data-external-link="${link.url}" class="utility-link utility-link--ghost utility-link--compact">${link.label}</button>`).join('')}
          </div>
        </div>
        <div class="fleet-panel__body mt-4">
          <div id="node-grid" class="grid gap-3 sm:grid-cols-2"></div>
        </div>
      </section>
      <div id="tooltip" class="pointer-events-none absolute z-30 hidden rounded-full border border-cyan-300/30 bg-slate-950/90 px-3 py-1 text-xs font-medium text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.16)]"></div>
    </main>
  </div>
`;

const nodeGrid = document.querySelector('#node-grid');
const selectedNodePanel = document.querySelector('#selected-node-panel');
const selectedNodeName = document.querySelector('#selected-node-name');
const selectedNodeIp = document.querySelector('#selected-node-ip');
const selectedNodeState = document.querySelector('#selected-node-state');
const selectedNodeCpu = document.querySelector('#selected-node-cpu');
const selectedNodeMemory = document.querySelector('#selected-node-memory');
const selectedNodeTemperature = document.querySelector('#selected-node-temperature');
const desktopServerTime = document.querySelector('#server-time');
const mobileServerTime = document.querySelector('#server-time-mobile');
const lastUpdated = document.querySelector('#last-updated');
const tooltip = document.querySelector('#tooltip');
const sceneHost = document.querySelector('#scene-host');
const openNodeService = document.querySelector('#open-node-service');
const refreshNow = document.querySelector('#refresh-now');
const toggleRotate = document.querySelector('#toggle-rotate');
const toggleRotateMobile = document.querySelector('#toggle-rotate-mobile');
const fleetToggle = document.querySelector('#fleet-toggle');
const fleetPanel = document.querySelector('#fleet-panel');
const clearSelectionButton = document.querySelector('#clear-selection');
const appShell = document.querySelector('#app-shell');

let currentSelection = null;
let autoRotate = true;
let fleetOpen = true;
let isMobileViewport = window.innerWidth < 768;
let latestMetrics = null;
let pollHandle = null;
let scanPulseHandle = null;
const metricHistory = new Map();

function badgeForState(state) {
  if (state === 'down') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  }
  if (state === 'warn') {
    return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
  }
  return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
}

function temperatureState(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'unknown';
  }
  if (value > 70) {
    return 'hot';
  }
  if (value >= 50) {
    return 'warm';
  }
  return 'cool';
}

function temperatureTone(value) {
  const state = temperatureState(value);
  if (state === 'hot') {
    return { className: 'text-rose-300', color: NEON.tempHot };
  }
  if (state === 'warm') {
    return { className: 'text-amber-300', color: NEON.tempWarm };
  }
  if (state === 'cool') {
    return { className: 'text-cyan-300', color: NEON.tempCool };
  }
  return { className: 'text-slate-400', color: '#64748b' };
}

function formatPercent(value) {
  return `${Math.round(value ?? 0)}%`;
}

function formatTemperature(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }
  return `${Math.round(value)}C`;
}

function formatServerTime(isoValue) {
  if (!isoValue) {
    return 'SERVER_TIME: --';
  }

  return `SERVER_TIME: ${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(isoValue))} UTC`;
}

function updateHistory(nodes) {
  nodes.forEach((node) => {
    const history = metricHistory.get(node.id) ?? { cpu: [], memory: [] };
    history.cpu = [...history.cpu, node.cpu ?? 0].slice(-MAX_HISTORY);
    history.memory = [...history.memory, node.memory ?? 0].slice(-MAX_HISTORY);
    metricHistory.set(node.id, history);
  });
}

function sparklineSvg(points, stroke, fillOpacity = 0.12) {
  if (!points.length) {
    return '';
  }

  const maxValue = Math.max(...points, 100);
  const width = 120;
  const height = 28;
  const step = width / Math.max(points.length - 1, 1);
  const polyline = points
    .map((point, index) => {
      const x = (index * step).toFixed(2);
      const y = (height - (point / maxValue) * (height - 4) - 2).toFixed(2);
      return `${x},${y}`;
    })
    .join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="sparkline-svg" aria-hidden="true">
      <polyline fill="none" stroke="${stroke}" stroke-width="2" points="${polyline}" />
      <polyline fill="rgba(15,23,42,${fillOpacity})" stroke="none" points="0,${height} ${polyline} ${width},${height}" />
    </svg>
  `;
}

function triggerScanPulse() {
  window.clearTimeout(scanPulseHandle);
  appShell.classList.remove('app-shell--scan');
  void appShell.offsetWidth;
  appShell.classList.add('app-shell--scan');
  scanPulseHandle = window.setTimeout(() => {
    appShell.classList.remove('app-shell--scan');
  }, 700);
}

function renderNodeCards(metrics) {
  const byId = new Map(metrics.nodes.map((node) => [node.id, node]));
  nodeGrid.innerHTML = NODE_LAYOUT.map((node) => {
    const item = byId.get(node.id);
    const state = item?.state ?? 'down';
    const cpu = Math.round(item?.cpu ?? 0);
    const memory = Math.round(item?.memory ?? 0);
    const temperature = item?.temperature ?? null;
    const history = metricHistory.get(node.id) ?? { cpu: [], memory: [] };
    const tempTone = temperatureTone(temperature);

    if (isMobileViewport) {
      return `
        <button data-node-id="${node.id}" class="node-card node-card--mobile">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-white">${node.label}</div>
              <div class="tech-copy mt-1 text-[11px] text-slate-400">${node.ip}</div>
            </div>
            <span class="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeForState(state)}">${state}</span>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-left text-[11px] text-slate-300">
            <div class="rounded-xl bg-slate-900/90 p-2">
              <div class="metric-chip-label">CPU</div>
              <div class="tech-copy mt-1 font-semibold text-cyan-200">${formatPercent(cpu)}</div>
            </div>
            <div class="rounded-xl bg-slate-900/90 p-2">
              <div class="metric-chip-label">TEMP</div>
              <div class="tech-copy mt-1 font-semibold ${tempTone.className}">${formatTemperature(temperature)}</div>
            </div>
          </div>
        </button>
      `;
    }

    return `
      <button data-node-id="${node.id}" class="node-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-white">${node.label}</div>
            <div class="tech-copy mt-1 text-[11px] text-slate-400">${node.ip}</div>
          </div>
          <span class="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeForState(state)}">${state}</span>
        </div>
        <div class="mt-3">
          <div class="micro-sparkline">
            ${sparklineSvg(history.cpu, NEON.tempCool)}
            ${sparklineSvg(history.memory, '#a855f7', 0.08)}
          </div>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-left text-[11px] text-slate-300">
          <div class="rounded-xl bg-slate-900/90 p-2">
            <div class="metric-chip-label">CPU</div>
            <div class="tech-copy mt-1 font-semibold text-cyan-200">${formatPercent(cpu)}</div>
          </div>
          <div class="rounded-xl bg-slate-900/90 p-2">
            <div class="metric-chip-label">RAM</div>
            <div class="tech-copy mt-1 font-semibold text-fuchsia-200">${formatPercent(memory)}</div>
          </div>
          <div class="rounded-xl bg-slate-900/90 p-2">
            <div class="metric-chip-label">TEMP</div>
            <div class="tech-copy mt-1 font-semibold ${tempTone.className}">${formatTemperature(temperature)}</div>
          </div>
        </div>
      </button>
    `;
  }).join('');
}

function renderSelection(snapshot) {
  if (!snapshot) {
    selectedNodePanel.classList.add('is-hidden');
    return;
  }

  selectedNodePanel.classList.remove('is-hidden');
  selectedNodeName.textContent = snapshot.label;
  selectedNodeIp.textContent = snapshot.ip;
  selectedNodeCpu.textContent = formatPercent(snapshot.cpu);
  selectedNodeMemory.textContent = formatPercent(snapshot.memory);
  selectedNodeTemperature.textContent = formatTemperature(snapshot.temperature);
  selectedNodeTemperature.className = `metric-value tech-copy ${temperatureTone(snapshot.temperature).className}`;
  selectedNodeState.textContent = snapshot.state;
  selectedNodeState.className = `rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${badgeForState(snapshot.state)}`;
}

function clearSelection() {
  currentSelection = null;
  renderSelection(null);
  scene.clearFocus();
}

function setSelection(snapshot, { focus = false } = {}) {
  if (!snapshot) {
    clearSelection();
    return;
  }

  currentSelection = snapshot;
  renderSelection(snapshot);
  if (isMobileViewport) {
    setFleetOpen(false);
  }

  if (focus) {
    scene.focusNode(snapshot.id);
  }
}

function setTooltip(snapshot, event) {
  if (!snapshot || !event || isMobileViewport) {
    tooltip.classList.add('hidden');
    return;
  }

  tooltip.textContent = `${snapshot.label} | ${snapshot.state.toUpperCase()} | CPU ${Math.round(snapshot.cpu ?? 0)}% | TEMP ${formatTemperature(snapshot.temperature)}`;
  tooltip.style.left = `${event.clientX + 18}px`;
  tooltip.style.top = `${event.clientY - 6}px`;
  tooltip.classList.remove('hidden');
}

function setFleetOpen(nextState) {
  fleetOpen = nextState;
  fleetPanel.classList.toggle('is-collapsed', !fleetOpen);
  fleetToggle.setAttribute('aria-expanded', String(fleetOpen));
  const desktopLabel = fleetToggle.querySelector('.fleet-toggle__label.desktop-only');
  const mobileLabel = fleetToggle.querySelector('.fleet-toggle__label.mobile-only');
  if (desktopLabel) {
    desktopLabel.textContent = fleetOpen ? 'Hide Fleet' : 'Show Fleet';
  }
  if (mobileLabel) {
    mobileLabel.textContent = fleetOpen ? 'Close Fleet' : 'Node Fleet';
  }
}

function applyViewportMode(forceState) {
  const nextIsMobile = forceState ?? window.innerWidth < 768;
  const changed = nextIsMobile !== isMobileViewport;
  isMobileViewport = nextIsMobile;
  appShell.classList.toggle('is-mobile', isMobileViewport);
  scene.setViewportMode(isMobileViewport);

  if (changed) {
    setFleetOpen(!isMobileViewport);
    if (!currentSelection) {
      renderSelection(null);
    }
  }

  if (latestMetrics) {
    renderNodeCards(latestMetrics);
    if (currentSelection) {
      const refreshedSelection = latestMetrics.nodes.find((node) => node.id === currentSelection.id);
      if (refreshedSelection) {
        renderSelection(refreshedSelection);
      }
    }
  }
}

const scene = new HomelabScene({
  mount: sceneHost,
  isMobile: isMobileViewport,
  onNodeHover: (snapshot, event) => setTooltip(snapshot, event),
  onNodeSelect: (snapshot) => {
    if (currentSelection?.id === snapshot.id) {
      clearSelection();
      return;
    }

    setSelection(snapshot, { focus: true });
  },
  onBackgroundSelect: () => {
    if (currentSelection) {
      clearSelection();
    }
  },
});

async function fetchMetrics() {
  const response = await axios.get('/api/metrics');
  const metrics = response.data;
  latestMetrics = metrics;
  updateHistory(metrics.nodes);
  scene.update(metrics);
  renderNodeCards(metrics);
  lastUpdated.textContent = `Updated ${new Date(metrics.generatedAt).toLocaleTimeString()}`;
  const serverTimeText = formatServerTime(metrics.serverTimeUtc ?? metrics.generatedAt);
  if (desktopServerTime) {
    desktopServerTime.textContent = serverTimeText;
  }
  if (mobileServerTime) {
    mobileServerTime.textContent = serverTimeText;
  }

  if (!currentSelection) {
    return;
  }

  const refreshedSelection = metrics.nodes.find((node) => node.id === currentSelection.id);
  if (!refreshedSelection) {
    clearSelection();
    return;
  }

  setSelection(refreshedSelection);
}

async function refreshWithGuard({ animate = false } = {}) {
  try {
    if (animate) {
      triggerScanPulse();
    }
    await fetchMetrics();
  } catch (error) {
    lastUpdated.textContent = `Metrics error | ${error.message}`;
  }
}

function syncRotateLabels() {
  const label = autoRotate ? 'Pause Orbit' : 'Resume Orbit';
  if (toggleRotate) {
    toggleRotate.textContent = label;
  }
  if (toggleRotateMobile) {
    toggleRotateMobile.textContent = label;
  }
}

pollHandle = window.setInterval(() => refreshWithGuard(), 5000);
refreshWithGuard({ animate: true });
setFleetOpen(!isMobileViewport);
renderSelection(null);
applyViewportMode(isMobileViewport);
syncRotateLabels();

document.querySelectorAll('[data-link]').forEach((button) => {
  button.addEventListener('click', () => {
    window.open(serviceLinks[button.dataset.link], '_blank', 'noopener,noreferrer');
  });
});

document.querySelectorAll('[data-external-link]').forEach((button) => {
  button.addEventListener('click', () => {
    window.open(button.dataset.externalLink, '_blank', 'noopener,noreferrer');
  });
});

openNodeService.addEventListener('click', () => {
  if (currentSelection?.serviceUrl) {
    window.open(currentSelection.serviceUrl, '_blank', 'noopener,noreferrer');
  }
});

clearSelectionButton.addEventListener('click', clearSelection);
refreshNow.addEventListener('click', () => refreshWithGuard({ animate: true }));
fleetToggle.addEventListener('click', () => setFleetOpen(!fleetOpen));

[toggleRotate, toggleRotateMobile].filter(Boolean).forEach((button) => {
  button.addEventListener('click', () => {
    autoRotate = !autoRotate;
    scene.setAutoRotate(autoRotate);
    syncRotateLabels();
  });
});

nodeGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-node-id]');
  if (!button) {
    return;
  }

  const targetId = button.dataset.nodeId;
  if (currentSelection?.id === targetId) {
    clearSelection();
    return;
  }

  setSelection(scene.snapshot(targetId), { focus: true });
});

window.addEventListener('resize', () => applyViewportMode());

window.addEventListener('beforeunload', () => {
  window.clearInterval(pollHandle);
  scene.destroy();
});
