import { Vector3, type Box3, type PerspectiveCamera } from "three";
import type { DoseRoute } from "../simulator/playback";
import type { IsolationGroup } from "./contract";

export const ATLAS_FOV = 32;
export const ATLAS_KEY_LIGHT = new Vector3(-0.45, 0.65, 0.65).normalize();
export const ATLAS_CONTEXT_FADE = 0.32;
const ELEVATION = 0.045;

type AtlasView = {
  azimuth: number;
  target: "specimen" | "specimen-and-route" | "head-and-route";
  fov: number;
  seconds: number;
};

export const OVERVIEW_VIEW: AtlasView = {
  azimuth: 0, target: "specimen", fov: ATLAS_FOV, seconds: 1.1,
};

export const ORGAN_VIEWS: Record<IsolationGroup, AtlasView> = {
  gut: { ...OVERVIEW_VIEW, azimuth: -0.16, fov: 29 },
  brain: { ...OVERVIEW_VIEW, azimuth: 0.72, fov: 28 },
  heart: { ...OVERVIEW_VIEW, azimuth: 0.16, fov: 30 },
  lungs: { ...OVERVIEW_VIEW, fov: 31 },
  liver: { ...OVERVIEW_VIEW, azimuth: 0.16, fov: 30 },
  kidneys: { ...OVERVIEW_VIEW, azimuth: Math.PI - 0.13, fov: 27, seconds: 1.25 },
};

export const ROUTE_VIEWS: Record<DoseRoute, AtlasView> = {
  swallow: { azimuth: -0.76, target: "head-and-route", fov: 33, seconds: 1.2 },
  absorption: { ...ORGAN_VIEWS.gut, target: "specimen-and-route" },
  portal: { ...ORGAN_VIEWS.liver, azimuth: -0.19, target: "specimen-and-route" },
  "right-heart": { ...ORGAN_VIEWS.heart, azimuth: -0.22, target: "specimen-and-route" },
  lungs: { ...ORGAN_VIEWS.lungs, target: "specimen-and-route" },
  "left-heart": { ...ORGAN_VIEWS.heart, azimuth: 0.25, target: "specimen-and-route" },
  brain: { ...ORGAN_VIEWS.brain, target: "specimen-and-route" },
  body: { ...OVERVIEW_VIEW, target: "specimen-and-route" },
  liver: { ...ORGAN_VIEWS.liver, target: "specimen-and-route" },
  kidneys: { ...ORGAN_VIEWS.kidneys, target: "specimen-and-route" },
};

// Posterior rays through both renal arteries intersect these digestive meshes.
export const RENAL_OCCLUDERS: readonly string[] = ["Stomach", "SmallIntestine"];

export function guidedAtlasBounds(
  view: AtlasView,
  figure: Box3,
  specimen?: Box3,
  track?: Box3,
  brain?: Box3,
): Box3 {
  const bounds = (specimen ?? track ?? figure).clone();
  if (track && view.target !== "specimen") bounds.union(track);
  if (view.target === "head-and-route") {
    if (brain) bounds.union(brain);
    bounds.max.y = figure.max.y;
  }
  return bounds;
}

export function positionAtlasCamera(
  camera: PerspectiveCamera,
  target: Vector3,
  azimuth: number,
  distance: number,
): void {
  camera.position.set(Math.sin(azimuth), ELEVATION, Math.cos(azimuth))
    .setLength(distance).add(target);
  camera.lookAt(target);
}

/** Fits the specimen corners against the horizontal and vertical fields of view. */
export function frameAtlas(bounds: Box3, target: Vector3, azimuth: number, aspect: number, fov = ATLAS_FOV): number {
  const back = new Vector3(Math.sin(azimuth), ELEVATION, Math.cos(azimuth)).normalize();
  const right = new Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
  const up = new Vector3().crossVectors(back, right);
  const vertical = 0.86 * Math.tan(fov * Math.PI / 360);
  const horizontal = vertical * aspect;
  const corner = new Vector3();
  let distance = 0.65;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).sub(target);
        distance = Math.max(distance, back.dot(corner) + Math.max(
          Math.abs(right.dot(corner)) / horizontal,
          Math.abs(up.dot(corner)) / vertical,
        ));
      }
    }
  }
  return distance;
}
