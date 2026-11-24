/** Surface shaders shared by the landing figure and both simulators. */
export const BODY_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPositionW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPositionW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uScan;
  uniform float uOpacity;
  varying vec3 vNormalW;
  varying vec3 vPositionW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPositionW);
    float grazing = 1.0 - abs(dot(n, v));
    float contour = pow(grazing, 2.7);
    float edge = smoothstep(0.72, 0.99, grazing);
    vec3 key = normalize(vec3(-0.56, 0.67, 0.53));
    float softLight = 0.5 + 0.5 * dot(n, key);
    float reflection = pow(max(dot(n, normalize(key + v)), 0.0), 10.0);
    float scanOffset = (vPositionW.y - uScan) * 7.5;
    float band = exp(-scanOffset * scanOffset);

    float alpha = 0.15 + 0.17 * softLight + contour * 0.33 + edge * 0.14 + reflection * 0.15 + band * 0.06;
    float highlight = clamp(0.35 * softLight + contour * 0.68 + reflection * 0.70 + band * 0.16, 0.0, 1.0);
    vec3 colour = mix(uColor * 0.36, uColor, highlight);
    gl_FragColor = vec4(colour, alpha * uOpacity);
  }
`;

export const ORGAN_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPositionW;
  varying vec3 vPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPositionW = world.xyz;
    vPosition = position;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TISSUE_LIGHTING = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTint;
  uniform float uFocus;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  uniform float uFade;
  varying vec3 vNormalW;
  varying vec3 vPositionW;
  varying vec3 vPosition;

  float latticeValue(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float tissueGrain(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = smoothstep(vec3(0.0), vec3(1.0), fract(p));
    float low = mix(
      mix(latticeValue(cell), latticeValue(cell + vec3(1, 0, 0)), f.x),
      mix(latticeValue(cell + vec3(0, 1, 0)), latticeValue(cell + vec3(1, 1, 0)), f.x), f.y);
    float high = mix(
      mix(latticeValue(cell + vec3(0, 0, 1)), latticeValue(cell + vec3(1, 0, 1)), f.x),
      mix(latticeValue(cell + vec3(0, 1, 1)), latticeValue(cell + vec3(1, 1, 1)), f.x), f.y);
    return (mix(low, high, f.z) - 0.5) * (1.0 - smoothstep(0.45, 1.05, length(fwidth(p))));
  }

  vec3 shadeTissue(vec3 albedo, vec3 n, vec3 v, float sheenPower) {
    vec3 key = normalize(uLightDir);
    float keyAngle = clamp(0.25 + 0.75 * dot(n, key), 0.0, 1.0);
    float keyLight = pow(keyAngle, 1.25) * uLightIntensity;
    float fill = 0.38 + 0.1 * (n.y * 0.5 + 0.5) + 0.14 * max(dot(n, v), 0.0);
    vec3 illumination = fill * vec3(0.92, 0.97, 1.0) + keyLight * vec3(0.70, 0.64, 0.58);

    // Darken concave folds using the change in the mesh's normals across the surface.
    vec3 dx = dFdx(vPositionW);
    vec3 dy = dFdy(vPositionW);
    float bend = (dot(dFdx(n), dx) + dot(dFdy(n), dy)) / max(dot(dx, dx) + dot(dy, dy), 1e-8);
    float fold = 1.0 + clamp(bend * 0.025, -0.27, 0.06);
    float grain = tissueGrain(vPosition * 185.0);
    float sheen = pow(max(dot(n, normalize(key + v)), 0.0), sheenPower) * keyAngle * 0.105;

    return albedo * illumination * fold * (1.0 + grain * 0.27) + vec3(1.0, 0.76, 0.64) * sheen;
  }
`;

export const ORGAN_FRAGMENT = /* glsl */ `
  uniform float uLevel;
  uniform float uTintMix;
  ${TISSUE_LIGHTING}
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPositionW);
    float level = clamp(uLevel, 0.0, 1.0);
    float focus = clamp(uFocus, 0.0, 1.0);
    vec3 base = sRGBTransferEOTF(vec4(mix(uBase, uTint, uTintMix * pow(level, 0.8)), 1.0)).rgb;
    vec3 tint = sRGBTransferEOTF(vec4(uTint, 1.0)).rgb;
    float rim = pow(1.0 - abs(dot(n, v)), 2.6);
    vec3 colour = shadeTissue(base, n, v, 21.0) * (1.0 + 0.18 * level + 0.34 * focus);
    colour += tint * rim * (0.032 * focus + level * (0.07 + 0.16 * uTintMix));
    gl_FragColor = vec4(colour, uFade);
    #include <colorspace_fragment>
  }
`;

export const BRAIN_VERTEX = ORGAN_VERTEX;

export const BRAIN_FRAGMENT = /* glsl */ `
  ${TISSUE_LIGHTING}
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPositionW);
    vec3 base = sRGBTransferEOTF(vec4(uBase, 1.0)).rgb;
    vec3 tint = sRGBTransferEOTF(vec4(uTint, 1.0)).rgb;
    float focus = clamp(uFocus, 0.0, 1.0);
    float rim = pow(1.0 - abs(dot(n, v)), 2.4);
    vec3 colour = shadeTissue(base, n, v, 16.0) * (1.0 + 0.26 * focus);
    colour += tint * rim * focus * 0.048;
    gl_FragColor = vec4(colour, uFade);
    #include <colorspace_fragment>
  }
`;
