// atom_spdf.js - Procedural SPDF orbital assemblies derived from electron configurations
// Qualitative visualization using real-form orbital shapes from orbitals.js
import * as THREE from 'three';
import { createOrbital } from './orbitals.js';
import { ELEMENTS_BY_SYMBOL } from './data/elements.js';
import { buildElectronConfiguration } from './electron_config.js';

const FAMILY_VARIANTS = {
  s: ['s'],
  p: ['px', 'py', 'pz'],
  d: ['dz2', 'dxz', 'dyz', 'dxy', 'dx2y2'],
  f: ['fz3', 'fxz2', 'fyz2', 'fzx2y2', 'fxyz', 'fcos3', 'fsin3'],
};

const SHELL_BASE_RADIUS = {
  1: 0.55,
  2: 0.95,
  3: 1.45,
  4: 1.95,
  5: 2.45,
  6: 2.95,
  7: 3.45,
};

const FAMILY_RADIUS_OFFSET = {
  s: 0,
  p: 0.18,
  d: 0.38,
  f: 0.58,
};

// Scale the core/base radius per family to improve visible nodal gaps.
const FAMILY_BASE_SCALE = {
  s: 1.0,
  p: 0.9,
  d: 0.88,
  f: 0.94,
};

const FAMILY_RADIAL_SCALE = {
  s: 1.05,
  p: 1.65, // stronger p lobes for clearer separation
  d: 1.45, // stronger d lobes for visible nodal gaps
  f: 1.18,
};

const FAMILY_POWER = {
  s: 1.35,
  p: 2.05,
  d: 1.9,
  f: 1.95,
};

const DEFAULT_COATS = {
  s: { colors: { pos: 0xff9ab3, neg: 0xff9ab3 }, opacity: 0.28 },
  p: { colors: { pos: 0x8cc8ff, neg: 0x6aa9ff }, opacity: 0.35 },
  d: { colors: { pos: 0xffe28c, neg: 0xffc966 }, opacity: 0.26 },
  f: { colors: { pos: 0xc69bff, neg: 0xa47cff }, opacity: 0.22 },
};

const CATEGORY_NUCLEUS_COLORS = {
  'alkali-metal': 0xff6b6b,
  'alkaline-earth-metal': 0xffa45c,
  'transition-metal': 0x8dc6ff,
  'post-transition-metal': 0xc8d6ff,
  metalloid: 0xb0f2c2,
  nonmetal: 0xff5c8d,
  halogen: 0xffc96f,
  'noble-gas': 0x9fd3ff,
  lanthanide: 0xc79bff,
  actinide: 0xff9bf2,
};

function getCoat(coats, family) {
  return (coats && coats[family]) || DEFAULT_COATS[family];
}

function getVariants(family) {
  return FAMILY_VARIANTS[family] || [];
}

function getBaseRadius(n, family) {
  const base = SHELL_BASE_RADIUS[n] ?? (0.55 + 0.5 * Math.max(0, n - 1));
  const offset = FAMILY_RADIUS_OFFSET[family] ?? 0;
  const scale = FAMILY_BASE_SCALE[family] ?? 1.0;
  return (base + offset) * scale;
}

function computeOpacity(baseOpacity = 0.28, occupancy = 1) {
  const clamped = Math.max(0, Math.min(1, occupancy));
  return baseOpacity * (0.55 + 0.45 * clamped);
}

function computeNucleusRadius(atomicNumber, override) {
  if (typeof override === 'number') return override;
  if (!atomicNumber) return 0.28;
  const scaled = 0.18 + 0.05 * Math.cbrt(atomicNumber);
  return THREE.MathUtils.clamp(scaled, 0.18, 0.52);
}

function computeNucleusColor(category, override) {
  if (override !== undefined) return override;
  return CATEGORY_NUCLEUS_COLORS[category] ?? 0xff4d4d;
}

function createNucleusMesh({ radius, color }) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.35,
    emissive: new THREE.Color(color).multiplyScalar(0.28),
    emissiveIntensity: 0.45,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
}

function createSubshellGroup(entry, coats, rimStrength, rimPower) {
  const { n, l, electrons, capacity } = entry;
  const variants = getVariants(l);
  if (!variants.length) return null;
  const coat = getCoat(coats, l);
  const baseRadius = getBaseRadius(n, l);
  const radialScale = FAMILY_RADIAL_SCALE[l] ?? 1.1;
  const power = FAMILY_POWER[l] ?? 1.6;
  const occupancy = electrons / (capacity || 1);
  const opacity = computeOpacity(coat.opacity, occupancy);

  const subshellGroup = new THREE.Group();
  subshellGroup.name = `${n}${l}`;
  subshellGroup.userData = {
    type: 'subshell',
    name: `${n}${l}`,
    family: l,
    electrons,
    capacity,
    occupancy,
  };

  variants.forEach((variant, idx) => {
    const mesh = createOrbital({
      family: l,
      variant,
      baseRadius,
      radialScale,
      power,
      colors: coat.colors,
      material: { opacity, transparent: true },
      rimStrength,
      rimPower,
      showEdges: true,
      principalN: n,
    });
    mesh.userData.shell = { n, l, electrons, capacity, index: idx };
    subshellGroup.add(mesh);
  });

  return subshellGroup;
}

export function createElementModel({
  element,
  configuration,
  coats = DEFAULT_COATS,
  rimStrength = 1.4,
  rimPower = 2.0,
  nucleusRadius,
  nucleusColor,
} = {}) {
  if (!element) {
    throw new Error('createElementModel requires an element descriptor');
  }

  const group = new THREE.Group();
  group.userData.element = element;

  const resolvedConfig = configuration ?? buildElectronConfiguration(element.atomicNumber);
  const radius = computeNucleusRadius(element.atomicNumber, nucleusRadius);
  const color = computeNucleusColor(element.category, nucleusColor);
  const nucleus = createNucleusMesh({ radius, color });
  nucleus.userData = { type: 'nucleus' };
  group.add(nucleus);

  resolvedConfig.forEach((entry) => {
    const subshell = createSubshellGroup(entry, coats, rimStrength, rimPower);
    if (subshell) {
      group.add(subshell);
    }
  });

  return group;
}

export function createCalciumSPDFModel(options = {}) {
  const element = ELEMENTS_BY_SYMBOL.get('Ca');
  const configuration = buildElectronConfiguration(element.atomicNumber);
  return createElementModel({ element, configuration, ...options });
}
