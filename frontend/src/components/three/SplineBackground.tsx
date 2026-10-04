import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SplineLoader from '@splinetool/loader';
import gsap from 'gsap';

interface Props {
  isLogged: boolean;
}

export default function SplineBackground({ isLogged }: Props) {
  const mountRef     = useRef<HTMLDivElement>(null);
  const sceneRef     = useRef(new THREE.Scene());
  const particlesRef = useRef<THREE.Mesh[]>([]);

  /* ── Init Three.js once ─────────────────────────────────── */
  useEffect(() => {
    if (!mountRef.current) return;

    const camera = new THREE.OrthographicCamera(
      window.innerWidth / -2, window.innerWidth / 2,
      window.innerHeight / 2, window.innerHeight / -2,
      -50000, 10000
    );
    camera.position.set(0, 0, 0);
    camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    const loader = new SplineLoader();
    loader.load(
      'https://prod.spline.design/I0-LjT34yFP7ogXH/scene.splinecode',
      (splineScene: THREE.Object3D) => {
        sceneRef.current.add(splineScene);

        splineScene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.userData.originalPos = mesh.position.clone();
            mesh.position.x += (Math.random() - 0.5) * 400;
            mesh.position.y += (Math.random() - 0.5) * 400;
            particlesRef.current.push(mesh);
          }
        });
      }
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.125;
    controls.enableZoom     = false;
    controls.enableRotate   = false;
    controls.enablePan      = false;

    const animate = (time: number) => {
      const t = time * 0.001;

      if (!isLoggedRef.current) {
        particlesRef.current.forEach((p, i) => {
          p.position.x += Math.sin(t + i) * 0.5;
          p.position.y += Math.cos(t + i) * 0.5;
        });
      }

      controls.update();
      renderer.render(sceneRef.current, camera);
    };

    renderer.setAnimationLoop(animate);

    const handleResize = () => {
      camera.left   = window.innerWidth / -2;
      camera.right  = window.innerWidth / 2;
      camera.top    = window.innerHeight / 2;
      camera.bottom = window.innerHeight / -2;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Keep isLogged accessible inside animation loop ────── */
  const isLoggedRef = useRef(isLogged);
  useEffect(() => {
    isLoggedRef.current = isLogged;
  }, [isLogged]);

  /* ── Trigger GSAP assembly animation when isLogged → true ─ */
  useEffect(() => {
    if (!isLogged || particlesRef.current.length === 0) return;

    particlesRef.current.forEach((p) => {
      gsap.to(p.position, {
        x: p.userData.originalPos.x,
        y: p.userData.originalPos.y,
        z: p.userData.originalPos.z,
        duration: 2.5,
        ease: 'expo.inOut',
      });
      gsap.to(p.rotation, {
        x: 0, y: 0, z: 0,
        duration: 2,
      });
    });
  }, [isLogged]);

  return (
    <div
      ref={mountRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    />
  );
}
