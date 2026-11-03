// Visualiseur 3D (three.js) des caisses : le vrai modèle du jeu, avec ses textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let manifest = null;

// Id de caisse -> adresse du modèle ; null si elle n'a pas de modèle
export async function caseModel(id) {
  if (!manifest) manifest = await fetch('models/cases.json').then((r) => r.json());
  return manifest[id] ? `models/cases/${manifest[id]}.glb` : null;
}

// Monte le modèle dans `host` et renvoie une fonction pour tout libérer.
export async function mount(host, url) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = 10 / Math.max(size.x, size.y, size.z);
  model.scale.multiplyScalar(s);
  model.position.sub(center.multiplyScalar(s));

  const scene = new THREE.Scene();
  scene.add(model);
  scene.add(new THREE.HemisphereLight(0xf0f0e6, 0x2c2c2c, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(6, 8, 10); scene.add(key);

  const w = host.clientWidth || 180, h = host.clientHeight || 135;
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  camera.position.set(0, 3, 19);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // Téléphone : moins de pixels, pour ménager la carte graphique (la 3D du skin tourne aussi sur la page)
  renderer.setPixelRatio(Math.min(matchMedia('(pointer: coarse)').matches ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 2.2;

  // On ne dessine que si la caisse est à l'écran, l'onglet visible et rien n'est posé par-dessus (setPaused)
  let raf = 0, onScreen = true, paused = false;
  const loop = () => { raf = 0; controls.update(); renderer.render(scene, camera); if (running()) raf = requestAnimationFrame(loop); };
  const running = () => onScreen && !paused && !document.hidden;
  const wake = () => { if (running() && !raf) raf = requestAnimationFrame(loop); };
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); });
  io.observe(host);
  document.addEventListener('visibilitychange', wake);
  // Si le téléphone retire la 3D (mémoire graphique pleine), on revient à l'image de la caisse
  renderer.domElement.addEventListener('webglcontextlost', () => { host.classList.remove('on'); renderer.domElement.style.display = 'none'; });
  loop();

  const dispose = () => {
    cancelAnimationFrame(raf); raf = 0; paused = true;
    io.disconnect();
    document.removeEventListener('visibilitychange', wake);
    controls.dispose();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const v of Object.values(o.material)) if (v && v.isTexture) v.dispose();
      o.material.dispose();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  dispose.setPaused = (b) => { paused = b; if (b) { cancelAnimationFrame(raf); raf = 0; } else wake(); };
  return dispose;
}
