export const NODE_LAYOUT = [
  {
    id: 'mtc-core-router',
    label: 'MTC Core Router',
    node: 'mtc-core-router',
    ip: '192.168.8.1',
    kind: 'core',
    position: [0, 0, 0],
    orbitOrder: 0,
  },
  {
    id: 'aqn-node1',
    label: 'aqn-node1',
    node: 'aqn-node1',
    ip: '192.168.8.101',
    kind: 'monitoring',
    position: [0, 4.8, 0],
    orbitOrder: 0,
  },
  {
    id: 'aqn-node2',
    label: 'aqn-node2',
    node: 'aqn-node2',
    ip: '192.168.8.102',
    kind: 'cluster',
    position: [10, 0.8, 0],
    orbitOrder: 1,
  },
  {
    id: 'aqn-node3',
    label: 'aqn-node3',
    node: 'aqn-node3',
    ip: '192.168.8.103',
    kind: 'cluster',
    position: [0, 0.8, 10],
    orbitOrder: 2,
  },
  {
    id: 'aqn-node4',
    label: 'aqn-node4',
    node: 'aqn-node4',
    ip: '192.168.8.104',
    kind: 'cluster',
    position: [-10, 0.8, 0],
    orbitOrder: 3,
  },
  {
    id: 'aqn-node5',
    label: 'aqn-node5',
    node: 'aqn-node5',
    ip: '192.168.8.105',
    kind: 'cluster',
    position: [0, 0.8, -10],
    orbitOrder: 4,
  },
  {
    id: 'ergoquipt',
    label: 'Ergoquipt',
    node: 'ergoquipt',
    ip: '192.168.8.97',
    kind: 'edge',
    position: [16, 2.2, 6],
    orbitOrder: 5,
  },
  {
    id: 'home',
    label: 'Home',
    node: 'home',
    ip: '192.168.8.96',
    kind: 'edge',
    position: [-16, 2.2, 6],
    orbitOrder: 6,
  },
  {
    id: 'aerasea',
    label: 'Aerasea',
    node: 'aerasea',
    ip: '192.168.8.95',
    kind: 'edge',
    position: [0, 2.2, -18],
    orbitOrder: 7,
  },
];

export const NEON = {
  up: '#34f6c8',
  warn: '#facc15',
  down: '#ff5470',
  tempCool: '#22d3ee',
  tempWarm: '#f59e0b',
  tempHot: '#f43f5e',
  core: '#5eead4',
  monitoring: '#8b5cf6',
  cluster: '#38bdf8',
  edge: '#f97316',
  homeWarn: '#fb923c',
  background: '#020617',
};

export function getLinksForHost(hostname) {
  const currentHost = hostname || window.location.hostname || 'localhost';
  return {
    grafana: 'https://monitoring.inkubasistartupunhas.id/',
    prometheus: `http://${currentHost}:9090`,
  };
}

export const ADMIN_LINKS = [
  {
    id: 'dento-smart',
    label: 'Dento Smart',
    url: 'https://dento-smart.inkubasistartupunhas.id/',
  },
  {
    id: 'ergoquipt-admin',
    label: 'Ergoquipt Admin',
    url: 'https://ergoquipt-admin.inkubasistartupunhas.id/',
  },
  {
    id: 'aquanotes-web',
    label: 'Aquanotes Web',
    url: 'https://aquanotes-web.inkubasistartupunhas.id/',
  },
];
