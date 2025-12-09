// Movement controls module: WASD with Shift sprint using camera-forward directions
// Relies on import map mapping 'three' in index.html
import * as THREE from 'three';

export const BASE_SPEED = 2.0;          // units per second
export const SPRINT_MULTIPLIER = 4.0;   // multiplier when Shift is held

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
};

function onKeyDown(e) {
  switch (e.code) {
    case 'KeyW': keys.w = true; e.preventDefault(); break;
    case 'KeyA': keys.a = true; e.preventDefault(); break;
    case 'KeyS': keys.s = true; e.preventDefault(); break;
    case 'KeyD': keys.d = true; e.preventDefault(); break;
    case 'ShiftLeft':
    case 'ShiftRight': keys.shift = true; break;
    default: break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': keys.w = false; break;
    case 'KeyA': keys.a = false; break;
    case 'KeyS': keys.s = false; break;
    case 'KeyD': keys.d = false; break;
    case 'ShiftLeft':
    case 'ShiftRight': keys.shift = false; break;
    default: break;
  }
}

// Call once to attach listeners. Returns a disposer to remove them.
export function initMovement(target = window) {
  target.addEventListener('keydown', onKeyDown, { passive: false });
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}

// Advance movement based on current keys; moves camera and controls.target in-place
export function updateMovement(camera, controls, dt) {
  let moveX = 0, moveZ = 0;
  if (keys.w) moveZ += 1;
  if (keys.s) moveZ -= 1;
  if (keys.d) moveX += 1;
  if (keys.a) moveX -= 1;

  if (moveX === 0 && moveZ === 0) return;

  const speed = BASE_SPEED * (keys.shift ? SPRINT_MULTIPLIER : 1.0);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward); // normalized
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();

  const moveDir = new THREE.Vector3();
  moveDir.addScaledVector(forward, moveZ);
  moveDir.addScaledVector(right, moveX);
  if (moveDir.lengthSq() > 0) moveDir.normalize();
  moveDir.multiplyScalar(speed * dt);

  camera.position.add(moveDir);
  controls.target.add(moveDir);
}
