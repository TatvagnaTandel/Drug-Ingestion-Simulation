import type { PerspectiveCamera, WebGLRenderer } from "three";

export type SceneStatus = "loading" | "ready" | "error";

export function manageViewport(
  canvas: HTMLCanvasElement,
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  name: "guided" | "lab",
  reframe: () => void,
  render: (dt: number, reducedMotion: boolean) => void,
  onContextLost: () => void,
) {
  const container = canvas.parentElement ?? canvas;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const subscribers = new Set<() => void>();
  let inView = false;
  let raf = 0;
  let lastFrame = 0;
  let frames = 0;
  let disposed = false;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let viewportRatio = 0;

  function frame(now: number) {
    raf = 0;
    if (disposed || !inView || document.hidden) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    render(dt, motion.matches);
    const { geometries, textures } = renderer.info.memory;
    canvas.dataset.anatomyMemory = `${geometries},${textures},${renderer.info.programs?.length ?? 0}`;
    canvas.dataset.anatomyFrames = String(++frames);
    for (const notify of subscribers) notify();
    refresh();
  }

  function refresh() {
    const active = !disposed && inView && !document.hidden && viewportWidth > 0 && viewportHeight > 0;
    if (canvas.dataset.anatomyPaused !== String(!active)) canvas.dataset.anatomyPaused = String(!active);
    if (active && !raf) raf = requestAnimationFrame(frame);
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    const ratio = Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.5 : 2);
    if (width === viewportWidth && height === viewportHeight && ratio === viewportRatio) return;
    viewportWidth = width;
    viewportHeight = height;
    viewportRatio = ratio;
    if (width > 0 && height > 0) {
      renderer.setDrawingBufferSize(width, height, ratio);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      canvas.dataset.anatomyAspect = String(camera.aspect);
      reframe();
    }
    refresh();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? false;
    refresh();
  });
  intersectionObserver.observe(container);
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);
  document.addEventListener("visibilitychange", refresh);

  function contextLost(event: Event) {
    event.preventDefault();
    onContextLost();
  }
  canvas.addEventListener("webglcontextlost", contextLost);
  const memory = () => ({
    ...renderer.info.memory,
    programs: renderer.info.programs?.length ?? 0,
  });
  resize();

  return {
    subscribeFrame(notify: () => void) {
      subscribers.add(notify);
      return () => { subscribers.delete(notify); };
    },
    dispose(disposeResources: () => void) {
      if (disposed) return;
      disposed = true;
      refresh();
      delete canvas.dataset.anatomyScene;
      subscribers.clear();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", resize);
      document.removeEventListener("visibilitychange", refresh);
      canvas.removeEventListener("webglcontextlost", contextLost);
      const before = memory();
      disposeResources();
      renderer.dispose();
      const after = memory();
      renderer.forceContextLoss();
      document.dispatchEvent(new CustomEvent("anatomy:renderer-disposed", {
        detail: { scene: name, before, after, frames },
      }));
    },
  };
}
