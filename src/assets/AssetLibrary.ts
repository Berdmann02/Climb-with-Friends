import { Group, Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Group>>();
/** Instances share geometry/materials. Clone a material before recoloring. */
export async function loadAsset(name: string): Promise<Group> {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`/assets/${name}.glb`).then(gltf => {
    gltf.scene.traverse(object => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return gltf.scene;
  }));
  return (await cache.get(name)!).clone(true);
}
export async function preloadAssets(): Promise<void> {
  await Promise.all(['jug','crimp','sloper','pinch','foothold'].map(type => loadAsset(`hold-${type}`)));
}
