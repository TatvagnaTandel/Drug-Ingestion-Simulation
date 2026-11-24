/**
 * The simulator's anatomy scene: the model, framed on the organs a condition
 * touches.
 *
 * The landing figure shows the whole body turning. The simulator does the
 * opposite: the body is still, and the camera moves to whichever organ the
 * current step is about, so the folds and the vessels are readable.
 *
 * The organ levels are the engine's own numbers — the concentration in the
 * blood, the amount in the gut, the elimination rate — read at the time the
 * dial is on. Nothing here invents a value.
 */

import * as THREE from "three";
import { disposeAnatomyModel, loadAnatomyModel, type LoadedAnatomy, type PartAnchor } from "@/components/anatomy/model";
import { ATLAS_TINT, BASE, baseFor, isolationOf, type IsolationGroup } from "@/components/anatomy/contract";
import { ATLAS_FOV, ATLAS_KEY_LIGHT, ORGAN_VIEWS, OVERVIEW_VIEW, RENAL_OCCLUDERS, frameAtlas, positionAtlasCamera } from "@/components/anatomy/atlas-view";
import {
  BODY_FRAGMENT,
  BODY_VERTEX,
  BRAIN_FRAGMENT,
  BRAIN_VERTEX,
  ORGAN_FRAGMENT,
  ORGAN_VERTEX,
} from "@/components/anatomy/shaders";
import { regionOf, type BrainRegion } from "@/components/anatomy/regions";
import { BRAIN_PART_NAMES } from "@/components/anatomy/part-names";
import { manageViewport, type SceneStatus } from "@/components/anatomy/viewport-runtime";

/** The organs the simulator can focus on. */
export type FocusOrgan = IsolationGroup;

export type SimulatorSceneOptions = {
  onStatus?: (status: SceneStatus) => void;
  /** Called when the pointer lands on a part of the brain. */
  onBrainRegion?: (region: BrainRegion | null) => void;
  /** Called when the pointer lands on any organ, for its live data readout. */
  onOrganHover?: (hover: { organ: FocusOrgan; x: number; y: number } | null) => void;
};

export type SimulatorScene = {
  /** The organ levels, by organ, from 0 to 1. */
  setLevels(levels: Record<string, number>): void;
  /** Lights the organ the walkthrough is about. */
  setFocus(organ: FocusOrgan | null): void;
  /**
   * Shows one organ on its own: the body and everything else fades out,
   * and that organ stays. Passing null brings the whole body back.
   */
  setIsolation(organ: FocusOrgan | null): void;
  subscribeFrame(notify: () => void): () => void;
  /** Moves the camera to an organ, or back to the whole body for null. */
  focusOrgan(organ: FocusOrgan | null, immediate?: boolean): void;
  /** Where the focused organ is on the canvas, in CSS pixels. */
  getFocusPoint(): { x: number; y: number } | null;
  /** The brain region under the pointer, and where it is on the canvas. */
  getBrainRegion(): { region: BrainRegion; x: number; y: number } | null;
  /** Shows the model's failed state (pale tissue, no drug tint). */
  setDead(dead: boolean): void;
  setTheme(theme: "light" | "dark"): void;
  /** Whether the model has loaded. */
  isReady(): boolean;
  dispose(): void;
};

/**
 * The 3D scene follows the Organ Lab's scoped theme.
 *
 * The dead palette is shared by both themes: tissue goes pale and the drug
 * tint is dropped, so a failed model reads at a glance.
 */
type Palette = {
  body: number;
  tint: number;
  brain: number;
};
const PALETTES: Record<"light" | "dark" | "dead", Palette> = {
  dark: {
    body: BASE.body,
    tint: ATLAS_TINT,
    brain: BASE.brain,
  },
  light: {
    body: 0x758d94,
    tint: 0x357c78,
    brain: BASE.brain,
  },
  dead: {
    body: 0x888889,
    tint: 0x888889,
    brain: 0x97827e,
  },
};

/** Raw sRGB components — custom shaders write straight to the framebuffer. */
function srgb(hex: number): THREE.Color {
  return new THREE.Color().setRGB(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
}

export function createSimulatorScene(
  canvas: HTMLCanvasElement,
  options: SimulatorSceneOptions = {}
): SimulatorScene {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const load = new AbortController();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(ATLAS_FOV, 1, 0.05, 100);
  camera.position.set(0, 0, 6.4);

  const keyLight = ATLAS_KEY_LIGHT.clone();

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: {
      uColor: { value: srgb(PALETTES.dark.body) },
      uScan: { value: 10 },
      uOpacity: { value: 0.7 },
    },
    transparent: true,
    depthWrite: false,
  });

  const brainMaterial = new THREE.ShaderMaterial({
    vertexShader: BRAIN_VERTEX,
    fragmentShader: BRAIN_FRAGMENT,
    uniforms: {
      uBase: { value: srgb(PALETTES.dark.brain) },
      uTint: { value: srgb(PALETTES.dark.tint) },
      uFocus: { value: 0 },
      uLightDir: { value: keyLight },
      uLightIntensity: { value: 0.95 },
      uFade: { value: 1 },
    },
  });

  const organMaterials = new Map<string, THREE.ShaderMaterial>();
  const makeOrganMaterial = (name: string): THREE.ShaderMaterial => {
    const existing = organMaterials.get(name);
    if (existing) return existing;
    const material = new THREE.ShaderMaterial({
      vertexShader: ORGAN_VERTEX,
      fragmentShader: ORGAN_FRAGMENT,
      uniforms: {
        uBase: { value: srgb(baseFor(name)) },
        uTint: { value: srgb(PALETTES.dark.tint) },
        uLevel: { value: 0 },
        uFocus: { value: 0 },
        // The camera is close enough here that the organ has to stay
        // recognisable, so the drug shows as brightness and a rim rather
        // than repainting the tissue.
        uTintMix: { value: 0.12 },
        uLightDir: { value: keyLight },
        uLightIntensity: { value: 0.95 },
        uFade: { value: 1 },
      },
    });
    organMaterials.set(name, material);
    return material;
  };

  // The model, once it has loaded.
  let figureBounds: THREE.Box3 | null = null;
  let anchors = new Map<string, PartAnchor>();
  let model: LoadedAnatomy | null = null;
  let tinted: LoadedAnatomy["tinted"] = [];
  let brainTargets: THREE.Mesh[] = [];
  /** Meshes grouped by the organ they belong to, for hover picking. */
  let organTargets = new Map<FocusOrgan, THREE.Mesh[]>();
  let ready = false;
  let theme: "light" | "dark" = "dark";
  let dead = false;

  // Camera state. The body is centred at the origin, so an un-focused camera
  // sits on the axis.
  const target = new THREE.Vector3(0, 0, 0);
  const wantedTarget = new THREE.Vector3(0, 0, 0);
  let wantedDistance = 6.4;
  let distance = 6.4;
  let azimuth = 0;
  let wantedAzimuth = 0;
  let wantedFov = ATLAS_FOV;
  const cameraFrom = target.clone();
  let distanceFrom = distance;
  let azimuthFrom = azimuth;
  let fovFrom = ATLAS_FOV;
  let cameraSeconds = OVERVIEW_VIEW.seconds;
  let cameraElapsed = cameraSeconds;
  let focus: FocusOrgan | null = null;
  /**
   * What the caller last asked for.
   *
   * The model arrives after the caller has already asked to focus on
   * something, so the request is kept here and applied when the anatomy
   * lands. Without this the camera would never leave its opening position.
   */
  let wantedLevels: Record<string, number> = {};
  let wantedFocus: FocusOrgan | null = null;

  /** The organ shown on its own, or null for the whole body. */
  let isolation: IsolationGroup | null = null;
  /** Current and wanted fade for each visual group, eased per frame. */
  const fades: Record<"body" | IsolationGroup, number> = {
    body: 1,
    brain: 1,
    heart: 1,
    lungs: 1,
    liver: 1,
    kidneys: 1,
    gut: 1,
  };
  const fadeTargets = { ...fades };
  /** The isolation asked for before the anatomy lands. */
  let wantedIsolation: IsolationGroup | null = null;
  const groupMaterials = new Map<IsolationGroup, THREE.ShaderMaterial[]>();
  /** What each isolation group occupies, in the model's space. */
  const isolationBounds = new Map<IsolationGroup, THREE.Box3>();

  /** Aims the fades at the wanted isolation. */
  function applyIsolation(organ: IsolationGroup | null): void {
    isolation = organ;
    for (const key of Object.keys(fadeTargets) as Array<keyof typeof fadeTargets>) {
      fadeTargets[key] = !organ || key === organ ? 1 : 0;
    }
  }

  function applyFade(material: THREE.ShaderMaterial, fade: number): void {
    material.uniforms.uFade.value = fade;
    material.transparent = fade < 1;
    material.depthWrite = fade === 1;
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let brainRegion: BrainRegion | null = null;
  /** Where the brain part under the pointer is, in canvas pixels. */
  let brainPoint: { x: number; y: number } | null = null;
  /** The organ under the pointer and its canvas position, for hover data. */
  let organHover: { organ: FocusOrgan; x: number; y: number } | null = null;

  /** A world point, in canvas pixels. */
  function project(world: THREE.Vector3): { x: number; y: number } {
    const point = world.clone().project(camera);
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    return {
      x: (point.x * 0.5 + 0.5) * width,
      y: (-point.y * 0.5 + 0.5) * height,
    };
  }

  /** Reads the anatomical name out of a mesh name: "Cortex_FMA72653_R". */
  function partName(meshName: string): { id: string; name: string } | null {
    const match = /^(?:Cortex|Deep)_(FMA\d+|BP\d+)_[LRM]$/.exec(meshName);
    if (!match) return null;
    const id = match[1];
    const name = BRAIN_PART_NAMES[id];
    return name ? { id, name } : null;
  }

  function pickBrain(clientX: number, clientY: number): void {
    if (!ready || brainTargets.length === 0 || (isolation && isolation !== "brain")) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(brainTargets, false);
    let found: BrainRegion | null = null;
    let point: THREE.Vector3 | null = null;
    for (const hit of hits) {
      const part = partName(hit.object.name);
      if (!part) continue;
      const region = regionOf(part.id, part.name);
      if (!region) continue;
      found = region;
      point = hit.point.clone();
      break;
    }
    brainRegion = found;
    brainPoint = point ? project(point) : null;
    options.onBrainRegion?.(found);
  }

  function clearBrain(): void {
    if (!brainRegion) return;
    brainRegion = null;
    brainPoint = null;
    options.onBrainRegion?.(null);
  }

  /** Picks any organ mesh, not just the brain, for the live hover readout. */
  function pickOrgan(clientX: number, clientY: number): void {
    if (!ready || organTargets.size === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const candidates = isolation
      ? organTargets.get(isolation) ?? []
      : [...organTargets.values()].flat();
    const hits = raycaster.intersectObjects(candidates.filter((mesh) => mesh.visible), false);
    let next: { organ: FocusOrgan; x: number; y: number } | null = null;
    for (const hit of hits) {
      for (const [organ, meshes] of organTargets) {
        if (!meshes.includes(hit.object as THREE.Mesh)) continue;
        const point = project(hit.point.clone());
        next = { organ, x: point.x, y: point.y };
        break;
      }
      if (next) break;
    }
    organHover = next;
    options.onOrganHover?.(next);
  }

  function clearOrgan(): void {
    if (!organHover) return;
    organHover = null;
    options.onOrganHover?.(null);
  }

  const onPointerMove = (event: PointerEvent) => {
    pickBrain(event.clientX, event.clientY);
    pickOrgan(event.clientX, event.clientY);
  };
  const onPointerLeave = () => {
    clearBrain();
    clearOrgan();
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  let focusValue = 0;
  let wantedFocusValue = 0;

  function frame(dt: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      target.copy(wantedTarget);
      distance = wantedDistance;
      azimuth = wantedAzimuth;
      camera.fov = wantedFov;
      focusValue = wantedFocusValue;
    } else {
      cameraElapsed = Math.min(cameraSeconds, cameraElapsed + dt);
      const t = cameraElapsed / cameraSeconds;
      const eased = t * t * (3 - 2 * t);
      target.lerpVectors(cameraFrom, wantedTarget, eased);
      distance = THREE.MathUtils.lerp(distanceFrom, wantedDistance, eased);
      azimuth = THREE.MathUtils.lerp(azimuthFrom, wantedAzimuth, eased);
      camera.fov = THREE.MathUtils.lerp(fovFrom, wantedFov, eased);
      // The organ lights as the camera arrives, rather than the instant the
      // step changes.
      focusValue += (wantedFocusValue - focusValue) * (1 - Math.pow(0.001, dt));
    }

    // The isolation fades, in the same ease as the camera.
    if (reducedMotion) {
      Object.assign(fades, fadeTargets);
    } else {
      const fadeRate = 1 - Math.pow(0.0015, dt);
      for (const key of Object.keys(fades) as Array<keyof typeof fades>) {
        const next = THREE.MathUtils.lerp(fades[key], fadeTargets[key], fadeRate);
        fades[key] = Math.abs(next - fadeTargets[key]) < 0.002 ? fadeTargets[key] : next;
      }
    }
    bodyMaterial.uniforms.uOpacity.value = fades.body * THREE.MathUtils.lerp(
      0.56, 0.82, THREE.MathUtils.smoothstep(distance, 2, 5.5),
    );
    applyFade(brainMaterial, fades.brain);
    for (const [group, materials] of groupMaterials) {
      for (const material of materials) {
        applyFade(material, fades[group]);
      }
    }
    // The focus value drives the shader, so the organ brightens with the
    // camera rather than snapping ahead of it.
    for (const { id, material, mesh } of tinted) {
      const wanted = wantedFocus === "kidneys" ? isolationOf(mesh.name) === wantedFocus : wantedFocus === id;
      material.uniforms.uFocus.value = wanted ? focusValue : 0;
    }
    brainMaterial.uniforms.uFocus.value = wantedFocus === "brain" ? focusValue : 0;

    camera.updateProjectionMatrix();
    positionAtlasCamera(camera, target, azimuth, distance);
    keyLight.copy(ATLAS_KEY_LIGHT).applyQuaternion(camera.quaternion);

    renderer.render(scene, camera);
  }

  const viewport = manageViewport(canvas, renderer, camera, "lab",
    () => applyFraming(focus, true), frame, () => options.onStatus?.("error"));
  canvas.dataset.anatomyScene = "lab";

  options.onStatus?.("loading");
  void loadAnatomyModel(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/models/human_anatomy_simulator.glb`,
    { body: bodyMaterial, brain: brainMaterial, organ: makeOrganMaterial },
    (error) => console.error("Simulator anatomy could not be loaded", error),
    load.signal,
  )
    .then((loaded) => {
      if (load.signal.aborted) {
        disposeAnatomyModel(loaded.group, loaded.materials);
        return;
      }
      model = loaded;
      figureBounds = loaded.bounds;
      anchors = loaded.anchors;
      tinted = loaded.tinted;
      brainTargets = loaded.brainTargets;
      // Group the organ meshes so a pointer hit can name the organ. The brain
      // has its own fine-grained picking, so it is not duplicated here.
      organTargets = new Map<FocusOrgan, THREE.Mesh[]>();
      for (const [name, mesh] of loaded.meshes) {
        const group = isolationOf(name);
        if (!group || group === "brain") continue;
        const list = organTargets.get(group) ?? [];
        list.push(mesh);
        organTargets.set(group, list);
      }
      // Frame the isolation around everything the isolation shows: a UNION
      // box per visual group, from the nodes themselves.
      for (const [name, mesh] of loaded.meshes) {
        const group = isolationOf(name);
        if (!group) continue;
        const box = mesh.geometry.boundingBox;
        if (!box) continue;
        const world = box.clone().applyMatrix4(mesh.matrixWorld);
        const acc = isolationBounds.get(group);
        if (acc) acc.union(world);
        else isolationBounds.set(group, world);
      }
      // Bucket the organ materials by the visual group they isolate with,
      // so the fade loop can reach each in one pass.
      for (const [name, material] of organMaterials) {
        const group = isolationOf(name);
        if (!group) continue;
        const list = groupMaterials.get(group);
        if (list) list.push(material);
        else groupMaterials.set(group, [material]);
      }
      if (wantedIsolation) applyIsolation(wantedIsolation);
      applyPalette();
      scene.add(loaded.group);
      ready = true;
      // The caller asked for a framing before the anatomy was here. Apply it
      // now, or the camera would never move.
      applyLevels(wantedLevels);
      applyFocus(wantedFocus);
      applyFraming(wantedIsolation ?? focus ?? wantedFocus, true);
      options.onStatus?.("ready");
    })
    .catch(() => {
      if (!load.signal.aborted) options.onStatus?.("error");
    });

  /** Re-colour the model for the active theme and the failed/alive state. */
  function applyPalette(): void {
    const palette = PALETTES[dead ? "dead" : theme];
    bodyMaterial.uniforms.uColor.value = srgb(palette.body);
    brainMaterial.uniforms.uBase.value = srgb(palette.brain);
    brainMaterial.uniforms.uTint.value = srgb(palette.tint);
    for (const [name, material] of organMaterials) {
      material.uniforms.uBase.value = srgb(dead ? palette.body : baseFor(name));
      material.uniforms.uTint.value = srgb(palette.tint);
    }
  }

  function setTheme(next: "light" | "dark"): void {
    theme = next;
    applyPalette();
  }

  function applyLevels(levels: Record<string, number>): void {
    for (const { id, material } of tinted) {
      const value = levels[id];
      material.uniforms.uLevel.value =
        value === undefined ? 0 : Math.min(1, Math.max(0, value));
    }
  }

  function applyFocus(organ: FocusOrgan | null): void {
    // The organ the walkthrough is about burns brighter than the ones it is
    // passing. The brain is one material for all 64 of its parts, so it is
    // lit as a whole. The value itself is eased in the frame loop, so the
    // organ lights as the camera arrives.
    wantedFocusValue = organ ? 1 : 0;
    if (motion.matches) focusValue = wantedFocusValue;
  }

  function applyFraming(organ: FocusOrgan | null, immediate: boolean): void {
    focus = organ;
    const bounds = (isolation && isolationBounds.get(isolation)) ||
      (organ && anchors.get(organ)?.bounds) || figureBounds;
    if (!bounds) return;
    const view = organ ? ORGAN_VIEWS[organ] : OVERVIEW_VIEW;
    for (const name of RENAL_OCCLUDERS) {
      const mesh = model?.meshes.get(name);
      if (mesh) mesh.visible = organ !== "kidneys";
    }
    cameraFrom.copy(target);
    distanceFrom = distance;
    azimuthFrom = azimuth;
    fovFrom = camera.fov;
    cameraSeconds = view.seconds;
    cameraElapsed = immediate || motion.matches ? cameraSeconds : 0;
    wantedAzimuth = view.azimuth;
    wantedFov = view.fov;
    bounds.getCenter(wantedTarget);
    wantedDistance = frameAtlas(bounds, wantedTarget, wantedAzimuth, camera.aspect, wantedFov);
    if (cameraElapsed === cameraSeconds) {
      target.copy(wantedTarget);
      distance = wantedDistance;
      azimuth = wantedAzimuth;
      camera.fov = wantedFov;
      camera.updateProjectionMatrix();
      positionAtlasCamera(camera, target, azimuth, distance);
    }

  }

  return {
    setTheme,

    setLevels(levels) {
      wantedLevels = levels;
      applyLevels(levels);
    },

    setFocus(organ) {
      wantedFocus = organ;
      applyFocus(organ);
    },

    setIsolation(organ) {
      const effective: IsolationGroup | null = organ;
      const changed = effective !== (isolation ?? null);
      wantedIsolation = effective;
      // The fades are eased in the frame loop; only kick if the anatomy
      // is there, or aim it at the load. Re-frame so the organ fills the
      // stage — or the whole body comes back.
      if (ready) {
        applyIsolation(effective);
        if (changed) {
          clearBrain();
          clearOrgan();
          applyFraming(effective ?? wantedFocus, false);
        }
      }
    },

    subscribeFrame: viewport.subscribeFrame,

    focusOrgan(organ, immediate = false) {
      applyFraming(organ, immediate);
    },

    getFocusPoint() {
      if (!focus) return null;
      const anchor = anchors.get(focus);
      if (!anchor) return null;
      const point = anchor.centre.clone().project(camera);
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      return {
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
      };
    },

    getBrainRegion() {
      if (!brainRegion || !brainPoint) return null;
      return { region: brainRegion, x: brainPoint.x, y: brainPoint.y };
    },

    setDead(next) {
      dead = next;
      applyPalette();
    },

    isReady() {
      return ready;
    },

    dispose() {
      viewport.dispose(() => {
        load.abort();
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerleave", onPointerLeave);
        clearBrain();
        clearOrgan();
        const materials = [bodyMaterial, brainMaterial, ...organMaterials.values()];
        if (model) disposeAnatomyModel(model.group, materials);
        else for (const material of materials) material.dispose();
        scene.clear();
        model = null;
        anchors.clear();
        brainTargets = [];
        tinted = [];
        organMaterials.clear();
        organTargets.clear();
        groupMaterials.clear();
        isolationBounds.clear();
      });
    },
  };
}
