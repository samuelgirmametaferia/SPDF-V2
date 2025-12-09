// atoms.js - simple procedural atom builders
// Currently: Hydrogen atom (H-1) with one proton nucleus and one orbiting electron (Bohr-style)
// Uses three.js via import map
import * as THREE from 'three';

export function createHydrogenAtom({
  nucleusRadius = 0.22,
  electronRadius = 0.06,
  orbitRadius = 1.1,
  electronRevsPerSec = 0.15, // revolutions per second
  showOrbit = true,
  tilt = new THREE.Euler(-0.25, 0.45, 0.0),
  colors = {
    nucleus: 0xff4d4d, // proton
    electron: 0x66e0ff,
    orbit: 0x666666,
  },
  emissiveIntensity = 0.35,
} = {}) {
  const group = new THREE.Group();
  group.rotation.set(tilt.x, tilt.y, tilt.z);

  // Nucleus (Hydrogen-1: one proton)
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(nucleusRadius, 32, 16),
    new THREE.MeshStandardMaterial({
      color: colors.nucleus,
      metalness: 0.2,
      roughness: 0.35,
      emissive: new THREE.Color(colors.nucleus).multiplyScalar(0.5),
      emissiveIntensity,
    })
  );
  group.add(nucleus);

  // Electron as a small glowing sphere
  const electron = new THREE.Mesh(
    new THREE.SphereGeometry(electronRadius, 24, 16),
    new THREE.MeshStandardMaterial({
      color: colors.electron,
      metalness: 0.1,
      roughness: 0.2,
      emissive: new THREE.Color(colors.electron).multiplyScalar(0.7),
      emissiveIntensity: emissiveIntensity * 1.2,
    })
  );
  electron.position.set(orbitRadius, 0, 0);
  group.add(electron);

  // Optional orbit path line (circle)
  if (showOrbit) {
    const segments = 128;
    const pos = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos[i * 3 + 0] = Math.cos(a) * orbitRadius;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = Math.sin(a) * orbitRadius;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const orbit = new THREE.LineLoop(
      g,
      new THREE.LineBasicMaterial({ color: colors.orbit, transparent: true, opacity: 0.6 })
    );
    group.add(orbit);
  }

  // Animation state
  let angle = 0;
  const omega = electronRevsPerSec * Math.PI * 2; // rad/s

  function update(dt) {
    angle += omega * dt;
    const x = Math.cos(angle) * orbitRadius;
    const z = Math.sin(angle) * orbitRadius;
    electron.position.set(x, 0, z);
  }

  return { group, update };
}
