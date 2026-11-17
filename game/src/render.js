// Renderer, scene, camera and lights. One place, so the game never touches
// three.js setup directly.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 20, 70);
  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 120);
  camera.rotation.order = 'YXZ';
  return camera;
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0x4a6aa8, 0x141028, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0x9db8ff, 0.9);
  dir.position.set(12, 22, 8);
  scene.add(dir);
  const cyan = new THREE.PointLight(0x19e6ff, 90, 38, 1.7);
  cyan.position.set(-14, 6, -14);
  scene.add(cyan);
  const magenta = new THREE.PointLight(0xff2bd6, 90, 38, 1.7);
  magenta.position.set(14, 6, 14);
  scene.add(magenta);
  return { hemi, dir, cyan, magenta };
}

export function resize(renderer, camera) {
  const w = window.innerWidth; const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
