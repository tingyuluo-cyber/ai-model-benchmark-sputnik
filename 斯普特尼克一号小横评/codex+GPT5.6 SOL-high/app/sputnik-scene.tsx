"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

export type SputnikSceneHandle = {
  reset: () => void;
};

type SputnikSceneProps = {
  autoRotate: boolean;
};

function makeRod(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.72, direction.length(), 12),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return mesh;
}

export const SputnikScene = forwardRef<SputnikSceneHandle, SputnikSceneProps>(
  function SputnikScene({ autoRotate }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const resetRef = useRef<() => void>(() => undefined);
    const autoRotateRef = useRef(autoRotate);

    useEffect(() => {
      autoRotateRef.current = autoRotate;
    }, [autoRotate]);

    useImperativeHandle(ref, () => ({
      reset: () => resetRef.current(),
    }), []);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 0.1, 7.8);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      mount.appendChild(renderer.domElement);

      const satellite = new THREE.Group();
      satellite.rotation.set(-0.18, -0.48, -0.18);
      scene.add(satellite);

      const metal = new THREE.MeshPhysicalMaterial({
        color: 0xd9dde0,
        metalness: 0.92,
        roughness: 0.2,
        clearcoat: 0.38,
        clearcoatRoughness: 0.15,
      });
      const darkMetal = new THREE.MeshStandardMaterial({
        color: 0x1d2023,
        metalness: 0.92,
        roughness: 0.28,
      });
      const rodMetal = new THREE.MeshStandardMaterial({
        color: 0x9da2a6,
        metalness: 0.98,
        roughness: 0.18,
      });

      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), metal);
      body.castShadow = true;
      satellite.add(body);

      const seam = new THREE.Mesh(new THREE.TorusGeometry(1.006, 0.015, 8, 128), darkMetal);
      seam.rotation.x = Math.PI / 2;
      satellite.add(seam);

      const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.265, 0.035, 64), metal);
      hatch.position.set(0, 0, 0.985);
      hatch.rotation.x = Math.PI / 2;
      satellite.add(hatch);

      const centerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.06, 32), darkMetal);
      centerCap.position.set(0, 0, 1.035);
      centerCap.rotation.x = Math.PI / 2;
      satellite.add(centerCap);

      const boltGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.018, 12);
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        const bolt = new THREE.Mesh(boltGeometry, darkMetal);
        bolt.position.set(Math.cos(angle) * 0.74, Math.sin(angle) * 0.74, 0.682);
        bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bolt.position.clone().normalize());
        satellite.add(bolt);
      }

      const antennaStarts = [
        new THREE.Vector3(-0.52, -0.5, -0.71),
        new THREE.Vector3(0.52, -0.5, -0.71),
        new THREE.Vector3(-0.38, -0.72, -0.58),
        new THREE.Vector3(0.38, -0.72, -0.58),
      ];
      const antennaEnds = [
        new THREE.Vector3(-0.92, -3.25, -1.08),
        new THREE.Vector3(0.92, -3.25, -1.08),
        new THREE.Vector3(-1.34, -3.7, -1.38),
        new THREE.Vector3(1.34, -3.7, -1.38),
      ];

      antennaStarts.forEach((start, index) => {
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.12, 0.23, 20), darkMetal);
        socket.position.copy(start);
        const direction = antennaEnds[index].clone().sub(start).normalize();
        socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        satellite.add(socket);
        satellite.add(makeRod(start, antennaEnds[index], 0.018, rodMetal));
      });

      satellite.position.y = 0.8;

      const rimLight = new THREE.DirectionalLight(0xffffff, 4.5);
      rimLight.position.set(-5, 3, 5);
      scene.add(rimLight);
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
      keyLight.position.set(4, 4, 6);
      scene.add(keyLight);
      const lowerLight = new THREE.DirectionalLight(0x8b9198, 1.7);
      lowerLight.position.set(0, -5, 2);
      scene.add(lowerLight);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));

      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let targetRotationX = satellite.rotation.x;
      let targetRotationY = satellite.rotation.y;
      let zoomTarget = camera.position.z;

      resetRef.current = () => {
        targetRotationX = -0.18;
        targetRotationY = -0.48;
        zoomTarget = 7.8;
      };

      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        renderer.domElement.setPointerCapture(event.pointerId);
        mount.classList.add("is-dragging");
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        targetRotationY += (event.clientX - lastX) * 0.008;
        targetRotationX += (event.clientY - lastY) * 0.008;
        targetRotationX = THREE.MathUtils.clamp(targetRotationX, -1.45, 1.45);
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const onPointerUp = (event: PointerEvent) => {
        dragging = false;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        mount.classList.remove("is-dragging");
      };
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        zoomTarget = THREE.MathUtils.clamp(zoomTarget + event.deltaY * 0.004, 5.8, 10);
      };

      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

      const resize = () => {
        const { width, height } = mount.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);
      resize();

      const clock = new THREE.Clock();
      let frame = 0;
      const animate = () => {
        const delta = Math.min(clock.getDelta(), 0.05);
        if (autoRotateRef.current && !dragging) targetRotationY += delta * 0.16;
        satellite.rotation.x = THREE.MathUtils.lerp(satellite.rotation.x, targetRotationX, 0.08);
        satellite.rotation.y = THREE.MathUtils.lerp(satellite.rotation.y, targetRotationY, 0.08);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, zoomTarget, 0.08);
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(animate);
      };
      animate();

      return () => {
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        renderer.dispose();
        body.geometry.dispose();
        seam.geometry.dispose();
        hatch.geometry.dispose();
        centerCap.geometry.dispose();
        boltGeometry.dispose();
        metal.dispose();
        darkMetal.dispose();
        rodMetal.dispose();
        mount.removeChild(renderer.domElement);
      };
    }, []);

    return (
      <div
        ref={mountRef}
        className="sputnik-canvas"
        role="img"
        aria-label="可拖动旋转和缩放的斯普特尼克一号三维模型"
      />
    );
  },
);
