export const NEBULA_VERTEX = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const NEBULA_FRAGMENT = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vPosition;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), f.x),
        mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), f.x), f.y),
    mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), f.x),
        mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), f.x), f.y), f.z);
  return n * 0.5 + 0.5;
}

float fbm(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec3 dir = normalize(vPosition);
  float t = uTime * 0.02;
  float n1 = fbm(dir * 2.0 + vec3(t, 0.0, t * 0.5));
  float n2 = fbm(dir * 3.5 + vec3(0.0, t * 0.7, -t));
  float n3 = fbm(dir * 5.0 + vec3(-t * 0.3, t * 0.2, 0.0));

  vec3 deepBlue = vec3(0.03, 0.04, 0.12);
  vec3 indigo   = vec3(0.06, 0.05, 0.18);
  vec3 azure    = vec3(0.08, 0.15, 0.28);
  vec3 purple   = vec3(0.12, 0.05, 0.2);
  vec3 warmGold = vec3(0.15, 0.1, 0.05);

  vec3 col = deepBlue;
  col = mix(col, indigo, smoothstep(0.3, 0.6, n1));
  col = mix(col, azure, smoothstep(0.4, 0.7, n2) * 0.6);
  col = mix(col, purple, smoothstep(0.5, 0.8, n3) * 0.4);
  col = mix(col, warmGold, smoothstep(0.65, 0.85, n1 * n2) * 0.3);
  col *= 0.7;
  float vignette = smoothstep(0.0, 0.7, abs(dir.y));
  col *= mix(1.0, 0.3, vignette);
  gl_FragColor = vec4(col, 1.0);
}`;
