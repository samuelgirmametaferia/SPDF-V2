// weirdGeometry.js - utilities to generate/modify unusual procedural geometry
// Uses three.js; relies on import map (index.html) to resolve 'three' and 'three/addons/'
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

// --- Helpers: value noise + fbm (deterministic)
function hash3(x, y, z) {
  // integer hash -> [0,1)
  let n = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  n = (n << 13) ^ n;
  const nn = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
  return nn / 0x7fffffff;
}

function valueNoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);

  function n(ix, iy, iz) { return hash3(xi + ix, yi + iy, zi + iz); }

  const x00 = THREE.MathUtils.lerp(n(0,0,0), n(1,0,0), u);
  const x10 = THREE.MathUtils.lerp(n(0,1,0), n(1,1,0), u);
  const x01 = THREE.MathUtils.lerp(n(0,0,1), n(1,0,1), u);
  const x11 = THREE.MathUtils.lerp(n(0,1,1), n(1,1,1), u);
  const y0 = THREE.MathUtils.lerp(x00, x10, v);
  const y1 = THREE.MathUtils.lerp(x01, x11, v);
  return THREE.MathUtils.lerp(y0, y1, w);
}

function fbm3(p, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let amp = 0.5, sum = 0.0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(p.x, p.y, p.z);
    p.multiplyScalar(lacunarity);
    amp *= gain;
  }
  return sum;
}

// --- Deform a geometry in-place with a provided callback on position
export function deformGeometry(geometry, deformFn) {
  const pos = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    deformFn(v, i);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

// --- Noise-deformed sphere
export function createNoiseSphere({
  radius = 1,
  widthSegments = 96,
  heightSegments = 64,
  amplitude = 0.25,
  frequency = 2.5,
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
  color = 0xff77aa,
  metalness = 0.15,
  roughness = 0.4,
} = {}) {
  const geo = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const p = new THREE.Vector3();
  deformGeometry(geo, (v) => {
    const n = fbm3(p.copy(v).multiplyScalar(frequency), octaves, lacunarity, gain);
    const normal = v.clone().normalize();
    const disp = (n - 0.5) * 2.0 * amplitude; // remap [0,1] -> [-1,1]
    v.addScaledVector(normal, disp);
  });
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  return new THREE.Mesh(geo, mat);
}

// --- Twisted torus knot
export function createTwistedTorusKnot({
  radius = 1.0,
  tube = 0.35,
  tubularSegments = 256,
  radialSegments = 24,
  p = 2,
  q = 3,
  twist = Math.PI * 2.0, // radians of twist per unit Y
  color = 0x88e0ff,
  metalness = 0.3,
  roughness = 0.3,
} = {}) {
  const geo = new THREE.TorusKnotGeometry(radius, tube, tubularSegments, radialSegments, p, q);
  deformGeometry(geo, (v) => {
    const angle = twist * v.y; // simple world-y dependent twist
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = v.x * c - v.z * s;
    const z = v.x * s + v.z * c;
    v.x = x; v.z = z;
  });
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  return new THREE.Mesh(geo, mat);
}

// --- Metaballs via MarchingCubes (weird blobby forms)
export function createMetaballs({
  resolution = 32,
  isolation = 80,
  numBalls = 10,
  strength = 1.2,
  subtract = 12.0,
  radius = 0.4,
  color = 0xb4ff6a,
  metalness = 0.1,
  roughness = 0.6,
  seed = 1,
} = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const mc = new MarchingCubes(resolution, mat, true, true);
  mc.isolation = isolation;

  // pseudo-random generator
  let s = seed >>> 0;
  const rnd = () => (s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff;

  mc.reset();
  for (let i = 0; i < numBalls; i++) {
    const x = rnd() * 0.8 + 0.1;
    const y = rnd() * 0.8 + 0.1;
    const z = rnd() * 0.8 + 0.1;
    mc.addBall(x, y, z, strength, subtract);
  }

  // Optionally add a central ball to ensure coherent blob
  mc.addBall(0.5, 0.5, 0.5, strength * radius, subtract);

  // scale the unit-cube field into world space
  mc.scale.set(2, 2, 2);
  mc.position.set(0, 0, 0);

  return mc; // this is a Mesh-like object; add directly to scene
}
