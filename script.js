// Import Three.js, OrbitControls via import map and local modules
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initMovement, updateMovement } from './movement.js';
import { createElementModel } from './atom_spdf.js';
import { ELEMENTS, ELEMENTS_BY_SYMBOL } from './data/elements.js';
import { buildElectronConfiguration, formatElectronConfiguration, computeValenceElectrons } from './electron_config.js';

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);
renderer.autoClear = false;

// --- Scene ---
const scene = new THREE.Scene();
scene.background = null;

// --- Camera ---
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0.5, 3);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Initialize keyboard movement listeners
const disposeMovement = initMovement(window);

// --- Lights ---
const hemi = new THREE.HemisphereLight(0x4a6fbf, 0x0c0c12, 0.85);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(3, 5, 4);
scene.add(dirLight);

// --- Inspector helpers (DOM elements) ---
const inspectorEl = document.getElementById('inspector');
const inspectorHeader = inspectorEl?.querySelector('.inspector-header');
const inspectorToggle = inspectorEl?.querySelector('.inspector-toggle');
const subshellContainer = document.getElementById('subshell-list');
const elementInfoEl = document.getElementById('element-info');
const elementPickerButton = document.getElementById('element-picker');
const elementSymbolEl = document.getElementById('element-symbol');
const elementNameEl = document.getElementById('element-name');
const elementMetaEl = document.getElementById('element-meta');
const elementConfigEl = document.getElementById('element-config');
const elementExtraEl = document.getElementById('element-extra');
const planeControlsEl = document.getElementById('plane-controls');
const nodeToggle = document.getElementById('node-toggle');

const axisPlaneToggles = planeControlsEl ? Array.from(planeControlsEl.querySelectorAll('input[data-axis]')) : [];

const periodicOverlay = document.getElementById('periodic-overlay');
const periodicGridInner = document.getElementById('periodic-grid-inner');
const periodicClose = document.getElementById('periodic-close');

function updateInspectorToggleVisual(collapsed) {
	if (!inspectorEl || !inspectorToggle) return;
	inspectorToggle.textContent = collapsed ? '+' : '\u2212';
	inspectorToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
	inspectorToggle.setAttribute('title', collapsed ? 'Expand inspector' : 'Collapse inspector');
	inspectorEl.classList.toggle('collapsed', collapsed);
}

function initInspectorCollapsible() {
	if (!inspectorToggle) return;
	let collapsed = false;
	updateInspectorToggleVisual(collapsed);
	inspectorToggle.addEventListener('click', (event) => {
		event.stopPropagation();
		collapsed = !collapsed;
		updateInspectorToggleVisual(collapsed);
	});
	inspectorToggle.addEventListener('pointerdown', (event) => {
		event.stopPropagation();
	});
}

function initInspectorDrag() {
	if (!inspectorEl || !inspectorHeader) return;
	let isDragging = false;
	let dragPointerId = null;
	let offsetX = 0;
	let offsetY = 0;

	const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

	const onPointerDown = (event) => {
		if (event.button !== 0) return;
		if (inspectorToggle && (event.target === inspectorToggle || inspectorToggle.contains(event.target))) return;
		const rect = inspectorEl.getBoundingClientRect();
		offsetX = event.clientX - rect.left;
		offsetY = event.clientY - rect.top;
		inspectorEl.style.left = `${rect.left}px`;
		inspectorEl.style.top = `${rect.top}px`;
		inspectorEl.style.right = 'auto';
		inspectorEl.style.bottom = 'auto';
		isDragging = true;
		dragPointerId = event.pointerId;
		inspectorEl.classList.add('dragging');
		try {
			inspectorHeader.setPointerCapture(dragPointerId);
		} catch {}
		event.preventDefault();
	};

	const onPointerMove = (event) => {
		if (!isDragging || event.pointerId !== dragPointerId) return;
		const margin = 8;
		const width = inspectorEl.offsetWidth;
		const height = inspectorEl.offsetHeight;
		const maxLeft = Math.max(margin, window.innerWidth - width - margin);
		const maxTop = Math.max(margin, window.innerHeight - height - margin);
		const left = clamp(event.clientX - offsetX, margin, maxLeft);
		const top = clamp(event.clientY - offsetY, margin, maxTop);
		inspectorEl.style.left = `${left}px`;
		inspectorEl.style.top = `${top}px`;
	};

	const stopDrag = (event) => {
		if (!isDragging || event.pointerId !== dragPointerId) return;
		isDragging = false;
		dragPointerId = null;
		inspectorEl.classList.remove('dragging');
		try {
			inspectorHeader.releasePointerCapture(event.pointerId);
		} catch {}
	};

	inspectorHeader.addEventListener('pointerdown', onPointerDown);
	inspectorHeader.addEventListener('pointermove', onPointerMove);
	inspectorHeader.addEventListener('pointerup', stopDrag);
	inspectorHeader.addEventListener('pointercancel', stopDrag);
	window.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerup', stopDrag);
	window.addEventListener('pointercancel', stopDrag);
}

initInspectorCollapsible();
initInspectorDrag();

// --- Selection (raycast) to toggle orbitals on/off ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const selectables = [];
const periodicCells = new Map();
let activePeriodicCell = null;
let currentModel = null;
let currentElement = null;
let currentConfig = null;
let currentHighlight = null;
let nodesEnabled = false;

const AXIS_PLANE_SIZE = 14;

function buildAxisPlane(axis, size = AXIS_PLANE_SIZE) {
	const colors = { x: 0xff6666, y: 0x66ff99, z: 0x6699ff };
	const material = new THREE.MeshBasicMaterial({
		color: colors[axis] ?? 0xffffff,
		opacity: 0.14,
		transparent: true,
		side: THREE.DoubleSide,
		depthWrite: false,
		depthTest: false,
	});
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), material);
	switch (axis) {
		case 'x':
			plane.rotation.y = Math.PI / 2;
			break;
		case 'y':
			plane.rotation.x = Math.PI / 2;
			break;
		default:
			break;
	}
	plane.renderOrder = -5;
	plane.visible = false;
	plane.userData = { type: 'axis-plane', axis };
	return plane;
}

const axisPlanes = {
	x: buildAxisPlane('x'),
	y: buildAxisPlane('y'),
	z: buildAxisPlane('z'),
};

Object.values(axisPlanes).forEach((mesh) => {
	scene.add(mesh);
});

function buildAxisLabel(axis, planeSize = AXIS_PLANE_SIZE) {
	const size = 256;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.clearRect(0, 0, size, size);
	ctx.fillStyle = 'rgba(0,0,0,0)';
	ctx.fillRect(0, 0, size, size);
	const palette = { x: '#ff6666', y: '#66ff99', z: '#6699ff' };
	ctx.fillStyle = palette[axis] ?? '#ffffff';
	ctx.font = 'bold 180px system-ui';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(axis.toUpperCase(), size / 2, size / 2);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
	const sprite = new THREE.Sprite(material);
	sprite.scale.set(1.4, 1.4, 1.4);
	const offset = planeSize / 2 + 0.6;
	switch (axis) {
		case 'x':
			sprite.position.set(offset, 0.0, 0.0);
			break;
		case 'y':
			sprite.position.set(0.0, offset, 0.0);
			break;
		default:
			sprite.position.set(0.0, 0.0, offset);
			break;
	}
	sprite.visible = false;
	sprite.renderOrder = -4;
	sprite.userData = { type: 'axis-label', axis };
	return sprite;
}

const axisLabels = {
	x: buildAxisLabel('x'),
	y: buildAxisLabel('y'),
	z: buildAxisLabel('z'),
};

Object.values(axisLabels).forEach((sprite) => {
	if (sprite) scene.add(sprite);
});

axisPlaneToggles.forEach((input) => {
	const axis = input.dataset.axis;
	if (!axis) return;
	input.checked = axisPlanes[axis]?.visible ?? false;
	input.addEventListener('change', () => {
		const plane = axisPlanes[axis];
		if (plane) plane.visible = input.checked;
		const label = axisLabels[axis];
		if (label) label.visible = input.checked;
	});
});

function applyNodeVisibility(rootGroup, enabled) {
	if (!rootGroup) return;
	rootGroup.traverse((obj) => {
		const nodes = obj.userData?.nodesGroup;
		if (nodes) nodes.visible = enabled;
	});
}

if (nodeToggle) {
	nodeToggle.checked = nodesEnabled;
	nodeToggle.addEventListener('change', () => {
		nodesEnabled = nodeToggle.checked;
		applyNodeVisibility(currentModel, nodesEnabled);
	});
}

function resetHoverState() {
	if (!currentHighlight) return;
	const outline = currentHighlight.userData?.outline;
	if (outline && !currentHighlight.userData?.disabled) outline.visible = false;
	currentHighlight = null;
}

function registerSelectables(rootGroup) {
	selectables.length = 0;
	if (!rootGroup) return;
	rootGroup.traverse((obj) => {
		if (obj.isMesh && obj.userData?.orbital) {
			selectables.push(obj);
			obj.userData.disabled = false;
			if (obj.userData?.outline) {
				obj.userData.outline.visible = false;
			} else {
				const edgeGeo = new THREE.EdgesGeometry(obj.geometry, 12);
				const dashMat = new THREE.LineDashedMaterial({
					color: 0xffffff,
					dashSize: 0.08,
					gapSize: 0.06,
					transparent: true,
					opacity: 0.9,
					depthTest: false,
				});
				const outline = new THREE.LineSegments(edgeGeo, dashMat);
				outline.computeLineDistances();
				outline.visible = false;
				outline.renderOrder = 10;
				obj.add(outline);
				obj.userData.outline = outline;
			}
		}
	});
}

function resetSubshellVisibility() {
	selectables.forEach((mesh) => {
		mesh.userData.disabled = false;
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		mats.forEach((mat) => { if (mat) mat.wireframe = false; });
		const outline = mesh.userData?.outline;
		if (outline) outline.visible = false;
	});
	resetHoverState();
}

function buildInspector(rootGroup) {
	if (!subshellContainer) return;
	subshellContainer.innerHTML = '';
	if (!rootGroup) return;
	const subshells = rootGroup.children.filter((child) => child.userData?.type === 'subshell');
	
	subshells.forEach((sg) => {
		const groupDiv = document.createElement('div');
		groupDiv.className = 'group';

		const title = document.createElement('div');
		title.className = 'title';

		const label = document.createElement('label');
		const chk = document.createElement('input');
		chk.type = 'checkbox';
		chk.checked = sg.visible;
		chk.addEventListener('change', () => {
			sg.visible = chk.checked;
			sg.traverse((node) => {
				if (node.userData?.outline) node.userData.outline.visible = false;
				if (node.userData) node.userData.disabled = false;
				if (node.material) {
					const mats = Array.isArray(node.material) ? node.material : [node.material];
					mats.forEach((mat) => { if (mat) mat.wireframe = false; });
				}
			});
		});
		label.appendChild(chk);

		const electrons = sg.userData?.electrons ?? 0;
		const capacity = sg.userData?.capacity ?? sg.children.length;
		const span = document.createElement('span');
		span.textContent = `${sg.name} (${electrons}/${capacity})`;
		label.appendChild(span);
		title.appendChild(label);

		const exp = document.createElement('button');
		exp.textContent = '\u25BC';
		exp.style.border = 'none';
		exp.style.background = 'transparent';
		exp.style.color = 'inherit';
		exp.style.cursor = 'pointer';
		title.appendChild(exp);

		groupDiv.appendChild(title);

		const list = document.createElement('div');
		list.style.display = 'none';

		sg.children.forEach((child) => {
			const item = document.createElement('div');
			item.className = 'subitem';
			const cbox = document.createElement('input');
			cbox.type = 'checkbox';
			cbox.checked = child.visible;
			cbox.addEventListener('change', () => { child.visible = cbox.checked; });
			item.appendChild(cbox);
			const variant = child.userData?.orbital?.variant ?? child.name;
			const text = document.createElement('span');
			text.textContent = variant || child.name;
			item.appendChild(text);
			list.appendChild(item);
		});

		exp.addEventListener('click', () => {
			const isHidden = list.style.display === 'none';
			list.style.display = isHidden ? 'block' : 'none';
			exp.textContent = isHidden ? '\u25B2' : '\u25BC';
		});

		groupDiv.appendChild(list);
		subshellContainer.appendChild(groupDiv);
	});
}

function formatCategory(category) {
	if (!category) return 'Unknown';
	return category.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatStandardState(state) {
	if (!state) return 'State Unknown';
	const formatted = state.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
	return `State ${formatted}`;
}

function formatMass(mass) {
	if (typeof mass !== 'number' || Number.isNaN(mass)) return 'Mass N/A';
	const precision = mass >= 100 ? 1 : mass >= 10 ? 2 : 3;
	const value = mass.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '');
	return `Mass ${value} u`;
}

function updateElementInfo(element, configuration) {
	if (!elementSymbolEl || !elementNameEl || !elementMetaEl || !elementConfigEl || !elementExtraEl) return;
	if (!element || !configuration) return;
	const configStr = formatElectronConfiguration(configuration);
	const valence = computeValenceElectrons(configuration);
	const groupText = element.group ? `Group ${element.group}` : 'Group NA';
	const categoryText = formatCategory(element.category);
	const blockText = element.block ? element.block.toUpperCase() : 'NA';
	const stateText = formatStandardState(element.standardState);
	const massText = formatMass(element.atomicMass);

	elementSymbolEl.textContent = element.symbol;
	elementNameEl.textContent = element.name;
	elementMetaEl.textContent = `Z=${element.atomicNumber} | Period ${element.period} | ${groupText} | ${categoryText}`;
	elementConfigEl.textContent = configStr;
	elementExtraEl.textContent = `Valence electrons: ${valence} | Block ${blockText} | ${stateText} | ${massText}`;
	if (elementInfoEl) {
		elementInfoEl.dataset.cat = element.category || 'unknown';
	}
}

function highlightPeriodicCell(symbol) {
	if (activePeriodicCell) {
		activePeriodicCell.classList.remove('is-selected');
		activePeriodicCell.setAttribute('aria-pressed', 'false');
		activePeriodicCell = null;
	}
	if (!symbol) return;
	const next = periodicCells.get(symbol);
	if (next) {
		next.classList.add('is-selected');
		next.setAttribute('aria-pressed', 'true');
		activePeriodicCell = next;
	}
}

function setElement(element) {
	if (!element) return;
	currentElement = element;
	currentConfig = buildElectronConfiguration(element.atomicNumber);
	const model = createElementModel({ element, configuration: currentConfig });
	if (currentModel) {
		scene.remove(currentModel);
	}
	currentModel = model;
	scene.add(currentModel);
	applyNodeVisibility(currentModel, nodesEnabled);
	resetHoverState();
	registerSelectables(currentModel);
	buildInspector(currentModel);
	updateElementInfo(element, currentConfig);
	highlightPeriodicCell(element.symbol);
}

function handlePeriodicCellClick(event) {
	const symbol = event.currentTarget?.dataset.symbol;
	if (!symbol) return;
	const element = ELEMENTS_BY_SYMBOL.get(symbol);
	if (!element) return;
	closePeriodicOverlay();
	setElement(element);
}

function buildPeriodicTable() {
	if (!periodicGridInner) return;
	periodicGridInner.innerHTML = '';
	periodicCells.clear();
	ELEMENTS.forEach((element) => {
		const cell = document.createElement('button');
		cell.type = 'button';
		cell.className = 'periodic-cell';
		cell.dataset.symbol = element.symbol;
		cell.dataset.cat = element.category || 'unknown';
		cell.style.gridColumn = String(element.displayCol);
		cell.style.gridRow = String(element.displayRow);
		cell.setAttribute('role', 'gridcell');
		cell.setAttribute('aria-pressed', 'false');
		cell.setAttribute('aria-label', `${element.name}, atomic number ${element.atomicNumber}`);
		cell.innerHTML = `<span class="number">${element.atomicNumber}</span><span class="symbol">${element.symbol}</span><span class="name">${element.name}</span>`;
		cell.addEventListener('click', handlePeriodicCellClick);
		periodicGridInner.appendChild(cell);
		periodicCells.set(element.symbol, cell);
	});
}

function isOverlayOpen() {
	return periodicOverlay?.classList.contains('visible');
}

function openPeriodicOverlay() {
	if (!periodicOverlay) return;
	periodicOverlay.classList.add('visible');
	periodicOverlay.setAttribute('aria-hidden', 'false');
	if (elementPickerButton) elementPickerButton.setAttribute('aria-expanded', 'true');
	const focusTarget = activePeriodicCell || periodicGridInner?.querySelector('.periodic-cell');
	if (focusTarget) focusTarget.focus({ preventScroll: false });
}

function closePeriodicOverlay() {
	if (!periodicOverlay) return;
	const wasOpen = periodicOverlay.classList.contains('visible');
	periodicOverlay.classList.remove('visible');
	periodicOverlay.setAttribute('aria-hidden', 'true');
	if (wasOpen && elementPickerButton) {
		elementPickerButton.setAttribute('aria-expanded', 'false');
		elementPickerButton.focus({ preventScroll: true });
	} else if (elementPickerButton) {
		elementPickerButton.setAttribute('aria-expanded', 'false');
	}
}

if (elementPickerButton) {
	elementPickerButton.addEventListener('click', () => {
		if (isOverlayOpen()) {
			closePeriodicOverlay();
			return;
		}
		openPeriodicOverlay();
	});
}

if (periodicClose) {
	periodicClose.addEventListener('click', () => closePeriodicOverlay());
}

if (periodicOverlay) {
	periodicOverlay.addEventListener('pointerdown', (event) => {
		if (event.target === periodicOverlay) closePeriodicOverlay();
	});
}

function getOrbitalRoot(obj) {
	let cur = obj;
	while (cur && !cur.userData?.orbital) cur = cur.parent;
	return cur && cur.userData?.orbital ? cur : null;
}

function onPointerDown(e) {
	if (!selectables.length) return;
	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const intersects = raycaster.intersectObjects(selectables, true);
	if (intersects.length > 0) {
		const hit = getOrbitalRoot(intersects[0].object);
		if (hit) {
			const nowDisabled = !hit.userData?.disabled;
			hit.userData.disabled = nowDisabled;
			const mats = Array.isArray(hit.material) ? hit.material : [hit.material];
			mats.forEach((mat) => { if (mat) mat.wireframe = nowDisabled; });
			const outline = hit.userData?.outline;
			if (outline) outline.visible = !!nowDisabled;
		}
	}
}

function onPointerMove(e) {
	if (!selectables.length) return;
	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const intersects = raycaster.intersectObjects(selectables, true);
	const next = intersects.length > 0 ? getOrbitalRoot(intersects[0].object) : null;

	if (currentHighlight && currentHighlight !== next) {
		const outline = currentHighlight.userData?.outline;
		if (outline && !currentHighlight.userData?.disabled) outline.visible = false;
		currentHighlight = null;
	}
	if (next && next.visible) {
		const outline = next.userData?.outline;
		if (outline) outline.visible = true;
		currentHighlight = next;
	}
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);

window.addEventListener('keydown', (e) => {
	if (e.code === 'Escape') {
		if (isOverlayOpen()) {
			e.preventDefault();
			closePeriodicOverlay();
			return;
		}
		resetSubshellVisibility();
		return;
	}
	if (e.code === 'KeyR') {
		resetSubshellVisibility();
	}
});

buildPeriodicTable();

const defaultElement = ELEMENTS_BY_SYMBOL.get('Ca') ?? ELEMENTS[0];
setElement(defaultElement);

// --- Shader Skybox (Skydome) ---
const skyVertex = /* glsl */`
	varying vec3 vWorldPosition;
	void main() {
		vec4 worldPosition = modelMatrix * vec4(position, 1.0);
		vWorldPosition = worldPosition.xyz;
		gl_Position = projectionMatrix * viewMatrix * worldPosition;
	}
`;

const skyFragment = /* glsl */`
	precision highp float;
	varying vec3 vWorldPosition;
	uniform float uTime;
	uniform vec3 uTopColor;
	uniform vec3 uBottomColor;
	uniform float uNoiseScale;
	uniform float uNoiseStrength;

	// Simple hash-based value noise
	float hash(vec3 p) {
		p = fract(p * 0.3183099 + 0.1);
		p *= 17.0;
		return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
	}

	float noise(vec3 p) {
		vec3 i = floor(p);
		vec3 f = fract(p);
		// cubic smoothing
		vec3 u = f * f * (3.0 - 2.0 * f);

		float n000 = hash(i + vec3(0.0, 0.0, 0.0));
		float n100 = hash(i + vec3(1.0, 0.0, 0.0));
		float n010 = hash(i + vec3(0.0, 1.0, 0.0));
		float n110 = hash(i + vec3(1.0, 1.0, 0.0));
		float n001 = hash(i + vec3(0.0, 0.0, 1.0));
		float n101 = hash(i + vec3(1.0, 0.0, 1.0));
		float n011 = hash(i + vec3(0.0, 1.0, 1.0));
		float n111 = hash(i + vec3(1.0, 1.0, 1.0));

		float nx00 = mix(n000, n100, u.x);
		float nx10 = mix(n010, n110, u.x);
		float nx01 = mix(n001, n101, u.x);
		float nx11 = mix(n011, n111, u.x);

		float nxy0 = mix(nx00, nx10, u.y);
		float nxy1 = mix(nx01, nx11, u.y);

		return mix(nxy0, nxy1, u.z);
	}

	float fbm(vec3 p) {
		float sum = 0.0;
		float amp = 0.5;
		for(int i = 0; i < 5; i++) {
			sum += amp * noise(p);
			p *= 2.0;
			amp *= 0.5;
		}
		return sum;
	}

	void main() {
		vec3 dir = normalize(vWorldPosition);
		float t = smoothstep(-0.1, 0.8, dir.y);
		vec3 base = mix(uBottomColor, uTopColor, t);

		// Soft moving noise
		vec3 np = dir * uNoiseScale + vec3(0.0, uTime * 0.02, 0.0);
		float n = fbm(np);
		float clouds = smoothstep(0.2, 0.9, n);
		vec3 color = base + uNoiseStrength * clouds * vec3(0.4, 0.5, 0.7);

		gl_FragColor = vec4(color, 1.0);
	}
`;

const skyUniforms = {
	uTime: { value: 0 },
	uTopColor: { value: new THREE.Color(0x0a2a6b) },
	uBottomColor: { value: new THREE.Color(0x020611) },
	uNoiseScale: { value: 2.5 },
	uNoiseStrength: { value: 0.4 },
};

const skyMat = new THREE.ShaderMaterial({
	vertexShader: skyVertex,
	fragmentShader: skyFragment,
	uniforms: skyUniforms,
	side: THREE.BackSide,
	depthWrite: false,
});

const skyGeo = new THREE.SphereGeometry(300, 64, 32);
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// --- Handle Resize ---
function onResize() {
	const w = window.innerWidth;
	const h = window.innerHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// --- Animation Loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
	const dt = clock.getDelta();
	skyUniforms.uTime.value += dt;

	// Update WASD movement (module handles keys and direction)
	updateMovement(camera, controls, dt);

	// Update procedural animations (e.g., hydrogen electron)

	// Slowly rotate the SPDF showcase for visibility

	controls.update();
	renderer.clear();
	renderer.render(scene, camera);
});

// Kick off one resize to ensure correct sizing on load
onResize();
