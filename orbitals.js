// orbitals.js - procedural SPDF orbital visualization using real spherical harmonic-like forms
// Uses three.js via import map
import * as THREE from 'three';

const DEFAULT_NODE_COLOR = 0xffffff;
const DEFAULT_NODE_OPACITY = 0.22;
const NODE_SIZE_MULTIPLIER = 2.2; // enlarge node helpers so separation is easier on the eyes

function createNodeMaterial({ color = DEFAULT_NODE_COLOR, opacity = DEFAULT_NODE_OPACITY } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function createPlaneNode(normal, size, material) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  const n = normal.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  plane.setRotationFromQuaternion(q);
  plane.renderOrder = 3;
  plane.userData.isNodeHelper = true;
  plane.raycast = () => {};
  return plane;
}

function createDoubleConeNode(cosTheta, size, material) {
  const theta = Math.acos(THREE.MathUtils.clamp(cosTheta, -1, 1));
  const height = size * 2.4;
  const radius = Math.tan(theta) * (height / 2);
  const geo = new THREE.ConeGeometry(radius, height, 56, 1, true);
  const coneA = new THREE.Mesh(geo, material);
  const coneB = new THREE.Mesh(geo, material);
  coneA.position.y = -height * 0.25;
  coneB.position.y = height * 0.25;
  coneA.renderOrder = 3;
  coneB.renderOrder = 3;
  coneB.rotation.x = Math.PI;
  coneA.userData.isNodeHelper = true;
  coneB.userData.isNodeHelper = true;
  coneA.raycast = () => {};
  coneB.raycast = () => {};
  const group = new THREE.Group();
  group.add(coneA, coneB);
  group.userData.isNodeHelper = true;
  return group;
}

function buildNodalGroup(cfg, size) {
  const material = createNodeMaterial();
  const group = new THREE.Group();
  group.visible = false;
  group.name = 'nodes';

  const addPlanes = (normals) => {
    normals.forEach((n) => group.add(createPlaneNode(n, size, material)));
  };

  const addCones = (cosValues) => {
    cosValues.forEach((c) => group.add(createDoubleConeNode(c, size, material)));
  };

  switch (cfg.family) {
    case 's':
      // No angular nodes.
      break;
    case 'p':
      if (cfg.variant === 'px') addPlanes([new THREE.Vector3(1, 0, 0)]);
      else if (cfg.variant === 'py') addPlanes([new THREE.Vector3(0, 1, 0)]);
      else addPlanes([new THREE.Vector3(0, 0, 1)]); // pz
      break;
    case 'd':
      if (cfg.variant === 'dz2') {
        // Two conical nodes for d_z^2 at cos(theta)=±1/sqrt(3)
        addCones([1 / Math.sqrt(3)]);
      } else if (cfg.variant === 'dxz') {
        addPlanes([new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]);
      } else if (cfg.variant === 'dyz') {
        addPlanes([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]);
      } else if (cfg.variant === 'dxy') {
        addPlanes([new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]);
      } else {
        // dx2y2: nodal planes along x=±y
        addPlanes([
          new THREE.Vector3(1, 1, 0).normalize(),
          new THREE.Vector3(1, -1, 0).normalize(),
        ]);
      }
      break;
    case 'f':
      if (cfg.variant === 'fz3') {
        addPlanes([new THREE.Vector3(0, 1, 0)]);
        addCones([Math.sqrt(3 / 5)]);
      } else if (cfg.variant === 'fxz2') {
        addPlanes([new THREE.Vector3(1, 0, 0)]);
        addCones([1 / Math.sqrt(5)]);
      } else if (cfg.variant === 'fyz2') {
        addPlanes([new THREE.Vector3(0, 1, 0)]);
        addCones([1 / Math.sqrt(5)]);
      } else if (cfg.variant === 'fzx2y2') {
        addPlanes([
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(1, 1, 0).normalize(),
          new THREE.Vector3(1, -1, 0).normalize(),
        ]);
      } else if (cfg.variant === 'fxyz') {
        addPlanes([
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 1),
        ]);
      } else if (cfg.variant === 'fcos3') {
        // Three vertical planes 60 deg apart
        addPlanes([
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)),
          new THREE.Vector3(Math.sin((2 * Math.PI) / 3), 0, Math.cos((2 * Math.PI) / 3)),
        ]);
      } else if (cfg.variant === 'fsin3') {
        addPlanes([
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)),
          new THREE.Vector3(Math.sin((2 * Math.PI) / 3), 0, Math.cos((2 * Math.PI) / 3)),
        ]);
      } else {
        addPlanes([new THREE.Vector3(0, 1, 0)]);
      }
      break;
    default:
      break;
  }

  if (!group.children.length) return null;
  return group;
}

export function evaluateOrbitalAmplitude(family, variant, dir) {
  const x = dir.x;
  const y = dir.y;
  const z = dir.z;
  const r = 1.0;
  const cosT = y / r;
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = Math.atan2(z, x);

  switch (family) {
    case 's':
      return 1.0;
    case 'p':
      if (variant === 'px') return sinT * Math.cos(phi);
      if (variant === 'py') return sinT * Math.sin(phi);
      return cosT;
    case 'd':
      if (variant === 'dz2') return 0.5 * (3 * cosT * cosT - 1);
      if (variant === 'dxz') return sinT * cosT * Math.cos(phi);
      if (variant === 'dyz') return sinT * cosT * Math.sin(phi);
      if (variant === 'dxy') return sinT * sinT * Math.sin(2 * phi);
      return sinT * sinT * Math.cos(2 * phi);
    case 'f':
      // Real cubic harmonics (up to normalization constants) with polar axis = Y
      if (variant === 'fz3') return 0.5 * cosT * (5.0 * cosT * cosT - 3.0);                // z(5z^2-3r^2)
      if (variant === 'fxz2') return 0.5 * sinT * Math.cos(phi) * (5.0 * cosT * cosT - 1.0); // x(5z^2-r^2)
      if (variant === 'fyz2') return 0.5 * sinT * Math.sin(phi) * (5.0 * cosT * cosT - 1.0); // y(5z^2-r^2)
      if (variant === 'fzx2y2') return sinT * sinT * cosT * Math.cos(2.0 * phi);              // z(x^2-y^2)
      if (variant === 'fxyz') return sinT * sinT * cosT * Math.sin(2.0 * phi);                // xyz
      if (variant === 'fcos3') return Math.pow(sinT, 3.0) * Math.cos(3.0 * phi);              // x(x^2-3y^2)
      if (variant === 'fsin3') return Math.pow(sinT, 3.0) * Math.sin(3.0 * phi);              // y(3x^2-y^2)
      return 0.5 * cosT * (5.0 * cosT * cosT - 3.0);
    default:
      return 1.0;
  }
}

export function evaluateOrbitalRadius(config, dir) {
  const amp = Math.abs(evaluateOrbitalAmplitude(config.family, config.variant, dir));
  const power = config.power ?? 1.0;
  const radialScale = config.radialScale ?? 0;
  return config.baseRadius * (1.0 + radialScale * Math.pow(amp, power));
}

export function evaluateOrbitalSDF(config, position, target = { distance: 0, phase: 1, amplitude: 0 }) {
  const len = position.length();
  if (len === 0) {
    target.distance = -config.baseRadius;
    target.phase = 1;
    target.amplitude = 1;
    return target;
  }
  const dir = position.clone().normalize();
  const amp = evaluateOrbitalAmplitude(config.family, config.variant, dir);
  const radius = config.baseRadius * (1.0 + (config.radialScale ?? 0) * Math.pow(Math.abs(amp), config.power ?? 1.0));
  target.distance = len - radius;
  target.phase = Math.sign(amp) || 1;
  target.amplitude = amp;
  return target;
}

function buildShaderMaterial({
  colorPos = new THREE.Color(0xff8ec7),
  colorNeg = new THREE.Color(0x7fbaff),
  rimColor = new THREE.Color(0xffffff),
  rimStrength = 1.6,
  rimPower = 2.0,
  opacity = 0.85,
  blending = THREE.NormalBlending,
  doubleSided = true,
} = {}) {
  const uniforms = {
    uColorPos: { value: colorPos },
    uColorNeg: { value: colorNeg },
    uRimColor: { value: rimColor },
    uRimStrength: { value: rimStrength },
    uRimPower: { value: rimPower },
    uOpacity: { value: opacity },
  };

  const vertex = /* glsl */`
    attribute float amp; // [0,1]
    attribute float phase; // -1 or +1
    varying float vAmp;
    varying float vPhase;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    void main(){
      vAmp = amp;
      vPhase = phase;
      vec4 wPos = modelMatrix * vec4(position,1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - wPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * wPos;
    }
  `;

  const fragment = /* glsl */`
    precision highp float;
    varying float vAmp;
    varying float vPhase;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    uniform vec3 uColorPos;
    uniform vec3 uColorNeg;
    uniform vec3 uRimColor;
    uniform float uRimStrength;
    uniform float uRimPower;
    uniform float uOpacity;
    void main(){
      vec3 base = mix(uColorNeg, uColorPos, step(0.0, vPhase));
      // amplify color with amplitude
      float a = clamp(vAmp, 0.0, 1.0);
      vec3 col = mix(base*0.6, base, a);
      // rim lighting
      float fres = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), uRimPower);
      col += uRimStrength * fres * uRimColor;
      gl_FragColor = vec4(col, uOpacity);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    blending,
    depthWrite: false,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  return mat;
}

// Utility: add vertex colors and deform sphere by amplitude
function buildOrbitalMesh({
  family = 's', // 's'|'p'|'d'|'f'
  variant = 's', // e.g., 'px','py','pz','dz2','dxz','dyz','dxy','dx2y2','fz3', etc.
  baseRadius = 0.8,
  radialScale = 1.2, // stronger expansion for sharper lobes
  power = 1.6, // sharper shape
  widthSegments = 128,
  heightSegments = 96,
  colorPos = new THREE.Color(0xff8ec7),
  colorNeg = new THREE.Color(0x7fbaff),
  metalness = 0.0,
  roughness = 0.8,
  opacity = 0.85,
  transparent = true,
  useShader = true,
  showEdges = true,
  rimStrength = 1.6,
  rimPower = 2.0,
  blending = THREE.NormalBlending,
  doubleSided = true,
  enableNodes = true,
  showNodes = false,
} = {}) {
  const geo = new THREE.SphereGeometry(baseRadius, widthSegments, heightSegments);

  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const amps = new Float32Array(pos.count);
  const phases = new Float32Array(pos.count);
  const n = new THREE.Vector3();
  const cfg = { family, variant, baseRadius, radialScale, power };

  const tmp = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    const dir = n.copy(tmp).normalize();
    let ampRaw = evaluateOrbitalAmplitude(family, variant, dir);
    const sign = Math.sign(ampRaw) || 1.0;
    const ampMag = Math.pow(Math.abs(ampRaw), power);

    // Pull waist in near angular nodes for p/d/f so lobes separate visually.
    const nodeFloor = family === 's' ? 1.0 : 0.22; // fraction of baseRadius at node
    const baseBlend = family === 's' ? 1.0 : THREE.MathUtils.lerp(nodeFloor, 1.0, Math.pow(Math.abs(ampRaw), 0.35));
    const r = baseRadius * (baseBlend + radialScale * ampMag);
    tmp.copy(dir).multiplyScalar(r);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);

    // vertex color by sign
    c.copy(sign > 0 ? colorPos : colorNeg);
    colors[3 * i + 0] = c.r;
    colors[3 * i + 1] = c.g;
    colors[3 * i + 2] = c.b;

    amps[i] = ampMag;
    phases[i] = sign;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('amp', new THREE.BufferAttribute(amps, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = useShader
    ? buildShaderMaterial({ colorPos, colorNeg, opacity, rimStrength, rimPower, blending, doubleSided })
    : new THREE.MeshStandardMaterial({ vertexColors: true, metalness, roughness, transparent, opacity });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.orbital = { family, variant };

  if (showEdges) {
    const e = new THREE.EdgesGeometry(geo, 12);
    const lines = new THREE.LineSegments(
      e,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.25 })
    );
    mesh.add(lines);
  }

  if (enableNodes) {
    const maxRadius = evaluateOrbitalRadius(cfg, new THREE.Vector3(1, 0, 0)) * NODE_SIZE_MULTIPLIER;
    const nodes = buildNodalGroup(cfg, maxRadius);
    if (nodes) {
      nodes.visible = showNodes;
      mesh.userData.nodesGroup = nodes;
      mesh.add(nodes);
    }
  }
  return mesh;
}

function createRingMesh(majorRadius, minorRadius, color = new THREE.Color(0xffffff), opacity = 0.35) {
  const geo = new THREE.TorusGeometry(majorRadius, minorRadius, 40, 128);
  // Align torus axis to Y (default is Z)
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    metalness: 0.0,
    roughness: 0.6,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.isRingOverlay = true;
  return mesh;
}

function maybeAddRingOverlay(mesh) {
  const cfg = mesh.userData?.orbitalConfig;
  const orb = mesh.userData?.orbital;
  if (!cfg || !orb) return;

  const colorNeg = cfg.colorNeg ?? new THREE.Color(0x777777);
  const colorPos = cfg.colorPos ?? new THREE.Color(0xffffff);

  // helper to compute radius at equator (y=0, direction on x-axis)
  const equatorDir = new THREE.Vector3(1, 0, 0);
  const rEquator = evaluateOrbitalRadius(cfg, equatorDir);
  const minorBase = Math.max(0.06, 0.14 * cfg.baseRadius);

  if (orb.family === 'd' && orb.variant === 'dz2') {
    // Classic toroidal band for d_z^2 around equator (negative lobe)
    const ring = createRingMesh(rEquator, minorBase, colorNeg, 0.32);
    mesh.add(ring);
  }

  if (orb.family === 'f') {
    if (orb.variant === 'fxz2' || orb.variant === 'fyz2' || orb.variant === 'fzx2y2' || orb.variant === 'fxyz') {
      // Approximate equatorial ring component
      const ring = createRingMesh(rEquator, minorBase * 0.9, colorNeg.clone().lerp(colorPos, 0.25), 0.28);
      mesh.add(ring);
    }
    // For fz3, no strong equatorial ring; skip by default.
  }
}

export function createOrbital({
  family = 's',
  variant = 's',
  baseRadius = 0.8,
  radialScale = 1.2,
  power = 1.6,
  widthSegments = 128,
  heightSegments = 96,
  colors = { pos: 0xff8ec7, neg: 0x7fbaff },
  material = {},
  useShader = true,
  showEdges = true,
  rimStrength = 1.6,
  rimPower = 2.0,
  blending = THREE.NormalBlending,
  doubleSided = true,
  addRings = true,
  enableNodes = true,
  showNodes = false,
} = {}) {
  const mesh = buildOrbitalMesh({
    family,
    variant,
    baseRadius,
    radialScale,
    power,
    widthSegments,
    heightSegments,
    colorPos: new THREE.Color(colors.pos),
    colorNeg: new THREE.Color(colors.neg),
    metalness: material.metalness ?? 0.0,
    roughness: material.roughness ?? 0.8,
    opacity: material.opacity ?? 0.85,
    transparent: material.transparent ?? true,
    useShader,
    showEdges,
    rimStrength,
    rimPower,
    blending,
    doubleSided,
    enableNodes,
    showNodes,
  });
  mesh.userData.orbitalConfig = {
    family,
    variant,
    baseRadius,
    radialScale,
    power,
    colorPos: new THREE.Color(colors.pos),
    colorNeg: new THREE.Color(colors.neg),
  };

  // Optionally add auxiliary "ring" geometry for variants that have toroidal parts
  if (addRings) {
    maybeAddRingOverlay(mesh);
  }
  return mesh;
}

// Build a simple SPDF showcase: one s, one pz, one dz2, one fz3
export function createSPDFModel({
  spacing = 2.2,
  baseRadius = 0.8,
  radialScale = 1.2,
  power = 1.6,
} = {}) {
  const g = new THREE.Group();

  const s = createOrbital({ family: 's', variant: 's', baseRadius, radialScale, power });
  s.position.set(-spacing * 1.5, 0, 0);
  g.add(s);

  const pz = createOrbital({ family: 'p', variant: 'pz', baseRadius, radialScale, power });
  pz.position.set(-spacing * 0.5, 0, 0);
  g.add(pz);

  const dz2 = createOrbital({ family: 'd', variant: 'dz2', baseRadius, radialScale, power });
  dz2.position.set(spacing * 0.5, 0, 0);
  g.add(dz2);

  const fz3 = createOrbital({ family: 'f', variant: 'fz3', baseRadius, radialScale, power: Math.max(power, 1.8) });
  fz3.position.set(spacing * 1.5, 0, 0);
  g.add(fz3);

  return g;
}
