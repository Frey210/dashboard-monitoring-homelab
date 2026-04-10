import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { NEON, NODE_LAYOUT } from './config.js';

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
    this.defaultTarget = new THREE.Vector3(-4.8, 2.4, 0);
    this.desiredTarget = this.defaultTarget.clone();
    this.defaultCamera = new THREE.Vector3(22, 18, 24);
    this.desiredCamera = this.defaultCamera.clone();

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
        0.9,
        0.6,
        0.2,
      ),
    );

    this.setupEnvironment();
    this.setupNodes();
    this.setupEvents();
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setupEnvironment() {
    const ambientLight = new THREE.AmbientLight('#75bfff', 0.9);
    const pointLight = new THREE.PointLight('#38bdf8', 32, 80, 2);
    pointLight.position.set(8, 18, 8);
    const violetLight = new THREE.PointLight('#8b5cf6', 18, 100, 2);
    violetLight.position.set(-12, 14, -10);

    this.scene.add(ambientLight, pointLight, violetLight);

    const floor = new THREE.GridHelper(70, 40, '#164e63', '#082f49');
    floor.position.y = -2.5;
    floor.material.transparent = true;
    floor.material.opacity = 0.32;
    this.scene.add(floor);

    const plane = new THREE.Mesh(
      new THREE.CircleGeometry(35, 64),
      new THREE.MeshBasicMaterial({
        color: '#071226',
        transparent: true,
        opacity: 0.5,
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
    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#2441ff',
      transparent: true,
      opacity: 0.45,
    });

    const gatewayPosition = new THREE.Vector3(...NODE_LAYOUT.find((node) => node.id === 'gateway').position);
    const monitoringPosition = new THREE.Vector3(...NODE_LAYOUT.find((node) => node.id === 'aqn-node1').position);

    NODE_LAYOUT.forEach((node) => {
      const group = new THREE.Group();
      const position = new THREE.Vector3(...node.position);
      group.position.copy(position);

      const baseColor =
        node.kind === 'gateway'
          ? NEON.gateway
          : node.kind === 'monitoring'
            ? NEON.monitoring
            : node.kind === 'standalone'
              ? NEON.standalone
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
      ring.scale.setScalar(node.kind === 'gateway' ? 1.15 : 0.55);

      group.add(sphere, aura, ring);
      this.scene.add(group);

      const links = [];
      if (node.id !== 'gateway') {
        links.push(this.createLink(position, gatewayPosition, lineMaterial));
      }

      if (node.kind === 'cluster') {
        links.push(this.createLink(position, monitoringPosition, lineMaterial));
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

  createLink(from, to, material) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geometry, material.clone());
    this.scene.add(line);
    return line;
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

      const snapshot = this.snapshot(nodeId);
      this.onNodeSelect?.(snapshot);
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

      node.links.forEach((link) => {
        link.material.color.copy(color);
        link.material.opacity = state === 'down' ? 0.18 : 0.45;
      });
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

  animate() {
    const elapsed = this.clock.getElapsedTime();

    this.controls.target.lerp(this.desiredTarget, this.selectedNodeId ? 0.075 : 0.045);
    if (this.selectedNodeId) {
      this.camera.position.lerp(this.desiredCamera, 0.055);
    }
    this.controls.update();
    this.particles.rotation.y = elapsed * 0.015;

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
