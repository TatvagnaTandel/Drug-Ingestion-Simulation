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
import { ATLAS_CONTEXT_FADE, ATLAS_FOV, ATLAS_KEY_LIGHT, ORGAN_VIEWS, OVERVIEW_VIEW, RENAL_OCCLUDERS, ROUTE_VIEWS, frameAtlas, guidedAtlasBounds, positionAtlasCamera } from "@/components/anatomy/atlas-view";
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
import { createDoseJourney } from "./dose-journey";
import type { DoseRoute } from "./playback";
import { manageViewport, type SceneStatus } from "@/components/anatomy/viewport-runtime";

/** The organs the simulator can focus on. */
export type FocusOrgan = "brain" | "heart" | "lungs" | "liver" | "kidneys" | "gut";

export type SimulatorSceneOptions = {
  onStatus?: (status: SceneStatus) => void;
  /** Called when the pointer lands on a part of the brain. */
  onBrainRegion?: (region: BrainRegion | null) => void;
};

export type SimulatorScene = {
  /** The organ levels, by organ, from 0 to 1. */
  setLevels(levels: Record<string, number>): void;
  /** Frames the stage and positions the dose on its route. */
  setStage(organ: FocusOrgan | null, route: DoseRoute | undefined, fraction: number, immediate: boolean): void;
  setIsolation(organ: FocusOrgan | null): void;
  subscribeFrame(notify: () => void): () => void;
  /** The brain region under the pointer, and where it is on the canvas. */
  getBrainRegion(): { region: BrainRegion; x: number; y: number } | null;
  dispose(): void;
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
  const journey = createDoseJourney(scene);
  const camera = new THREE.PerspectiveCamera(ATLAS_FOV, 1, 0.05, 100);
  camera.position.set(0, 0, 6.4);

  const keyLight = ATLAS_KEY_LIGHT.clone();
  const hemisphere = new THREE.HemisphereLight(0xfff5e5, 0x766353, 0.7);
  scene.add(hemisphere);
  const directional = new THREE.DirectionalLight(0xfff8e9, 0.95);
  scene.add(directional);

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: {
      uColor: { value: srgb(BASE.body) },
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
      uBase: { value: srgb(BASE.brain) },
      uTint: { value: srgb(ATLAS_TINT) },
      uFocus: { value: 0 },
      uLightDir: { value: keyLight },
      uLightIntensity: { value: directional.intensity },
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
        uTint: { value: srgb(ATLAS_TINT) },
        uLevel: { value: 0 },
        uFocus: { value: 0 },
        // The camera is close enough here that the organ has to stay
        // recognisable, so the drug shows as brightness and a rim rather
        // than repainting the tissue.
        uTintMix: { value: 0.12 },
        uLightDir: { value: keyLight },
        uLightIntensity: { value: directional.intensity },
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
  let ready = false;

  // Camera state. The body is centred at the origin, so an un-focused camera
  // sits on the axis.
  const target = new THREE.Vector3(0, 0, 0);
  const wantedTarget = new THREE.Vector3(0, 0, 0);
  let wantedDistance = 6.4;
  let distance = 6.4;
  /**
   * What the caller last asked for.
   *
   * The model arrives after the caller has already asked to focus on
   * something, so the request is kept here and applied when the anatomy
   * lands. Without this the camera would never leave its opening position.
   */
  let wantedLevels: Record<string, number> = {};
  let wantedFocus: FocusOrgan | null = null;
  let wantedRoute: DoseRoute | undefined;

  let azimuth = 0;
  let wantedAzimuth = 0;
  const cameraFrom = target.clone();
  let distanceFrom = distance;
  let azimuthFrom = azimuth;
  let wantedFov = ATLAS_FOV;
  let fovFrom = ATLAS_FOV;
  let cameraSeconds = OVERVIEW_VIEW.seconds;
  let cameraElapsed = cameraSeconds;
  let routeFraction = 0;

  // Each mesh fades independently while the camera frames the selected organ.
  let isolation: FocusOrgan | null = null;
  const isolatedMaterials: { material: THREE.ShaderMaterial; group: IsolationGroup | null }[] = [];
  let isolateBlend = 0;

  function updateFades(focus: FocusOrgan | null, dt: number, reducedMotion: boolean): void {
    const rate = reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);
    const target = isolation ? 1 : 0;
    isolateBlend = THREE.MathUtils.lerp(isolateBlend, target, rate);
    bodyMaterial.uniforms.uOpacity.value *= 1 - isolateBlend;
    for (const { material, group } of isolatedMaterials) {
      const wanted = focus && group !== focus ? (isolation ? 0 : ATLAS_CONTEXT_FADE) : 1;
      const next = THREE.MathUtils.lerp(material.uniforms.uFade.value, wanted, rate);
      const fade = Math.abs(next - wanted) < 0.002 ? wanted : next;
      material.uniforms.uFade.value = fade;
      material.transparent = fade < 1;
      material.depthWrite = fade === 1;
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let brainRegion: BrainRegion | null = null;
  let brainPoint: { x: number; y: number } | null = null;

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
    if (!ready || (isolation ?? wantedFocus) !== "brain" || brainTargets.length === 0) return;
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

  const onPointerMove = (event: PointerEvent) => {
    pickBrain(event.clientX, event.clientY);
  };
  const onPointerLeave = () => {
    clearBrain();
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

    bodyMaterial.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.56, 0.82,
      THREE.MathUtils.smoothstep(distance, 2, 5.5));

    const focus = isolation ?? wantedFocus ?? (wantedRoute === "swallow" ? "gut" : null);
    updateFades(focus, dt, reducedMotion);

    // The focus value drives the shader, so the organ brightens with the
    // camera rather than snapping ahead of it.
    for (const { id, material, mesh } of tinted) {
      const wanted = focus === "kidneys" ? isolationOf(mesh.name) === focus : focus === id;
      material.uniforms.uFocus.value = wanted ? focusValue * 0.6 : 0;
    }
    brainMaterial.uniforms.uFocus.value = focus === "brain" ? focusValue : 0;

    camera.updateProjectionMatrix();
    positionAtlasCamera(camera, target, azimuth, distance);
    keyLight.copy(ATLAS_KEY_LIGHT).applyQuaternion(camera.quaternion);
    directional.position.copy(keyLight);

    journey.setRoute(isolation ? undefined : wantedRoute, routeFraction, reducedMotion);
    journey.render(dt, renderer.getPixelRatio(), ready);
    renderer.render(scene, camera);
  }

  const viewport = manageViewport(canvas, renderer, camera, "guided",
    () => applyFraming(true), frame, () => options.onStatus?.("error"));
  canvas.dataset.anatomyScene = "guided";

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
      isolatedMaterials.push({ material: brainMaterial, group: "brain" });
      for (const [name, material] of organMaterials) {
        isolatedMaterials.push({ material, group: isolationOf(name) });
      }
      scene.add(loaded.group);
      ready = true;
      // The caller asked for a framing before the anatomy was here. Apply it
      // now, or the camera would never move.
      applyLevels(wantedLevels);
      applyFocus(isolation ?? wantedFocus);
      applyFraming(true);
      options.onStatus?.("ready");
    })
    .catch(() => {
      if (!load.signal.aborted) options.onStatus?.("error");
    });

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
    wantedFocusValue = organ || wantedRoute === "swallow" ? 1 : 0;
    if (motion.matches) focusValue = wantedFocusValue;
    const showDigestiveTract = organ === "gut" || (!isolation && wantedRoute === "swallow");
    for (const { mesh, id } of tinted) {
      mesh.visible = !(showDigestiveTract && id === "liver") &&
        !(organ === "heart" && id === "lungs") &&
        !(organ === "kidneys" && RENAL_OCCLUDERS.includes(mesh.name));
    }
    if (organ !== "brain") clearBrain();
  }

  function applyFraming(immediate: boolean): void {
    if (!figureBounds) return;
    cameraFrom.copy(target);
    distanceFrom = distance;
    azimuthFrom = azimuth;
    fovFrom = camera.fov;
    const organ = isolation ?? wantedFocus;
    const route = isolation ? undefined : wantedRoute;
    const view = route ? ROUTE_VIEWS[route] : organ ? ORGAN_VIEWS[organ] : OVERVIEW_VIEW;
    const subject = organ ? anchors.get(organ)?.bounds : undefined;
    const track = route ? journey.bounds(route) : undefined;
    const bounds = guidedAtlasBounds(view, figureBounds, subject, track, anchors.get("brain")?.bounds);
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
    setLevels(levels) {
      wantedLevels = levels;
      applyLevels(levels);
    },

    setStage(organ, route, fraction, immediate) {
      routeFraction = fraction;
      journey.setRoute(isolation ? undefined : route, fraction, immediate || motion.matches);
      if (organ !== wantedFocus || route !== wantedRoute) {
        wantedFocus = organ;
        wantedRoute = route;
        applyFocus(isolation ?? organ);
        applyFraming(immediate);
      }
    },

    setIsolation(organ) {
      if (isolation === organ) return;
      isolation = organ;
      const focus = isolation ?? wantedFocus;
      applyFocus(focus);
      applyFraming(false);
      journey.setRoute(isolation ? undefined : wantedRoute, routeFraction, true);
    },

    subscribeFrame: viewport.subscribeFrame,

    getBrainRegion() {
      if (!brainRegion || !brainPoint) return null;
      return { region: brainRegion, x: brainPoint.x, y: brainPoint.y };
    },

    dispose() {
      viewport.dispose(() => {
        load.abort();
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerleave", onPointerLeave);
        clearBrain();
        journey.dispose();
        const materials = [bodyMaterial, brainMaterial, ...organMaterials.values()];
        if (model) disposeAnatomyModel(model.group, materials);
        else for (const material of materials) material.dispose();
        scene.clear();
        model = null;
        anchors.clear();
        brainTargets = [];
        tinted = [];
        organMaterials.clear();
        isolatedMaterials.length = 0;
      });
    },
  };
}
