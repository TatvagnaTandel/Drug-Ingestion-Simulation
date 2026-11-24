import { readFile } from "node:fs/promises";
import { Box3, CapsuleGeometry, Mesh, PerspectiveCamera, Raycaster, Scene, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { ATLAS_FOV, frameAtlas, guidedAtlasBounds, positionAtlasCamera, RENAL_OCCLUDERS, ROUTE_VIEWS } from "../components/anatomy/atlas-view";

import { disposeAnatomyModel, loadAnatomyModel } from "../components/anatomy/model";
import { createDoseJourney } from "../components/simulator/dose-journey";
import { buildStages, ROUTE_COPY } from "../components/simulator/playback";

describe("anatomy atlas framing", () => {
  const bounds = new Box3(new Vector3(-0.4, -1.5, -0.21), new Vector3(0.4, 1.5, 0.21));

  it.each([[0.62, 0], [1.7, 0.8], [0.62, Math.PI]])(
    "keeps the specimen in frame at aspect %s and azimuth %s",
    (aspect, azimuth) => {
      const camera = new PerspectiveCamera(ATLAS_FOV, aspect);
      const target = bounds.getCenter(new Vector3());
      const distance = frameAtlas(bounds, target, azimuth, aspect);
      positionAtlasCamera(camera, target, azimuth, distance);
      camera.updateMatrixWorld(true);
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new Vector3(x, y, z).project(camera);
            expect(Math.max(Math.abs(point.x), Math.abs(point.y))).toBeLessThan(0.9);
          }
        }
      }
    },
  );

  it("fills a tall viewport without fitting the height against the narrow width", () => {
    const target = bounds.getCenter(new Vector3());
    const distance = frameAtlas(bounds, target, 0, 0.62);
    expect(distance).toBeLessThan(6.75);
  });
});

describe("guided atlas camera", () => {
  it("keeps all nine stages and both renal arteries in frame against the shipped atlas", async () => {
    expect(Object.keys(ROUTE_VIEWS).sort()).toEqual(Object.keys(ROUTE_COPY).sort());
    const bytes = await readFile(new URL("../public/models/human_anatomy_simulator.glb", import.meta.url));
    const response = new Response(new Uint8Array(bytes));
    Object.defineProperty(response, "url", { value: "https://atlas.test/model.glb" });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const material = new ShaderMaterial({ uniforms: { uLevel: { value: 0 } } });
    const model = await loadAnatomyModel("https://atlas.test/model.glb", {
      body: material, brain: material, organ: () => material,
    }, (error) => { throw error; }, new AbortController().signal).finally(() => fetch.mockRestore());
    const scene = new Scene();
    const journey = createDoseJourney(scene);
    const stages = buildStages({ tH: [0, 4, 48], concMgPerL: [0, 10, 0] }, [0]).filter(({ route }) => route);
    expect(stages).toHaveLength(9);

    function expectInFrame(bounds: Box3, camera: PerspectiveCamera, label: string) {
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new Vector3(x, y, z).project(camera);
            expect(Math.max(Math.abs(point.x), Math.abs(point.y)), label).toBeLessThan(0.9);
          }
        }
      }
    }

    try {
      const body = model.meshes.get("Body")!;
      const stomach = model.meshes.get("Stomach")!;
      const lip = new Raycaster(new Vector3(0, 1.27, 1), new Vector3(0, 0, -1)).intersectObject(body)[0].point;
      const capsule = scene.children[0].children.find((part) => part instanceof Mesh && part.geometry instanceof CapsuleGeometry)!;
      const pointAt = (fraction: number) => {
        journey.setRoute("swallow", fraction, true);
        journey.render(0, 1, true);
        return capsule.position.clone();
      };
      expect(pointAt(0).z - lip.z).toBeGreaterThan(0.12);
      expect(pointAt(0.17).distanceTo(lip)).toBeLessThan(0.025);
      expect(new Box3().setFromObject(stomach).containsPoint(pointAt(1))).toBe(true);

      expect(ROUTE_VIEWS.kidneys.azimuth).toBeGreaterThan(Math.PI / 2);
      expect(RENAL_OCCLUDERS).toEqual(["Stomach", "SmallIntestine"]);
      for (const name of RENAL_OCCLUDERS) expect(model.meshes.has(name)).toBe(true);
      for (const stage of stages) {
        const { route, organ, label } = stage;
        if (!route) throw new Error(`No atlas route for ${label}`);
        const config = ROUTE_VIEWS[route];
        const specimen = organ ? model.anchors.get(organ)?.bounds : undefined;
        if (organ) expect(specimen, label).toBeDefined();
        const track = journey.bounds(route);
        const bounds = guidedAtlasBounds(config, model.bounds, specimen, track, model.anchors.get("brain")?.bounds);
        const target = bounds.getCenter(new Vector3());
        for (const aspect of [0.34, 0.63, 0.94, 1.06]) {
          const camera = new PerspectiveCamera(config.fov, aspect);
          const distance = frameAtlas(bounds, target, config.azimuth, aspect, config.fov);
          positionAtlasCamera(camera, target, config.azimuth, distance);
          camera.updateMatrixWorld(true);
          expectInFrame(track, camera, label);
          if (specimen) expectInFrame(specimen, camera, label);
          if (route === "kidneys") {
            for (const name of ["Kidney_L", "Kidney_R", "RenalArtery_L", "RenalArtery_R"]) {
              const mesh = model.meshes.get(name);
              if (!mesh) throw new Error(`Missing renal anatomy ${name}`);
              expectInFrame(new Box3().setFromObject(mesh), camera, name);
            }
          }
        }
      }
    } finally {
      journey.dispose();
      disposeAnatomyModel(model.group, model.materials);
    }
  });
});
