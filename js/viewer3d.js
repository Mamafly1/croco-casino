// Visualiseur 3D (three.js) pour les armes qui ont un vrai modèle dans models/.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let manifest = null;
const gltfCache = new Map();
const texCache = new Map();

export async function loadManifest() {
  if (!manifest) manifest = await fetch('models/models.json').then((r) => r.json());
  return manifest;
}

// « AK-47 | Asiimov » -> modèle à afficher ; null si l'arme n'a pas de modèle (couteaux, gants…)
// Géométrie officielle de Valve ; texture du skin si on l'a (exact = true), sinon métal nu.
export async function modelFor(name) {
  const m = await loadManifest();
  const [weapon, skin = ''] = name.replace(/^★\s*/, '').split(' | ');
  const file = m.valve[weapon];
  if (!file) return null;
  const texture = (m.skins[weapon] && m.skins[weapon][skin]) || null;
  return { weapon, skin, url: `models/valve/${file}.glb`, texture, exact: !!texture };
}

function loadGLTF(url) {
  if (!gltfCache.has(url)) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    gltfCache.set(url, loader.loadAsync(url));
  }
  return gltfCache.get(url);
}
function loadTex(path) {
  if (!texCache.has(path)) {
    texCache.set(path, new THREE.TextureLoader().loadAsync(path).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; }));
  }
  return texCache.get(path);
}

// Monte le modèle dans `host` et renvoie une fonction pour tout libérer.
export async function mount(host, info, accent = '#ffbf17') {
  const gltf = await loadGLTF(info.url);
  const tex = info.texture ? await loadTex(info.texture) : null;
  const model = gltf.scene.clone(true);

  model.traverse((o) => {
    if (!o.isMesh) return;
    if (tex) {
      o.material = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.55 });
    } else if (!info.exact) {
      // Skin dont on n'a pas la texture : on montre l'arme nue plutôt qu'un faux motif
      o.material = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a6a64').lerp(new THREE.Color(accent), 0.06), metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = 10 / Math.max(size.x, size.y, size.z);
  model.scale.multiplyScalar(s);
  model.position.sub(center.multiplyScalar(s));
  const pivot = new THREE.Group();
  pivot.add(model);
  // On présente l'arme de profil : son axe le plus long à l'horizontale
  if (size.z > size.x) pivot.rotation.y = Math.PI / 2;

  const scene = new THREE.Scene();
  scene.add(pivot);
  scene.add(new THREE.HemisphereLight(0xf0f0e6, 0x2c2c2c, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(6, 8, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.6); rim.position.set(-8, 3, -8); scene.add(rim);

  const w = host.clientWidth || 400, h = host.clientHeight || 300;
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  // Recule la caméra pour que l'arme (10 unités de long) tienne dans la largeur avec une marge
  const fit = (aspect) => {
    const hf = 2 * Math.atan(Math.tan((35 * Math.PI) / 360) * aspect);
    const d = Math.max(9, (5 * 1.25) / Math.tan(hf / 2) + 1.5);
    camera.position.set(0, d * 0.14, d);
  };
  fit(w / h);
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
  controls.maxDistance = 40;
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 2.2;

  let raf = 0;
  const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();
  const onResize = () => {
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); fit(W / H);
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
