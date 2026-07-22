(function () {
  const stage = document.getElementById("stage");
  if (!stage) return;

  function showStageError(message) {
    stage.innerHTML = "";
    const note = document.createElement("p");
    note.className = "stage-error";
    note.textContent = message;
    stage.appendChild(note);
  }

  if (typeof THREE === "undefined") {
    showStageError("三维引擎未加载，请确认 vendor/three.min.js 存在。");
    return;
  }

  // Lightweight orbit controls (no external module dependency)
  function createOrbitControls(camera, domElement) {
    const state = {
      enabled: true,
      autoRotate: true,
      autoRotateSpeed: 0.6,
      minDistance: 2.2,
      maxDistance: 9,
      target: new THREE.Vector3(0, 0.1, 0),
      spherical: new THREE.Spherical(),
      pointerDown: false,
      pointerId: null,
      prevX: 0,
      prevY: 0,
    };

    const offset = new THREE.Vector3();
    offset.copy(camera.position).sub(state.target);
    state.spherical.setFromVector3(offset);

    function onPointerDown(event) {
      if (!state.enabled) return;
      state.pointerDown = true;
      state.autoRotate = false;
      state.pointerId = event.pointerId;
      state.prevX = event.clientX;
      state.prevY = event.clientY;
      domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!state.pointerDown || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.prevX;
      const dy = event.clientY - state.prevY;
      state.prevX = event.clientX;
      state.prevY = event.clientY;
      state.spherical.theta -= dx * 0.005;
      state.spherical.phi -= dy * 0.005;
      state.spherical.phi = Math.max(0.12, Math.min(Math.PI - 0.12, state.spherical.phi));
    }

    function onPointerUp(event) {
      if (event.pointerId !== state.pointerId) return;
      state.pointerDown = false;
      state.pointerId = null;
    }

    function onWheel(event) {
      event.preventDefault();
      state.spherical.radius *= event.deltaY > 0 ? 1.08 : 0.92;
      state.spherical.radius = Math.max(
        state.minDistance,
        Math.min(state.maxDistance, state.spherical.radius)
      );
    }

    domElement.addEventListener("pointerdown", onPointerDown);
    domElement.addEventListener("pointermove", onPointerMove);
    domElement.addEventListener("pointerup", onPointerUp);
    domElement.addEventListener("pointercancel", onPointerUp);
    domElement.addEventListener("wheel", onWheel, { passive: false });

    return {
      get autoRotate() {
        return state.autoRotate;
      },
      set autoRotate(value) {
        state.autoRotate = value;
      },
      update: function update() {
        if (state.autoRotate && !state.pointerDown) {
          state.spherical.theta += 0.004 * state.autoRotateSpeed;
        }
        offset.setFromSpherical(state.spherical);
        camera.position.copy(state.target).add(offset);
        camera.lookAt(state.target);
      },
    };
  }

  try {
    const width = Math.max(stage.clientWidth, 320);
    const height = Math.max(stage.clientHeight, 320);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.2, 1.2, 4.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    if (renderer.outputEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    stage.appendChild(renderer.domElement);

    const controls = createOrbitControls(camera, renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(5, 7, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.75);
    fillLight.position.set(-5, 2, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(-2, 4, -6);
    scene.add(rimLight);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222228, 0.6));

    function createStarfield(count) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const r = 16 + Math.random() * 26;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      return new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.04,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        })
      );
    }

    scene.add(createStarfield(700));

    function createSputnik() {
      const group = new THREE.Group();

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xf2f2ee,
        metalness: 0.28,
        roughness: 0.32,
      });
      const darkMat = new THREE.MeshStandardMaterial({
        color: 0x2c2c30,
        metalness: 0.35,
        roughness: 0.5,
      });
      const antennaMat = new THREE.MeshStandardMaterial({
        color: 0xe8e8e2,
        metalness: 0.4,
        roughness: 0.3,
      });

      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.72, 64, 64), bodyMat));

      const seam = new THREE.Mesh(
        new THREE.TorusGeometry(0.722, 0.014, 12, 96),
        darkMat
      );
      seam.rotation.x = Math.PI / 2;
      group.add(seam);

      const joint = new THREE.Mesh(
        new THREE.CylinderGeometry(0.725, 0.725, 0.03, 64, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0xb4b4ae,
          metalness: 0.35,
          roughness: 0.4,
          side: THREE.DoubleSide,
        })
      );
      group.add(joint);

      const mount = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.26, 0.06, 32),
        darkMat
      );
      mount.position.set(0, 0, -0.68);
      mount.rotation.x = Math.PI / 2;
      group.add(mount);

      const antennaSpecs = [
        { length: 3.2, yaw: 0.55, pitch: 0.95, roll: 0.08 },
        { length: 3.2, yaw: -0.55, pitch: 0.95, roll: -0.08 },
        { length: 2.7, yaw: 0.95, pitch: 1.15, roll: 0.12 },
        { length: 2.7, yaw: -0.95, pitch: 1.15, roll: -0.12 },
      ];

      antennaSpecs.forEach(function (spec, index) {
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.006, spec.length, 12),
          antennaMat
        );
        antenna.geometry.translate(0, -spec.length / 2, 0);

        const pivot = new THREE.Group();
        const offsetX =
          index < 2 ? (index === 0 ? 0.08 : -0.08) : index === 2 ? 0.14 : -0.14;
        const offsetY = index < 2 ? 0.12 : -0.06;
        pivot.position.set(offsetX, offsetY, -0.58);
        pivot.rotation.order = "YXZ";
        pivot.rotation.y = spec.yaw;
        pivot.rotation.x = spec.pitch;
        pivot.rotation.z = spec.roll;
        pivot.add(antenna);
        group.add(pivot);

        const base = new THREE.Mesh(
          new THREE.SphereGeometry(0.032, 12, 12),
          darkMat
        );
        base.position.copy(pivot.position);
        group.add(base);
      });

      const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), darkMat);
      hatch.position.set(0.42, 0.28, 0.48);
      hatch.lookAt(0, 0, 0);
      group.add(hatch);

      const port = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16),
        darkMat
      );
      port.position.set(-0.38, -0.2, 0.55);
      port.lookAt(0, 0, 0);
      port.rotateX(Math.PI / 2);
      group.add(port);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.05, 48),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -1.15;
      group.add(shadow);

      group.rotation.x = 0.35;
      group.rotation.y = 0.85;
      group.rotation.z = -0.15;
      return group;
    }

    const sputnik = createSputnik();
    scene.add(sputnik);

    function onResize() {
      const w = Math.max(stage.clientWidth, 1);
      const h = Math.max(stage.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    window.addEventListener("resize", onResize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(onResize).observe(stage);
    }

    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      sputnik.position.y = Math.sin(t * 0.7) * 0.06;
      controls.update();
      renderer.render(scene, camera);
    }

    animate();
  } catch (error) {
    console.error(error);
    showStageError("三维模型加载失败，请刷新页面重试。");
  }
})();
