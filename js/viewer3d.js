// Visualiseur 3D (three.js) pour les armes qui ont un vrai modèle dans models/.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let manifest = null;
const gltfCache = new Map();
const texCache = new Map();

export async function loadManifest() {
  if (!manifest) manifest = await fetch('models/models.json').then((r) => r.json());
  return manifest;
}

// « AK-47 | Asiimov » -> { weapon, skin, entry, texture } ; null si aucun modèle
export async function modelFor(name) {
  const m = await loadManifest();
  const [weapon, skin = ''] = name.split(' | ');
  const entry = m.weapons[weapon];
  if (!entry) return null;
  const has = Object.prototype.hasOwnProperty.call(entry.skins, skin);
  return { weapon, skin, entry, texture: has ? entry.skins[skin] : null, exact: has, credit: m.credits.find((c) => c.model === weapon) };
}

function loadGLTF(dir) {
  if (!gltfCache.has(dir)) gltfCache.set(dir, new GLTFLoader().loadAsync(`models/${dir}/scene.gltf`));
  return gltfCache.get(dir);
}
function loadTex(path) {
  if (!texCache.has(path)) {
    texCache.set(path, new THREE.TextureLoader().loadAsync(path).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; }));
  }
  return texCache.get(path);
}

// Monte le modèle dans `host` et renvoie une fonction pour tout libérer.
export async function mount(host, info, accent = '#ffbf17') {
  const gltf = await loadGLTF(info.entry.dir);
  const tex = info.texture ? await loadTex(`models/${info.entry.dir}/textures/${info.texture}`) : null;
  const model = gltf.scene.clone(true);

  model.traverse((o) => {
    if (!o.isMesh) return;
    if (tex) {
      o.material = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.55 });
    } else if (!info.exact) {
      // Skin dont on n'a pas la texture : on montre l'arme nue plutôt qu'un faux motif
      o.material = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5d5d58').lerp(new THREE.Color(accent), 0.18), metalness: 0.55, roughness: 0.42 });
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = 10 / Math.max(size.x, size.y, size.z);
  model.scale.multiplyScalar(s);
  model.position.sub(center.multiplyScalar(s));
  const pivot = new THREE.Group();
  pivot.add(model);

  const scene = new THREE.Scene();
  scene.add(pivot);
  scene.add(new THREE.HemisphereLight(0xf0f0e6, 0x181818, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 8, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.6); rim.position.set(-8, 3, -8); scene.add(rim);

  const w = host.clientWidth || 400, h = host.clientHeight || 300;
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  camera.position.set(0, 1.5, 15);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'gl';
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 26;
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 2.2;

  let raf = 0;
  const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();
  const onResize = () => {
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
  };
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    model.traverse((o) => { if (o.isMesh && o.material && !info.exact) o.material.dispose(); });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
