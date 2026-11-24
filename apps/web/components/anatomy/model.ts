/**
 * Loading the anatomy model.
 *
 * One loader for both the landing figure and the simulator: the GLB, its
 * materials, where each organ sits and how big it is. Two scenes that load the
 * model differently is how a model ends up looking like two models.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FOLLOW, GLB, ORGAN_NODES, isBrainMesh } from "./contract";
import type { OrganId } from "@/components/landing/dial";

/** The world height the model is normalised to. */
export const FIGURE_HEIGHT = 3.05;

/** Where a named part of the body sits, and how big it is. */
export type PartAnchor = {
  /** The centre of the part, in the model's own space. */
  centre: THREE.Vector3;
  /** Half the size of the part's bounding box, in the model's own space. */
  radius: number;
  bounds: THREE.Box3;
};

/**
 * The materials the model is drawn with.
 *
 * The organ material is a factory because each organ gets its own instance:
 * they carry independent level uniforms.
 */
export type AnatomyMaterials = {
  body: THREE.Material;
  brain: THREE.Material;
  /** The material for one organ node, by name. It carries a `uLevel` uniform,
   *  which the scene sets to show how much drug is in that organ. */
  organ: (name: string) => THREE.ShaderMaterial;
};

export type LoadedAnatomy = {
  /** The model, ready to be added to a scene. */
  group: THREE.Group;
  /** Every mesh, by node name. */
  meshes: Map<string, THREE.Mesh>;
  /** The meshes that follow a dial organ, with their materials. */
  tinted: Array<{ mesh: THREE.Mesh; id: OrganId; material: THREE.ShaderMaterial }>;
  /** The brain meshes a click can land on. */
  brainTargets: THREE.Mesh[];
  /** Where each organ sits. */
  anchors: Map<string, PartAnchor>;
  /** The whole figure's normalized bounds. */
  bounds: THREE.Box3;
  /** Triangles in the model. */
  triangles: number;
  /**
   * The normalisation the loader applied: the model was scaled by `scale` and
   * moved up by `offsetY` so its centre sits at the origin.
   *
   * Anything authored in the model's own units — the landing's circulating
   * particles, for one — needs the same transform to land in the same place
   * as the anatomy.
   */
  scale: number;
  offsetY: number;
  /** The materials, so the caller can dispose of them. */
  materials: THREE.Material[];
};

function nodeMaterials(node: THREE.Mesh): THREE.Material[] {
  return Array.isArray(node.material) ? node.material : [node.material];
}

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const values: unknown[] = Object.values(material);
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) values.push(uniform.value);
  }
  return values.flat().filter((value) => value instanceof THREE.Texture);
}

function releaseMaterials(materials: Iterable<THREE.Material>, keep: Iterable<THREE.Material> = []) {
  const keptTextures = new Set([...keep].flatMap(materialTextures));
  const textures = new Set([...materials].flatMap(materialTextures));
  const images = new Set<unknown>();
  for (const texture of textures) {
    if (keptTextures.has(texture)) continue;
    images.add(texture.image);
    texture.dispose();
  }
  for (const image of images) {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  }
  for (const material of materials) material.dispose();
}

export function disposeAnatomyModel(group: THREE.Group, extras: Iterable<THREE.Material> = []) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set(extras);
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of nodeMaterials(node)) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  releaseMaterials(materials);
  group.removeFromParent();
  group.clear();
}

/** Loads the atlas and measures its anchors before the scene rotates it. */
export async function loadAnatomyModel(
  url: string,
  materials: AnatomyMaterials,
  onError: (error: unknown) => void,
  signal?: AbortSignal,
): Promise<LoadedAnatomy> {
  const loader = new GLTFLoader();
  let gltf: Awaited<ReturnType<GLTFLoader["loadAsync"]>>;
  try {
    if (signal) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Anatomy asset returned HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      signal.throwIfAborted();
      gltf = await loader.parseAsync(bytes, loader.resourcePath || new URL(".", response.url || new URL(url, window.location.href)).href);
      if (signal.aborted) {
        disposeAnatomyModel(gltf.scene);
        signal.throwIfAborted();
      }
    } else {
      gltf = await loader.loadAsync(url);
    }
  } catch (error) {
    if (!signal?.aborted) onError(error);
    throw error;
  }
  const group = gltf.scene;
  const imported = new Set<THREE.Material>();
  const meshes = new Map<string, THREE.Mesh>();
  const tinted: LoadedAnatomy["tinted"] = [];
  const brainTargets: THREE.Mesh[] = [];
  const anchors = new Map<string, PartAnchor>();
  const used: THREE.Material[] = [materials.body, materials.brain];

  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!meshes.has(node.name)) meshes.set(node.name, node);
    for (const material of nodeMaterials(node)) imported.add(material);
  });

  // The body is the glass shell; organs and the brain get their own
  // materials.
  const body = meshes.get(GLB.body);
  if (body) {
    body.material = materials.body;
    body.renderOrder = 3;
    body.castShadow = false;
    body.receiveShadow = false;
  }

  for (const [name, id] of Object.entries(FOLLOW) as Array<[string, OrganId]>) {
    const mesh = meshes.get(name);
    if (!mesh) continue;
    const material = materials.organ(name);
    used.push(material);
    mesh.material = material;
    mesh.renderOrder = 2;
    tinted.push({ mesh, id, material });
  }

  for (const [name, mesh] of meshes) {
    if (isBrainMesh(name)) {
      mesh.material = materials.brain;
      mesh.renderOrder = 2;
    }
  }

  // The airway is not drug-bearing: it keeps the organ material at
  // level zero.
  for (const name of GLB.airway) {
    const mesh = meshes.get(name);
    if (!mesh) continue;
    const material = materials.organ(name);
    used.push(material);
    material.uniforms.uLevel.value = 0;
    mesh.material = material;
    mesh.renderOrder = 2;
  }

  // The pickable brain: the named gyri and nuclei. The cerebellum and
  // the brainstem are in the brain visually but are not lobes, so they
  // are not pick targets.
  for (const [name, mesh] of meshes) {
    if (name.startsWith("Cortex_") || name.startsWith("Deep_")) brainTargets.push(mesh);
  }

  // Normalise: centre the model and scale it to the figure height. The
  // scale is applied to the group rather than to the scene's pivot, so
  // a caller that turns the figure turns the model and its anchors
  // together.
  const bounds = new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
  });
  const height = bounds.max.y - bounds.min.y || 1;
  const scale = FIGURE_HEIGHT / height;
  const centreY = (bounds.max.y + bounds.min.y) / 2;
  group.scale.setScalar(scale);
  group.position.y = -centreY * scale;

  let triangles = 0;
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node;
    mesh.geometry.computeBoundingBox();
    triangles += mesh.geometry.index
      ? mesh.geometry.index.count / 3
      : mesh.geometry.attributes.position.count / 3;
  });

  // Where each organ sits, in the model's normalised space — after the
  // scale and the centring above, before any rotation the caller
  // applies. A turning figure still frames correctly because the caller
  // transforms the anchor by the same matrix it transforms the model.
  //
  // The anchors come from the organ's own nodes, not from everything
  // that tints with it: the vessels carry the blood's colour but they
  // run the whole body, and folding them into the heart's anchor would
  // put the camera in the middle of the torso instead of on the heart.
  group.updateMatrixWorld(true);
  for (const [id, nodes] of Object.entries(ORGAN_NODES)) {
    const bounds = new THREE.Box3();
    for (const node of nodes) {
      const mesh = meshes.get(node);
      const box = mesh?.geometry.boundingBox;
      if (mesh && box) bounds.union(box.clone().applyMatrix4(mesh.matrixWorld));
    }
    if (!bounds.isEmpty()) {
      anchors.set(id, {
        centre: bounds.getCenter(new THREE.Vector3()),
        radius: bounds.getSize(new THREE.Vector3()).length() * 0.5,
        bounds,
      });
    }
  }
  // The brain is 64 nodes, so its anchor is the union of them.
  const brainBox = new THREE.Box3();
  for (const [name, mesh] of meshes) {
    if (!isBrainMesh(name)) continue;
    if (mesh.geometry.boundingBox) {
      brainBox.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
  }
  if (!brainBox.isEmpty()) {
    anchors.set("brain", {
      centre: brainBox.getCenter(new THREE.Vector3()),
      radius: brainBox.getSize(new THREE.Vector3()).length() * 0.5,
      bounds: brainBox,
    });
  }

  const active = new Set<THREE.Material>();
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      for (const material of nodeMaterials(node)) active.add(material);
    }
  });
  releaseMaterials([...imported].filter((material) => !active.has(material)), active);

  return {
    group,
    meshes,
    tinted,
    brainTargets,
    anchors,
    bounds: bounds.applyMatrix4(group.matrix),
    triangles,
    scale,
    offsetY: -centreY * scale,
    materials: used,
  };
}
