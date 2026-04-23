import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { NEON, NODE_LAYOUT } from './config.js';

const LINK_STATE_PRIORITY = {
  down: 3,
  warn: 2,
  up: 1,
};

function createMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    emissive: new THREE.Color(colorHex),
    emissiveIntensity: 1.35,
    metalness: 0.45,
    roughness: 0.25,
  });
}

function stateFromMetrics(metrics) {
  if (metrics?.state) {
    return metrics.state;
  }

  if (!metrics || metrics.status !== 'up') {
    return 'down';
  }

  if ((metrics.cpu ?? 0) >= 75 || (metrics.memory ?? 0) >= 85 || (metrics.temperature ?? 0) >= 70) {
    return 'warn';
  }

  return 'up';
}

function dominantState(...states) {
  return states.reduce((current, candidate) => {
    return LINK_STATE_PRIORITY[candidate] > LINK_STATE_PRIORITY[current] ? candidate : current;
  }, 'up');
}

function createFiberCurve(from, to) {
  return new THREE.LineCurve3(from.clone(), to.clone());
}

function createPacketMaterial(color, intensity, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
  });
}

function packetConfigForState(state) {
  if (state === 'warn') {
    return {
      color: new THREE.Color('#f59e0b'),
      speed: 0.018,
      spacing: 0.036,
      count: 8,
    };
  }

  return {
    color: new THREE.Color('#52f7ff'),
    speed: 0.22,
    spacing: 0.1,
    count: 10,
  };
}

export class HomelabScene {
  constructor({ mount, onNodeHover, onNodeSelect, onBackgroundSelect }) {
    this.mount = mount;
    this.onNodeHover = onNodeHover;
    this.onNodeSelect = onNodeSelect;
    this.onBackgroundSelect = onBackgroundSelect;
    this.clock = new THREE.Clock();
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.nodeMap = new Map();
    this.metricsByNode = new Map();
    this.hoveredNodeId = null;
    this.selectedNodeId = null;
    this.autoRotate = true;
    this.defaultTarget = new THREE.Vector3(-5.4, 2.4, 0);
    this.desiredTarget = this.defaultTarget.clone();
    this.defaultCamera = new THREE.Vector3(22, 18, 24);
    this.desiredCamera = this.defaultCamera.clone();
    this.linkPackets = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NEON.background);
    this.scene.fog = new THREE.FogExp2(NEON.background, 0.018);

    this.camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      200,
    );
    this.camera.position.copy(this.defaultCamera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 42;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.target.copy(this.defaultTarget);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(mount.clientWidth, mount.clientHeight),
        1.15,
        0.75,
        0.15,
      ),
    );

    this.setupEnvironment();
    this.setupNodes();
    this.setupEvents();
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setupEnvironment() {
    const ambientLight = new THREE.AmbientLight('#75bfff', 0.8);
    const pointLight = new THREE.PointLight('#38bdf8', 32, 80, 2);
    pointLight.position.set(8, 18, 8);
    const violetLight = new THREE.PointLight('#8b5cf6', 18, 100, 2);
    violetLight.position.set(-12, 14, -10);

    this.scene.add(ambientLight, pointLight, violetLight);

    const floor = new THREE.GridHelper(70, 40, '#164e63', '#082f49');
    floor.position.y = -2.5;
    floor.material.transparent = true;
    floor.material.opacity = 0.24;
    this.scene.add(floor);

    const plane = new THREE.Mesh(
      new THREE.CircleGeometry(35, 64),
      new THREE.MeshBasicMaterial({
        color: '#071226',
        transparent: true,
        opacity: 0.46,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -2.45;
    this.scene.add(plane);

    const particleCount = 1400;
    const positions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 90;
      positions[index * 3 + 1] = Math.random() * 32 - 4;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 90;
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      color: '#93c5fd',
      size: 0.12,
      transparent: true,
      opacity: 0.55,
    });

    this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
    this.scene.add(this.particles);
  }

  setupNodes() {
    const sphereGeometry = new THREE.SphereGeometry(1.2, 48, 48);
    const auraGeometry = new THREE.SphereGeometry(1.65, 32, 32);
    const ringGeometry = new THREE.TorusGeometry(2.5, 0.08, 16, 100);

    const gatewayPosition = new THREE.Vector3(...NODE_LAYOUT.find((node) => node.id === 'mtc-core-router').position);
    const monitoringPosition = new THREE.Vector3(...NODE_LAYOUT.find((node) => node.id === 'aqn-node1').position);

    NODE_LAYOUT.forEach((node) => {
      const group = new THREE.Group();
      const position = new THREE.Vector3(...node.position);
      group.position.copy(position);

      const baseColor =
        node.kind === 'core'
          ? NEON.core
          : node.kind === 'monitoring'
            ? NEON.monitoring
            : node.kind === 'edge'
              ? NEON.edge
              : NEON.cluster;

      const sphere = new THREE.Mesh(sphereGeometry, createMaterial(baseColor));
      sphere.userData.nodeId = node.id;

      const aura = new THREE.Mesh(
        auraGeometry,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(baseColor),
          transparent: true,
          opacity: 0.12,
          side: THREE.BackSide,
        }),
      );

      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(baseColor),
          transparent: true,
          opacity: 0.4,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(node.kind === 'core' ? 1.22 : node.kind === 'monitoring' ? 0.72 : 0.55);

      group.add(sphere, aura, ring);
      this.scene.add(group);

      const links = [];
      if (node.id !== 'mtc-core-router') {
        links.push(this.createLink({
          fromNodeId: node.id,
          toNodeId: 'mtc-core-router',
          from: position,
          to: gatewayPosition,
          emphasis: node.kind,
        }));
      }

      if (node.kind === 'cluster') {
        links.push(this.createLink({
          fromNodeId: node.id,
          toNodeId: 'aqn-node1',
          from: position,
          to: monitoringPosition,
          emphasis: 'cluster-core',
        }));
      }

      this.nodeMap.set(node.id, {
        meta: node,
        group,
        sphere,
        aura,
        ring,
        links,
      });
    });
  }

  createLink({ fromNodeId, toNodeId, from, to, emphasis }) {
    const curve = createFiberCurve(from, to);
    const shellGeometry = new THREE.TubeGeometry(curve, 1, 0.11, 12, false);
    const coreGeometry = new THREE.TubeGeometry(curve, 1, 0.045, 10, false);

    const shell = new THREE.Mesh(
      shellGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#0b2444'),
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
      }),
    );

    const core = new THREE.Mesh(
      coreGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#46f3ff'),
        transparent: true,
        opacity: 1,
        toneMapped: false,
      }),
    );

    this.scene.add(shell, core);

    const packets = Array.from({ length: 7 }, (_, index) => {
      const packet = new THREE.Group();
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        createPacketMaterial('#52f7ff', 1, 0.96),
      );

      const tailOne = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        createPacketMaterial('#52f7ff', 1, 0.32),
      );
      const tailTwo = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        createPacketMaterial('#52f7ff', 1, 0.18),
      );

      packet.add(head, tailOne, tailTwo);
      packet.visible = false;
      this.scene.add(packet);

      return {
        group: packet,
        head,
        tailOne,
        tailTwo,
        offset: index,
        jitter: Math.random() * 0.045,
      };
    });

    const link = {
      fromNodeId,
      toNodeId,
      emphasis,
      curve,
      shell,
      core,
      packets,
      state: 'up',
      packetPhase: Math.random(),
    };

    this.linkPackets.push(link);
    return link;
  }

  setupEvents() {
    this.handleResize = () => {
      const { clientWidth, clientHeight } = this.mount;
      this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(clientWidth, clientHeight);
      this.composer.setSize(clientWidth, clientHeight);
    };

    this.handleMove = (event) => {
      this.updatePointer(event);
      const hit = this.getIntersectedNode();
      const nodeId = hit?.object?.userData?.nodeId ?? null;

      if (nodeId !== this.hoveredNodeId) {
        this.hoveredNodeId = nodeId;
        this.onNodeHover?.(nodeId ? this.snapshot(nodeId) : null, event);
      }
    };

    this.handleClick = (event) => {
      this.updatePointer(event);
      const hit = this.getIntersectedNode();
      const nodeId = hit?.object?.userData?.nodeId ?? null;

      if (!nodeId) {
        this.onBackgroundSelect?.();
        return;
      }

      this.onNodeSelect?.(this.snapshot(nodeId));
    };

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointermove', this.handleMove);
    this.renderer.domElement.addEventListener('click', this.handleClick);
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  getIntersectedNode() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const spheres = [...this.nodeMap.values()].map((node) => node.sphere);
    const intersections = this.raycaster.intersectObjects(spheres, false);
    return intersections[0] ?? null;
  }

  snapshot(nodeId) {
    const node = this.nodeMap.get(nodeId);
    const metrics = this.metricsByNode.get(nodeId) ?? {
      status: 'unknown',
      cpu: 0,
      memory: 0,
      temperature: null,
    };

    return {
      ...node.meta,
      ...metrics,
      serviceUrl: `http://${node.meta.ip}:9100`,
      state: stateFromMetrics(metrics),
    };
  }

  linkState(link) {
    const fromState = stateFromMetrics(this.metricsByNode.get(link.fromNodeId));
    const toState = stateFromMetrics(this.metricsByNode.get(link.toNodeId));
    return dominantState(fromState, toState);
  }

  update(metrics) {
    metrics.nodes.forEach((nodeMetrics) => {
      this.metricsByNode.set(nodeMetrics.id, nodeMetrics);
      const node = this.nodeMap.get(nodeMetrics.id);
      if (!node) {
        return;
      }

      const state = stateFromMetrics(nodeMetrics);
      const colorHex = nodeMetrics.id === 'home' && state === 'warn' ? NEON.homeWarn : NEON[state];
      const color = new THREE.Color(colorHex);
      const scale = 0.95 + Math.min(nodeMetrics.cpu ?? 0, 100) / 115;

      node.sphere.material.color.copy(color);
      node.sphere.material.emissive.copy(color);
      node.sphere.material.emissiveIntensity = state === 'warn' ? 1.55 : 1.2;
      node.aura.material.color.copy(color);
      node.ring.material.color.copy(color);
      node.group.scale.setScalar(scale);
    });

    this.linkPackets.forEach((link) => {
      const state = this.linkState(link);
      link.state = state;

      if (state === 'down') {
        link.shell.material.color.set('#4b5563');
        link.shell.material.opacity = 0.45;
        link.core.material.color.set('#6b7280');
        link.core.material.opacity = 0.3;
        return;
      }

      link.shell.material.color.set(state === 'warn' ? '#2d1d0a' : '#0f2f52');
      link.shell.material.opacity = state === 'warn' ? 0.9 : 0.88;
      link.core.material.color.set(state === 'warn' ? '#f59e0b' : '#49f4ff');
      link.core.material.opacity = state === 'warn' ? 0.92 : 1;
    });
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled;
    if (!this.selectedNodeId) {
      this.controls.autoRotate = enabled;
    }
  }

  focusNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    this.selectedNodeId = nodeId;
    this.controls.autoRotate = false;
    this.controls.enableRotate = false;

    const focusBias = new THREE.Vector3(-2.8, 1.2, 0);
    const currentDirection = this.camera.position.clone().sub(this.controls.target).normalize();
    const focusDistance = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.controls.target),
      16,
      28,
    );

    this.desiredTarget.copy(node.group.position).add(focusBias);
    this.desiredCamera.copy(this.desiredTarget).add(currentDirection.multiplyScalar(focusDistance));
    this.desiredCamera.y = Math.max(this.desiredCamera.y, this.desiredTarget.y + 7);
  }

  clearFocus() {
    this.selectedNodeId = null;
    this.controls.enableRotate = true;
    this.controls.autoRotate = this.autoRotate;
    this.desiredTarget.copy(this.defaultTarget);
    this.desiredCamera.copy(this.camera.position);
  }

  animatePackets(elapsed) {
    this.linkPackets.forEach((link) => {
      if (link.state === 'down') {
        link.packets.forEach((packet) => {
          packet.group.visible = false;
        });
        return;
      }

      const config = packetConfigForState(link.state);
      link.packets.forEach((packet, index) => {
        if (index >= config.count) {
          packet.group.visible = false;
          return;
        }

        const flowHead = (elapsed * config.speed + link.packetPhase) % 1;
        const spacingOffset = packet.offset * config.spacing;
        const travel = link.state === 'warn'
          ? (flowHead - spacingOffset + packet.jitter + 1) % 1
          : (flowHead - spacingOffset + 1) % 1;

        const headPoint = link.curve.getPointAt(travel);
        const tailPointOne = link.curve.getPointAt((travel - 0.018 + 1) % 1);
        const tailPointTwo = link.curve.getPointAt((travel - 0.034 + 1) % 1);

        packet.group.visible = true;
        packet.group.position.copy(headPoint);
        packet.head.position.set(0, 0, 0);
        packet.tailOne.position.copy(tailPointOne.clone().sub(headPoint));
        packet.tailTwo.position.copy(tailPointTwo.clone().sub(headPoint));

        packet.head.material.color.copy(config.color);
        packet.tailOne.material.color.copy(config.color);
        packet.tailTwo.material.color.copy(config.color);
        packet.head.material.opacity = link.state === 'warn' ? 0.9 : 0.98;
        packet.tailOne.material.opacity = link.state === 'warn' ? 0.42 : 0.3;
        packet.tailTwo.material.opacity = link.state === 'warn' ? 0.26 : 0.16;
      });
    });
  }

  animate() {
    const elapsed = this.clock.getElapsedTime();

    this.controls.target.lerp(this.desiredTarget, this.selectedNodeId ? 0.075 : 0.045);
    if (this.selectedNodeId) {
      this.camera.position.lerp(this.desiredCamera, 0.055);
    }
    this.controls.update();
    this.particles.rotation.y = elapsed * 0.015;
    this.animatePackets(elapsed);

    this.nodeMap.forEach((node, nodeId) => {
      const metrics = this.metricsByNode.get(nodeId);
      const state = stateFromMetrics(metrics);
      const pulseAmplitude = nodeId === 'home' && state === 'warn' ? 0.09 : 0.04;
      const pulse = 1 + Math.sin(elapsed * 2.2 + node.meta.orbitOrder) * pulseAmplitude;
      const downPulse = state === 'down' ? 0.75 + Math.abs(Math.sin(elapsed * 6)) * 0.35 : 1;
      node.aura.scale.setScalar(pulse * downPulse);
      node.ring.rotation.z += 0.004 + node.meta.orbitOrder * 0.0002;
      node.ring.material.opacity =
        state === 'down'
          ? 0.85
          : nodeId === 'home' && state === 'warn'
            ? 0.78
            : state === 'warn'
              ? 0.6
              : 0.38;
    });

    this.composer.render();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointermove', this.handleMove);
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    this.renderer.dispose();
    this.mount.innerHTML = '';
  }
}
