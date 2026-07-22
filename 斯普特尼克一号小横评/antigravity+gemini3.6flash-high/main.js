import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ==========================================================================
   SPUTNIK 1 - 3D INTERACTIVE ENGINE & SCENE ARCHITECTURE
   ========================================================================== */

class SputnikApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.currentMode = 'realistic';
    this.autoRotate = true;
    this.audioPlaying = false;
    this.audioCtx = null;
    this.audioInterval = null;
    this.hotspots = [];
    this.cameraTargetPos = null;
    this.controlsTargetPos = null;
    this.isTransitioningCamera = false;

    this.initScene();
    this.initLights();
    this.createStarsEnvironment();
    this.buildSputnikModel();
    this.initHotspots();
    this.initControls();
    this.initUIEvents();
    this.initAudioSynth();
    this.onWindowResize();

    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  /* ------------------------------------------------------------------------
     1. Scene & Renderer Initialization
     ------------------------------------------------------------------------ */
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 4, 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.container.appendChild(this.renderer.domElement);
  }

  /* ------------------------------------------------------------------------
     2. Lighting Setup (Monochrome Studio & Space Lights)
     ------------------------------------------------------------------------ */
  initLights() {
    // Key Light (Sunlight)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    this.keyLight.position.set(12, 18, 15);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.scene.add(this.keyLight);

    // Rim Fill Light (Earth Horizon bounce)
    this.rimLight = new THREE.DirectionalLight(0xd0e0ff, 1.4);
    this.rimLight.position.set(-15, -8, -12);
    this.scene.add(this.rimLight);

    // Back Light
    this.backLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.backLight.position.set(0, 10, -20);
    this.scene.add(this.backLight);

    // Ambient Lighting
    this.ambientLight = new THREE.AmbientLight(0x222228, 0.6);
    this.scene.add(this.ambientLight);
  }

  /* ------------------------------------------------------------------------
     3. Orbital Particles & Deep Space Stars
     ------------------------------------------------------------------------ */
  createStarsEnvironment() {
    const starCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const radius = 50 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      sizes[i] = 0.8 + Math.random() * 1.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);

    // Orbit Ring Visualizer
    const orbitCurve = new THREE.EllipseCurve(0, 0, 12, 9, 0, 2 * Math.PI, false, 0);
    const points = orbitCurve.getPoints(100);
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, 0, p.y))
    );
    const orbitMaterial = new THREE.LineDashedMaterial({
      color: 0x44444c,
      dashSize: 0.3,
      gapSize: 0.2,
      linewidth: 1
    });
    this.orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
    this.orbitLine.computeLineDistances();
    this.orbitLine.rotation.x = Math.PI / 6;
    this.orbitLine.rotation.z = Math.PI / 12;
    this.scene.add(this.orbitLine);
  }

  /* ------------------------------------------------------------------------
     4. Procedural High-Detail Sputnik 1 Model Creation
     ------------------------------------------------------------------------ */
  buildSputnikModel() {
    this.sputnikGroup = new THREE.Group();

    // 4.1 Outer Shell Materials
    this.metalMaterial = new THREE.MeshStandardMaterial({
      color: 0xdedee5,
      metalness: 0.95,
      roughness: 0.16,
      envMapIntensity: 1.5
    });

    this.darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.85,
      roughness: 0.35
    });

    this.wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true
    });

    this.blueprintMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.85,
      transparent: true,
      opacity: 0.75,
      wireframe: false
    });

    // 4.2 Central Sphere Core (58cm diameter sphere)
    const sphereRadius = 2.9;
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 64, 64);
    this.sphereMesh = new THREE.Mesh(sphereGeo, this.metalMaterial);
    this.sphereMesh.castShadow = true;
    this.sphereMesh.receiveShadow = true;
    this.sputnikGroup.add(this.sphereMesh);

    // 4.3 Equatorial Mounting Flange (Joint Ring)
    const flangeOuterRadius = 3.02;
    const flangeGeo = new THREE.CylinderGeometry(flangeOuterRadius, flangeOuterRadius, 0.12, 64);
    this.flangeMesh = new THREE.Mesh(flangeGeo, this.metalMaterial);
    this.flangeMesh.position.y = 0;
    this.flangeMesh.castShadow = true;
    this.sputnikGroup.add(this.flangeMesh);

    // Joint Gasket (Seal Ring)
    const gasketGeo = new THREE.TorusGeometry(2.96, 0.03, 16, 64);
    const gasketMesh = new THREE.Mesh(gasketGeo, this.darkMetalMaterial);
    gasketMesh.rotation.x = Math.PI / 2;
    this.sputnikGroup.add(gasketMesh);

    // 36 Bolts around Flange
    const boltCount = 36;
    const boltGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.16, 12);
    for (let i = 0; i < boltCount; i++) {
      const angle = (i / boltCount) * Math.PI * 2;
      const bolt = new THREE.Mesh(boltGeo, this.darkMetalMaterial);
      bolt.position.set(
        Math.cos(angle) * 2.98,
        0,
        Math.sin(angle) * 2.98
      );
      bolt.castShadow = true;
      this.sputnikGroup.add(bolt);
    }

    // 4.4 Top & Bottom Thermal Control Cap Valves
    const capGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.15, 32);
    const topCap = new THREE.Mesh(capGeo, this.darkMetalMaterial);
    topCap.position.set(0, sphereRadius + 0.05, 0);
    this.sputnikGroup.add(topCap);

    const bottomCap = topCap.clone();
    bottomCap.position.set(0, -sphereRadius - 0.05, 0);
    bottomCap.rotation.x = Math.PI;
    this.sputnikGroup.add(bottomCap);

    // 4.5 Whip Antennas (4 Extended Antennas in 2 V-pairs at 35° angle)
    this.antennasGroup = new THREE.Group();

    // Antenna specs: 2x 2.4m, 2x 2.9m. Angle relative to sphere pole = 35°
    const antennaConfigs = [
      { length: 12.0, angleZ: Math.PI / 180 * 35, angleY: Math.PI / 4 },
      { length: 12.0, angleZ: Math.PI / 180 * 35, angleY: Math.PI / 4 + Math.PI },
      { length: 14.5, angleZ: Math.PI / 180 * 35, angleY: -Math.PI / 4 },
      { length: 14.5, angleZ: Math.PI / 180 * 35, angleY: -Math.PI / 4 + Math.PI }
    ];

    antennaConfigs.forEach((cfg) => {
      const antMountGroup = new THREE.Group();
      antMountGroup.rotation.y = cfg.angleY;

      // Base Mount Socket
      const baseGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.5, 16);
      const baseMesh = new THREE.Mesh(baseGeo, this.darkMetalMaterial);
      baseMesh.position.set(0, sphereRadius - 0.2, 0);
      baseMesh.rotation.z = cfg.angleZ;

      // Tapered Antenna Rod
      const rodGeo = new THREE.CylinderGeometry(0.02, 0.06, cfg.length, 16);
      rodGeo.translate(0, cfg.length / 2, 0); // Origin at base
      const rodMesh = new THREE.Mesh(rodGeo, this.metalMaterial);
      rodMesh.position.set(0, sphereRadius, 0);
      rodMesh.rotation.z = cfg.angleZ;
      rodMesh.castShadow = true;

      antMountGroup.add(baseMesh);
      antMountGroup.add(rodMesh);
      this.antennasGroup.add(antMountGroup);
    });

    this.sputnikGroup.add(this.antennasGroup);

    // 4.6 Internal Components (For Blueprint/Inspection Mode)
    this.internalGroup = new THREE.Group();

    // Radio Transmitter Box
    const transGeo = new THREE.BoxGeometry(1.6, 1.4, 1.6);
    const transMat = new THREE.MeshStandardMaterial({
      color: 0x52525b,
      metalness: 0.7,
      roughness: 0.4
    });
    const transmitterMesh = new THREE.Mesh(transGeo, transMat);
    transmitterMesh.position.set(0, 0.4, 0);
    this.internalGroup.add(transmitterMesh);

    // Silver-Zinc Battery Blocks (3 Cylinders)
    const battGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24);
    const battMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      metalness: 0.9,
      roughness: 0.2
    });

    [-0.7, 0, 0.7].forEach((xOffset) => {
      const batt = new THREE.Mesh(battGeo, battMat);
      batt.position.set(xOffset, -0.8, 0);
      this.internalGroup.add(batt);
    });

    this.internalGroup.visible = false;
    this.sputnikGroup.add(this.internalGroup);

    // Initial Model Orientation & Addition
    this.sputnikGroup.rotation.x = Math.PI / 8;
    this.sputnikGroup.rotation.z = -Math.PI / 12;
    this.scene.add(this.sputnikGroup);
  }

  /* ------------------------------------------------------------------------
     5. Interactive 3D Hotspots Initialization
     ------------------------------------------------------------------------ */
  initHotspots() {
    this.hotspotData = [
      {
        id: 'hull',
        title: '双半球铝镁合金球壳',
        badge: 'SPHERICAL SHELL',
        pos: new THREE.Vector3(0, 2.9, 0),
        desc: '斯普特尼克一号主体由两个 2.0 毫米厚的 AMC83 铝镁合金半球冲压组装而成。表面经精细抛光处理，在太空中如同镜面般反射阳光，以维持卫星内部热平衡。',
        features: [
          { num: '58.0 cm', txt: '球体外径' },
          { num: '2.0 mm', txt: '冲压合金壁厚' }
        ],
        targetCam: { x: 0, y: 2, z: 8.5 }
      },
      {
        id: 'antennas',
        title: '双频通信天线阵列',
        badge: 'RADIO ANTENNAS',
        pos: new THREE.Vector3(4, 5, 2),
        desc: '由 4 条长鞭状天线组成，分成两对（2.4 米和 2.9 米）。天线以 35° 角向后张开，确保卫星在轨道上无定向翻滚时，全球业余无线电爱好者均可接收其信号。',
        features: [
          { num: '2.4 / 2.9m', txt: '长鞭天线尺寸' },
          { num: '35°', txt: '张开展开角度' }
        ],
        targetCam: { x: 6, y: 7, z: 12 }
      },
      {
        id: 'flange',
        title: '密封赤道连接法兰',
        badge: 'EQUATORIAL FLANGE',
        pos: new THREE.Vector3(3.0, 0, 0),
        desc: '赤道环法兰使用 36 颗螺栓将两个半球极其严密地固定在一起，内部填充特制橡胶密封圈与 1.3 个大气压的纯净氮气，防止在太空高真空环境下漏气。',
        features: [
          { num: '36 螺栓', txt: '赤道加固锁定' },
          { num: '1.3 atm', txt: '内部氮气充压' }
        ],
        targetCam: { x: 4.5, y: 0.5, z: 6 }
      },
      {
        id: 'internal',
        title: '广播发射机与银锌电池',
        badge: 'TRANSMITTER & POWER',
        pos: new THREE.Vector3(0, 0, 0),
        desc: '卫星核心装有一台 1 瓦特无线电发射机，工作在 20.005 MHz 与 40.002 MHz 频率。由 3 组重达 51 千克的银锌电池供电，持续不间断广播“哔-哔”电波 22 天。',
        features: [
          { num: '1.0 Watt', txt: '发射功率' },
          { num: '51.0 kg', txt: '电池组重量占比' }
        ],
        targetCam: { x: 0, y: 0.5, z: 5.5 }
      }
    ];

    const container = document.getElementById('hotspots-container');
    container.innerHTML = '';

    this.hotspotData.forEach((data) => {
      const el = document.createElement('div');
      el.className = 'hotspot-element';
      el.dataset.id = data.id;

      el.innerHTML = `
        <div class="hotspot-ring"></div>
        <div class="hotspot-label">${data.title}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectHotspot(data);
      });

      container.appendChild(el);
      this.hotspots.push({ element: el, pos: data.pos, data });
    });
  }

  /* ------------------------------------------------------------------------
     6. Orbit Controls & Camera Transitions
     ------------------------------------------------------------------------ */
  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 45;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.8;
  }

  selectHotspot(data) {
    // Update Info Panel
    const badge = document.getElementById('info-badge');
    const title = document.getElementById('info-title');
    const desc = document.getElementById('info-description');
    const featuresContainer = document.getElementById('info-features');

    if (badge) badge.innerText = data.badge;
    if (title) title.innerText = data.title;
    if (desc) desc.innerHTML = data.desc;

    if (featuresContainer && data.features) {
      featuresContainer.innerHTML = data.features
        .map(
          f => `
        <div class="feature-card">
          <div class="feature-num">${f.num}</div>
          <div class="feature-txt">${f.txt}</div>
        </div>
      `
        )
        .join('');
    }

    // Switch view mode if internal hotspot selected
    if (data.id === 'internal') {
      this.setMode('blueprint');
    }

    // Trigger Camera Move Transition
    this.cameraTargetPos = new THREE.Vector3(data.targetCam.x, data.targetCam.y, data.targetCam.z);
    this.controlsTargetPos = new THREE.Vector3(0, 0, 0);
    this.isTransitioningCamera = true;
  }

  /* ------------------------------------------------------------------------
     7. Render Mode Switcher (Realistic, Wireframe, Blueprint)
     ------------------------------------------------------------------------ */
  setMode(mode) {
    this.currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'realistic') {
      this.sphereMesh.material = this.metalMaterial;
      this.flangeMesh.material = this.metalMaterial;
      this.antennasGroup.traverse((c) => {
        if (c.isMesh) c.material = c.geometry.type.includes('Cylinder') ? this.metalMaterial : this.darkMetalMaterial;
      });
      this.internalGroup.visible = false;
    } else if (mode === 'wireframe') {
      this.sphereMesh.material = this.wireframeMaterial;
      this.flangeMesh.material = this.wireframeMaterial;
      this.antennasGroup.traverse((c) => {
        if (c.isMesh) c.material = this.wireframeMaterial;
      });
      this.internalGroup.visible = true;
      this.internalGroup.traverse((c) => {
        if (c.isMesh) c.material = this.wireframeMaterial;
      });
    } else if (mode === 'blueprint') {
      this.sphereMesh.material = this.blueprintMaterial;
      this.flangeMesh.material = this.blueprintMaterial;
      this.antennasGroup.traverse((c) => {
        if (c.isMesh) c.material = this.metalMaterial;
      });
      this.internalGroup.visible = true;
      this.internalGroup.traverse((c) => {
        if (c.isMesh) c.material = this.metalMaterial;
      });
    }
  }

  /* ------------------------------------------------------------------------
     8. UI Events & Controls Binding
     ------------------------------------------------------------------------ */
  initUIEvents() {
    // Render Mode Buttons
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMode(btn.dataset.mode);
      });
    });

    // Auto Rotate Toggle
    const autoBtn = document.getElementById('btn-auto-rotate');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        this.autoRotate = !this.autoRotate;
        this.controls.autoRotate = this.autoRotate;
        autoBtn.innerText = `Auto Orbit: ${this.autoRotate ? 'ON' : 'OFF'}`;
        autoBtn.classList.toggle('active', this.autoRotate);
      });
    }

    // Quick Nav Buttons
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target === 'overview') {
          this.cameraTargetPos = new THREE.Vector3(0, 4, 18);
          this.controlsTargetPos = new THREE.Vector3(0, 0, 0);
          this.isTransitioningCamera = true;
          this.setMode('realistic');
        } else {
          const hs = this.hotspotData.find((h) => h.id === target);
          if (hs) this.selectHotspot(hs);
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     9. Web Audio API Sputnik Telemetry Synthesizer
     ------------------------------------------------------------------------ */
  initAudioSynth() {
    const audioBtn = document.getElementById('btn-audio');
    if (!audioBtn) return;

    audioBtn.addEventListener('click', () => {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }

      this.audioPlaying = !this.audioPlaying;
      audioBtn.classList.toggle('playing', this.audioPlaying);

      if (this.audioPlaying) {
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        this.startBeepSequence();
      } else {
        this.stopBeepSequence();
      }
    });
  }

  startBeepSequence() {
    if (this.audioInterval) clearInterval(this.audioInterval);

    const playSingleBeep = () => {
      if (!this.audioPlaying || !this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // Authentic Sputnik 1 Telemetry Tone (~1000 Hz beep frequency)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, this.audioCtx.currentTime);

      // Envelope: Fast attack, 0.3s duration, smooth release
      gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, this.audioCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.32);
    };

    playSingleBeep();
    // Repeat beep every 0.6s (0.3s tone + 0.3s pause)
    this.audioInterval = setInterval(playSingleBeep, 600);
  }

  stopBeepSequence() {
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
  }

  /* ------------------------------------------------------------------------
     10. Main Animation & Render Loop
     ------------------------------------------------------------------------ */
  animate() {
    requestAnimationFrame(() => this.animate());

    // Rotate Stars & Satellite Slowly
    if (this.stars) this.stars.rotation.y += 0.0003;

    // Smooth Camera Transition Lerp
    if (this.isTransitioningCamera && this.cameraTargetPos) {
      this.camera.position.lerp(this.cameraTargetPos, 0.05);
      this.controls.target.lerp(this.controlsTargetPos, 0.05);

      if (this.camera.position.distanceTo(this.cameraTargetPos) < 0.1) {
        this.isTransitioningCamera = false;
      }
    }

    this.controls.update();

    // Update 3D Hotspot Screen Coordinates
    this.updateHotspotPositions();

    this.renderer.render(this.scene, this.camera);
  }

  updateHotspotPositions() {
    const tempV = new THREE.Vector3();
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;

    this.hotspots.forEach((hs) => {
      // Vector transform
      tempV.copy(hs.pos);
      tempV.applyMatrix4(this.sputnikGroup.matrixWorld);
      tempV.project(this.camera);

      // Check if behind camera
      if (tempV.z > 1) {
        hs.element.style.display = 'none';
        return;
      }

      hs.element.style.display = 'block';
      const x = (tempV.x * halfWidth) + halfWidth;
      const y = -(tempV.y * halfHeight) + halfHeight;

      hs.element.style.left = `${x}px`;
      hs.element.style.top = `${y}px`;
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Instantiate application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new SputnikApp();
});
