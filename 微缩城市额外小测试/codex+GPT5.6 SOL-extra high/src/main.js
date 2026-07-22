import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('#city-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#789b99');
scene.fog = new THREE.FogExp2('#8aa4a0', 0.0063);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(102, 82, 118);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.target.set(-3, 2, 0);
controls.minDistance = 38;
controls.maxDistance = 220;
controls.minPolarAngle = 0.28;
controls.maxPolarAngle = Math.PI * 0.475;
controls.screenSpacePanning = false;

const world = new THREE.Group();
world.rotation.y = -0.06;
scene.add(world);

const rng = (() => {
  let seed = 193704;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
})();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const rand = (min, max) => min + (max - min) * rng();
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => v * v * (3 - 2 * v);

function material(color, roughness = 0.82, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const MAT = {
  platform: material('#d9d0bd', 0.94),
  platformEdge: material('#b4aa97', 0.98),
  earth: material('#9e8f71', 1),
  grass: material('#738f69', 1),
  grassLight: material('#91aa78', 1),
  paving: material('#c8c2ae', 0.96),
  pavingDark: material('#aaa895', 0.98),
  asphalt: material('#3b4543', 0.96),
  asphaltBridge: material('#505956', 0.92),
  lane: material('#ded7bc', 0.9),
  crosswalk: material('#e7e2d0', 0.9),
  rail: material('#68716a', 0.74, 0.3),
  darkMetal: material('#303a39', 0.55, 0.35),
  white: material('#e5e0d2', 0.8),
  roof: material('#575e58', 0.82),
  solar: material('#315e6b', 0.25, 0.42),
  waterTrim: material('#ddd4c2', 0.82),
  trunk: material('#665b45', 1),
  foliage: material('#5f805f', 1),
  foliageLight: material('#7e9b68', 1),
  coral: material('#e86f59', 0.62),
  yellow: material('#e4bd67', 0.7),
  blue: material('#5e9fb1', 0.62),
  smoke: new THREE.MeshBasicMaterial({ color: '#eef0e7', transparent: true, opacity: 0.18, depthWrite: false })
};

const buildingMats = [
  material('#d7ccb6'), material('#c4baa6'), material('#b8c2b7'), material('#dcc4a7'),
  material('#aeb9b6'), material('#d6d8ca'), material('#c4ad9c'), material('#aab4aa')
];

const windowMaterial = new THREE.MeshBasicMaterial({
  color: '#fff5c7', transparent: true, opacity: 0.08, depthWrite: false,
  blending: THREE.AdditiveBlending, vertexColors: true
});
const lampMaterial = new THREE.MeshBasicMaterial({
  color: '#ffd68a', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending
});
const headlightMaterial = new THREE.MeshBasicMaterial({
  color: '#fff0b3', transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending
});

function mesh(geometry, mat, x = 0, y = 0, z = 0, cast = true, receive = true) {
  const item = new THREE.Mesh(geometry, mat);
  item.position.set(x, y, z);
  item.castShadow = cast;
  item.receiveShadow = receive;
  return item;
}

function box(w, h, d, mat, x, y, z, cast = true, receive = true) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, cast, receive);
}

function cylinder(rt, rb, h, segments, mat, x, y, z) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat, x, y, z);
}

// ---------- Environment and miniature base ----------
const baseShadow = box(134, 2.2, 108, MAT.platformEdge, 0, -3.6, 0, false, true);
baseShadow.geometry.translate(0, 0, 0);
world.add(baseShadow);
world.add(box(130, 4.2, 104, MAT.platform, 0, -1.6, 0, false, true));
world.add(box(126, 0.55, 100, MAT.earth, 0, 0.72, 0, false, true));
world.add(box(124.5, 0.28, 98.5, MAT.grass, 0, 1.12, 0, false, true));

const waterUniforms = {
  uTime: { value: 0 },
  uDay: { value: 1 },
  uColorA: { value: new THREE.Color('#315f68') },
  uColorB: { value: new THREE.Color('#78a99e') }
};
const waterMaterial = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  transparent: true,
  side: THREE.DoubleSide,
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vWave;
    void main(){
      vUv=uv;
      vec3 p=position;
      float w=sin(p.y*.62+uTime*1.3)*.08+sin(p.x*1.7-uTime*.8)*.035;
      p.z+=w; vWave=w;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorA; uniform vec3 uColorB; uniform float uDay; uniform float uTime;
    varying vec2 vUv; varying float vWave;
    void main(){
      float stripe=.5+.5*sin(vUv.y*80.0+uTime*1.4+vUv.x*4.0);
      vec3 c=mix(uColorA,uColorB,vUv.x*.55+stripe*.10+vWave*1.6);
      c+=vec3(.18,.21,.18)*stripe*.11*uDay;
      gl_FragColor=vec4(c,.94);
    }
  `
});

const river = mesh(new THREE.PlaneGeometry(14, 96, 18, 96), waterMaterial, 48, 1.55, 0, false, true);
river.rotation.x = -Math.PI / 2;
world.add(river);
world.add(box(1.1, .38, 98, MAT.waterTrim, 40.45, 1.42, 0, false, true));
world.add(box(1.1, .38, 98, MAT.waterTrim, 55.55, 1.42, 0, false, true));

// Sky dome
const skyUniforms = {
  topColor: { value: new THREE.Color('#6f9699') },
  bottomColor: { value: new THREE.Color('#d9c9aa') },
  horizonColor: { value: new THREE.Color('#dfd2bb') }
};
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: 'varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform vec3 topColor; uniform vec3 bottomColor; uniform vec3 horizonColor; varying vec3 vPos;
    void main(){ float h=normalize(vPos).y; float t=smoothstep(-.12,.75,h); vec3 low=mix(bottomColor,horizonColor,smoothstep(-.2,.08,h)); gl_FragColor=vec4(mix(low,topColor,t),1.); }
  `
});
scene.add(mesh(new THREE.SphereGeometry(390, 32, 18), skyMaterial, 0, 0, 0, false, false));

const starGeo = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 650; i++) {
  const a = rand(0, Math.PI * 2);
  const elevation = rand(0.12, 1.25);
  const r = rand(245, 340);
  starPositions.push(Math.cos(a) * Math.cos(elevation) * r, Math.sin(elevation) * r, Math.sin(a) * Math.cos(elevation) * r);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: '#d9e5e4', size: .75, transparent: true, opacity: 0, depthWrite: false });
const stars = new THREE.Points(starGeo, starMaterial);
scene.add(stars);

const sunMat = new THREE.MeshBasicMaterial({ color: '#ffe0a0' });
const moonMat = new THREE.MeshBasicMaterial({ color: '#d7e2df', transparent: true, opacity: .9 });
const sun = mesh(new THREE.SphereGeometry(5.5, 24, 16), sunMat, 0, 0, 0, false, false);
const moon = mesh(new THREE.SphereGeometry(3.2, 20, 12), moonMat, 0, 0, 0, false, false);
scene.add(sun, moon);

const hemi = new THREE.HemisphereLight('#d9e6dd', '#566051', 1.2);
scene.add(hemi);
const ambient = new THREE.AmbientLight('#7e91a6', .18);
scene.add(ambient);
const sunLight = new THREE.DirectionalLight('#fff1cf', 2.2);
sunLight.position.set(-55, 90, -60);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -85;
sunLight.shadow.camera.right = 85;
sunLight.shadow.camera.top = 75;
sunLight.shadow.camera.bottom = -75;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 260;
sunLight.shadow.bias = -0.0007;
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight('#96b9c4', .38);
fillLight.position.set(65, 35, 80);
scene.add(fillLight);

// ---------- Roads, blocks and markings ----------
const roadX = [-46, -16, 14];
const roadZ = [-32, 0, 32];
const roads = new THREE.Group();
world.add(roads);

for (const x of roadX) roads.add(box(7, .35, 91, MAT.asphalt, x, 1.58, 0, false, true));
for (const z of roadZ) roads.add(box(116, .35, 7, MAT.asphalt, -1, 1.59, z, false, true));

// Bridges over the eastern river.
for (const z of roadZ) {
  roads.add(box(22, .8, 7.6, MAT.asphaltBridge, 48, 2.05, z, false, true));
  roads.add(box(22, .48, .32, MAT.rail, 48, 2.65, z - 4.0, false, true));
  roads.add(box(22, .48, .32, MAT.rail, 48, 2.65, z + 4.0, false, true));
  for (const x of [40, 47, 54, 56]) {
    roads.add(box(.28, 1.8, .28, MAT.rail, x, 1.4, z - 4, false, true));
    roads.add(box(.28, 1.8, .28, MAT.rail, x, 1.4, z + 4, false, true));
  }
}

const dashGeoV = new THREE.BoxGeometry(.15, .035, 2.5);
const dashGeoH = new THREE.BoxGeometry(2.5, .035, .15);
for (const x of roadX) {
  for (let z = -43; z <= 43; z += 6) roads.add(mesh(dashGeoV, MAT.lane, x, 1.79, z, false, true));
}
for (const z of roadZ) {
  for (let x = -57; x <= 56; x += 6) roads.add(mesh(dashGeoH, MAT.lane, x, 1.8, z, false, true));
}

for (const ix of roadX) {
  for (const iz of roadZ) {
    for (let i = -3; i <= 3; i++) {
      roads.add(box(.52, .05, 2.3, MAT.crosswalk, ix + i * .88, 1.83, iz - 4.15, false, true));
      roads.add(box(.52, .05, 2.3, MAT.crosswalk, ix + i * .88, 1.83, iz + 4.15, false, true));
      roads.add(box(2.3, .05, .52, MAT.crosswalk, ix - 4.15, 1.83, iz + i * .88, false, true));
      roads.add(box(2.3, .05, .52, MAT.crosswalk, ix + 4.15, 1.83, iz + i * .88, false, true));
    }
  }
}

const blockCols = [[-58, -49.5], [-42.5, -19.5], [-12.5, 10.5], [17.5, 39.5]];
const blockRows = [[-44.5, -35.5], [-28.5, -3.5], [3.5, 28.5], [35.5, 44.5]];

function addBlockPad(col, row, mat = MAT.paving) {
  const [x1, x2] = blockCols[col];
  const [z1, z2] = blockRows[row];
  const w = x2 - x1;
  const d = z2 - z1;
  const pad = box(w, .52, d, mat, (x1 + x2) / 2, 1.56, (z1 + z2) / 2, false, true);
  roads.add(pad);
  return { x1, x2, z1, z2, cx: (x1 + x2) / 2, cz: (z1 + z2) / 2, w, d, top: 1.84 };
}

const blocks = [];
for (let r = 0; r < 4; r++) {
  blocks[r] = [];
  for (let c = 0; c < 4; c++) blocks[r][c] = addBlockPad(c, r, (c === 1 && r === 2) ? MAT.grassLight : MAT.paving);
}

// ---------- Buildings and city details ----------
const windowTransforms = [];
const windowColors = ['#ffe6a0', '#ffd58b', '#bfe0df', '#fff0ca'];
const roofAnimations = [];
const smokePuffs = [];
const turbines = [];
const boats = [];

function registerWindow(x, y, z, sx, sy, rotation, color) {
  windowTransforms.push({ x, y, z, sx, sy, rotation, color: new THREE.Color(color) });
}

function facadeWindows(x, baseY, z, w, d, h, density = 1) {
  const floorH = 1.35;
  const floors = Math.max(2, Math.floor((h - .6) / floorH));
  const colsW = Math.max(2, Math.floor(w / (1.35 / density)));
  const colsD = Math.max(2, Math.floor(d / (1.35 / density)));
  const startY = baseY + 1.05;
  for (let floor = 0; floor < floors; floor++) {
    const wy = startY + floor * floorH;
    for (let i = 0; i < colsW; i++) {
      if (rng() < .08) continue;
      const wx = x - w * .43 + (i / Math.max(1, colsW - 1)) * w * .86;
      const col = pick(windowColors);
      registerWindow(wx, wy, z + d / 2 + .012, .48, .38, 0, col);
      if (rng() > .16) registerWindow(wx, wy, z - d / 2 - .012, .48, .38, Math.PI, col);
    }
    for (let i = 0; i < colsD; i++) {
      if (rng() < .12) continue;
      const wz = z - d * .42 + (i / Math.max(1, colsD - 1)) * d * .84;
      const col = pick(windowColors);
      registerWindow(x + w / 2 + .012, wy, wz, .48, .38, Math.PI / 2, col);
      if (rng() > .18) registerWindow(x - w / 2 - .012, wy, wz, .48, .38, -Math.PI / 2, col);
    }
  }
}

function addBuilding(x, z, w, d, h, options = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  world.add(group);
  const baseY = options.baseY ?? 1.84;
  const mat = options.mat ?? pick(buildingMats);
  const body = box(w, h, d, mat, 0, baseY + h / 2, 0, true, true);
  group.add(body);
  group.add(box(w + .45, .38, d + .45, options.trim ?? MAT.roof, 0, baseY + h + .16, 0));
  if (options.crown) {
    const crownH = Math.max(1.6, h * .1);
    group.add(box(w * .7, crownH, d * .7, options.trim ?? MAT.darkMetal, 0, baseY + h + crownH / 2 + .35, 0));
    if (h > 20) {
      const mast = cylinder(.06, .08, h * .18, 7, MAT.darkMetal, 0, baseY + h + crownH + h * .09, 0);
      group.add(mast);
      const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff765c' });
      const beacon = mesh(new THREE.SphereGeometry(.14, 8, 6), beaconMat, 0, baseY + h + crownH + h * .18, 0, false, false);
      group.add(beacon);
      roofAnimations.push({ object: beacon, type: 'beacon', offset: rand(0, 6) });
    }
  } else if (rng() > .45) {
    group.add(box(w * .28, .55, d * .3, MAT.darkMetal, rand(-w * .2, w * .2), baseY + h + .6, rand(-d * .2, d * .2)));
  }
  facadeWindows(x, baseY, z, w, d, h, options.windowDensity ?? 1);
  return group;
}

function addApartment(x, z, w, d, h, rotation = 0) {
  const group = addBuilding(x, z, w, d, h, { mat: pick(buildingMats.slice(0, 4)), trim: MAT.white, windowDensity: .92 });
  group.rotation.y = rotation;
  const baseY = 1.84;
  for (let f = 2; f < Math.floor(h / 1.35); f += 2) {
    const slab = box(w + .38, .12, d + .55, MAT.white, 0, baseY + f * 1.35, 0, true, true);
    group.add(slab);
  }
  return group;
}

function addHouse(x, z, scale = 1, color = pick(buildingMats)) {
  const baseY = 1.84;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  world.add(group);
  group.add(box(3.2 * scale, 2.2 * scale, 2.8 * scale, color, 0, baseY + 1.1 * scale, 0));
  const roof = mesh(new THREE.ConeGeometry(2.65 * scale, 1.3 * scale, 4), MAT.roof, 0, baseY + 2.75 * scale, 0);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  registerWindow(x, baseY + 1.2 * scale, z + 1.41 * scale, .5 * scale, .55 * scale, 0, pick(windowColors));
  return group;
}

const treeTransforms = [];
function addTree(x, z, scale = 1, light = false) {
  treeTransforms.push({ x, z, scale, light });
}

function treeLine(x1, z1, x2, z2, count, jitter = .25) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? .5 : i / (count - 1);
    addTree(THREE.MathUtils.lerp(x1, x2, t) + rand(-jitter, jitter), THREE.MathUtils.lerp(z1, z2, t) + rand(-jitter, jitter), rand(.72, 1.08), i % 3 === 0);
  }
}

// CBD: paired towers, podiums and mixed high-rises.
addBuilding(-7.8, -20.4, 7.2, 7.5, 32, { mat: buildingMats[4], trim: MAT.darkMetal, crown: true, windowDensity: 1.08 });
addBuilding(3.1, -18.2, 8.4, 8.2, 40, { mat: buildingMats[5], trim: MAT.coral, crown: true, windowDensity: 1.08 });
addBuilding(-6.2, -8.2, 8.4, 7.2, 19, { mat: buildingMats[2], crown: true });
addBuilding(4.7, -7.4, 6.8, 6.5, 25, { mat: buildingMats[0], crown: true });
addBuilding(-5.5, 10.2, 9.2, 8.8, 36, { mat: buildingMats[4], trim: MAT.yellow, crown: true });
addBuilding(4.9, 9.7, 7.4, 8.2, 23, { mat: buildingMats[6], crown: true });
addBuilding(-6.8, 22.2, 6.7, 6.2, 18, { mat: buildingMats[1], crown: true });
addBuilding(4.6, 21.2, 8.2, 7.5, 29, { mat: buildingMats[2], trim: MAT.blue, crown: true });

// A circular cultural pavilion at the north edge of the CBD.
const pavilion = new THREE.Group();
pavilion.position.set(-1, 0, 40);
pavilion.add(cylinder(6.2, 6.2, 2.8, 32, MAT.white, 0, 3.2, 0));
pavilion.add(cylinder(4.7, 5.7, 1.4, 32, MAT.blue, 0, 5.2, 0));
pavilion.add(mesh(new THREE.TorusGeometry(5.6, .16, 8, 40), MAT.darkMetal, 0, 4.2, 0));
pavilion.children[pavilion.children.length - 1].rotation.x = Math.PI / 2;
world.add(pavilion);

// Residential quarter.
addApartment(-38.0, -22, 6.0, 13.0, 10.5, .06);
addApartment(-29.7, -22.2, 6.2, 12.5, 13.5, -.05);
addApartment(-21.9, -21.8, 4.2, 12.4, 8.5, .03);
addApartment(-37.5, -8.9, 6.5, 8.0, 8, -.04);
addApartment(-28.4, -9.1, 7.2, 7.8, 11, .05);
addHouse(-57, -23.5, .86);
addHouse(-56.6, -17.4, .9);
addHouse(-56.8, -10.7, .78);
treeLine(-41.5, -15.5, -20.5, -15.5, 9, .3);

// Civic park and library.
const park = blocks[2][1];
world.add(box(park.w - 1.4, .22, park.d - 1.4, MAT.grassLight, park.cx, 2.02, park.cz, false, true));
world.add(box(2.2, .16, 20.5, MAT.paving, -31, 2.2, 16, false, true));
world.add(box(20.5, .16, 2.0, MAT.paving, -31, 2.21, 16, false, true));
const pond = mesh(new THREE.CircleGeometry(4.5, 40), waterMaterial, -37.35, 2.3, 10.0, false, true);
pond.rotation.x = -Math.PI / 2;
pond.scale.set(1.05, .7, 1);
world.add(pond);
const library = new THREE.Group();
library.position.set(-24.7, 0, 21.8);
library.add(box(8.5, 3.4, 7.5, buildingMats[0], 0, 3.75, 0));
const libraryRoof = mesh(new THREE.CylinderGeometry(5.2, 5.2, .5, 3), MAT.coral, 0, 5.7, 0);
libraryRoof.rotation.y = Math.PI / 2;
library.add(libraryRoof);
world.add(library);
for (const [x, z] of [[-40.2,5.1],[-39,15],[-39,23],[-34,25],[-28,7],[-22,7],[-21,15]]) addTree(x, z, rand(.8, 1.2), true);

// Playground and sports field on the west side.
world.add(box(7.2, .18, 12, MAT.grassLight, -55.2, 2.0, 16, false, true));
world.add(box(5.8, .06, 9.8, MAT.coral, -55.2, 2.13, 16, false, true));
for (let z = 12; z <= 20; z += 2) world.add(box(5.3, .025, .07, MAT.crosswalk, -55.2, 2.19, z, false, true));

// Technology campus and energy district.
for (const [x, z, w, d, h] of [[22.5,8.5,7,8,8],[32,8.5,7,8,12],[22.5,20,7,9,10],[32,20,7,9,7]]) {
  addBuilding(x, z, w, d, h, { mat: buildingMats[5], trim: MAT.blue, windowDensity: .9 });
}
treeLine(19, 15, 37, 15, 8, .18);

const energyBase = blocks[1][3];
world.add(box(energyBase.w - 1.2, .2, energyBase.d - 1.2, MAT.pavingDark, energyBase.cx, 2.0, energyBase.cz, false, true));
addBuilding(22.5, -20, 7, 10, 8, { mat: buildingMats[2], trim: MAT.darkMetal, windowDensity: .7 });
addBuilding(33.5, -21, 7.5, 7, 6.5, { mat: buildingMats[7], trim: MAT.yellow, windowDensity: .6 });
for (const x of [22, 27, 32, 37]) {
  for (const z of [-8.4, -12.1]) {
    const panel = box(3.3, .12, 1.8, MAT.solar, x, 2.75, z);
    panel.rotation.x = -.28;
    world.add(panel);
  }
}
for (const [x, z] of [[27,-25],[36,-10]]) {
  world.add(cylinder(1.7, 1.7, 3.8, 20, MAT.white, x, 3.8, z));
  world.add(mesh(new THREE.TorusGeometry(1.7, .14, 7, 24), MAT.coral, x, 5.72, z));
}

function addWindTurbine(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 1.8, z);
  const mast = cylinder(.13 * scale, .32 * scale, 7.4 * scale, 10, MAT.white, 0, 3.7 * scale, 0);
  group.add(mast);
  const hubY = 7.4 * scale;
  const rotor = new THREE.Group();
  rotor.position.set(0, hubY, .14);
  for (let i = 0; i < 3; i++) {
    const blade = box(.18 * scale, 2.7 * scale, .08, MAT.white, 0, 1.45 * scale, 0);
    blade.position.y = 1.35 * scale;
    blade.rotation.z = i * Math.PI * 2 / 3;
    blade.geometry.translate(0, 1.15 * scale, 0);
    rotor.add(blade);
  }
  rotor.add(mesh(new THREE.SphereGeometry(.3 * scale, 10, 8), MAT.coral, 0, 0, .02));
  group.add(rotor);
  world.add(group);
  turbines.push({ rotor, speed: rand(.35, .55) });
}
addWindTurbine(59, -19, .8);
addWindTurbine(59, 8, .92);
addWindTurbine(59, 34, .72);

// Narrow northern and southern edges: townhouses, market, depot.
for (const x of [-40,-35,-30,-25,-20]) addHouse(x, 40, .75, pick(buildingMats.slice(0, 4)));
for (const x of [-10,-4,2,8]) addBuilding(x, -40, 4.5, 5.6, rand(5, 9), { windowDensity: .75 });
for (const x of [20, 27, 34]) addBuilding(x, 40, 5.3, 5.8, rand(5, 8), { mat: buildingMats[7], windowDensity: .7 });
for (let z = -42; z <= 42; z += 7) {
  addTree(39, z + rand(-.5,.5), rand(.72,1.05), true);
  addTree(57.4, z + rand(-.5,.5), rand(.7,1.0), false);
}

// Harbor details and moving boats.
for (const z of [-15, 16]) {
  const dock = box(5, .35, 2.2, MAT.roof, 41.7, 2.1, z, false, true);
  world.add(dock);
}
function addBoat(z, speed, color) {
  const boat = new THREE.Group();
  boat.position.set(48, 2.15, z);
  const hull = mesh(new THREE.CylinderGeometry(.75, 1.1, 3.6, 4), material(color), 0, 0, 0);
  hull.rotation.x = Math.PI / 2;
  hull.rotation.z = Math.PI / 4;
  boat.add(hull);
  boat.add(box(1.0, .55, 1.2, MAT.white, 0, .55, 0));
  world.add(boat);
  boats.push({ object: boat, speed, offset: z });
}
addBoat(-20, 2.0, '#e06f58');
addBoat(22, -1.45, '#e6bd67');

// Trees become two instanced layers.
const trunkGeo = new THREE.CylinderGeometry(.16, .23, 1.65, 7);
const crownGeo = new THREE.IcosahedronGeometry(1.02, 1);
const trunkMesh = new THREE.InstancedMesh(trunkGeo, MAT.trunk, treeTransforms.length);
const crownMesh = new THREE.InstancedMesh(crownGeo, MAT.foliage, treeTransforms.length);
trunkMesh.castShadow = crownMesh.castShadow = true;
trunkMesh.receiveShadow = crownMesh.receiveShadow = true;
const dummy = new THREE.Object3D();
treeTransforms.forEach((tree, i) => {
  dummy.position.set(tree.x, 2.7 + tree.scale * .35, tree.z);
  dummy.scale.set(tree.scale, tree.scale, tree.scale);
  dummy.rotation.y = rand(0, Math.PI);
  dummy.updateMatrix();
  trunkMesh.setMatrixAt(i, dummy.matrix);
  dummy.position.y = 4.05 + tree.scale * .55;
  dummy.scale.set(tree.scale * 1.15, tree.scale, tree.scale * 1.08);
  dummy.updateMatrix();
  crownMesh.setMatrixAt(i, dummy.matrix);
  crownMesh.setColorAt(i, new THREE.Color(tree.light ? '#7f9d69' : '#587a5b'));
});
world.add(trunkMesh, crownMesh);

// Window instancing after all buildings are registered.
const windowGeo = new THREE.PlaneGeometry(1, 1);
const windows = new THREE.InstancedMesh(windowGeo, windowMaterial, windowTransforms.length);
windows.renderOrder = 2;
windowTransforms.forEach((win, i) => {
  dummy.position.set(win.x, win.y, win.z);
  dummy.rotation.set(0, win.rotation, 0);
  dummy.scale.set(win.sx, win.sy, 1);
  dummy.updateMatrix();
  windows.setMatrixAt(i, dummy.matrix);
  windows.setColorAt(i, win.color);
});
world.add(windows);

// ---------- Street furniture and traffic signals ----------
const polePositions = [];
for (const x of roadX) {
  for (let z = -42; z <= 42; z += 8) {
    if (roadZ.some(v => Math.abs(v - z) < 5)) continue;
    polePositions.push([x - 4.7, z], [x + 4.7, z + 3.5]);
  }
}
for (const z of roadZ) {
  for (let x = -55; x <= 36; x += 9) {
    if (roadX.some(v => Math.abs(v - x) < 5)) continue;
    polePositions.push([x, z - 4.7]);
  }
}
const poleGeo = new THREE.CylinderGeometry(.06, .1, 2.7, 6);
const bulbGeo = new THREE.SphereGeometry(.14, 8, 6);
const poleMesh = new THREE.InstancedMesh(poleGeo, MAT.darkMetal, polePositions.length);
const bulbMesh = new THREE.InstancedMesh(bulbGeo, lampMaterial, polePositions.length);
polePositions.forEach(([x, z], i) => {
  dummy.position.set(x, 3.2, z); dummy.scale.set(1,1,1); dummy.rotation.set(0,0,0); dummy.updateMatrix(); poleMesh.setMatrixAt(i, dummy.matrix);
  dummy.position.y = 4.58; dummy.updateMatrix(); bulbMesh.setMatrixAt(i, dummy.matrix);
});
world.add(poleMesh, bulbMesh);

const signalMaterials = {
  ns: {
    red: new THREE.MeshStandardMaterial({ color: '#421b19', emissive: '#ff4438', emissiveIntensity: .12 }),
    amber: new THREE.MeshStandardMaterial({ color: '#493a1b', emissive: '#ffc53d', emissiveIntensity: .12 }),
    green: new THREE.MeshStandardMaterial({ color: '#173c2b', emissive: '#4cff9a', emissiveIntensity: 2.5 })
  },
  ew: {
    red: new THREE.MeshStandardMaterial({ color: '#421b19', emissive: '#ff4438', emissiveIntensity: 2.5 }),
    amber: new THREE.MeshStandardMaterial({ color: '#493a1b', emissive: '#ffc53d', emissiveIntensity: .12 }),
    green: new THREE.MeshStandardMaterial({ color: '#173c2b', emissive: '#4cff9a', emissiveIntensity: .12 })
  }
};
const signals = [];

function addSignalHead(x, z, rotation, axis) {
  const g = new THREE.Group();
  g.position.set(x, 1.8, z);
  g.rotation.y = rotation;
  g.add(cylinder(.065, .09, 2.65, 7, MAT.darkMetal, 0, 1.32, 0));
  g.add(box(.48, 1.15, .42, MAT.darkMetal, 0, 2.5, 0));
  const colors = ['red', 'amber', 'green'];
  colors.forEach((color, i) => {
    const lens = mesh(new THREE.SphereGeometry(.115, 9, 7), signalMaterials[axis][color], 0, 2.82 - i * .32, -.23, false, false);
    g.add(lens);
  });
  world.add(g);
}

for (const x of roadX) {
  for (const z of roadZ) {
    signals.push({ x, z });
    addSignalHead(x - 4.25, z - 4.25, 0, 'ns');
    addSignalHead(x + 4.25, z + 4.25, Math.PI, 'ns');
    addSignalHead(x - 4.25, z + 4.25, -Math.PI / 2, 'ew');
    addSignalHead(x + 4.25, z - 4.25, Math.PI / 2, 'ew');
  }
}

// ---------- Vehicles with signal-aware movement ----------
const carColors = ['#e45f4f','#e5b95e','#4a8da1','#e7dfcb','#637a6d','#b16d58','#384b50'];
const vehicles = [];
const vehicleRoutes = [
  [new THREE.Vector2(-47.75,-30.15), new THREE.Vector2(15.8,-30.15), new THREE.Vector2(15.8,33.8), new THREE.Vector2(-47.75,33.8)],
  [new THREE.Vector2(-44.2,30.15), new THREE.Vector2(12.2,30.15), new THREE.Vector2(12.2,1.85), new THREE.Vector2(-44.2,1.85)],
  [new THREE.Vector2(-17.8,-33.8), new THREE.Vector2(15.8,-33.8), new THREE.Vector2(15.8,-1.85), new THREE.Vector2(-17.8,-1.85)],
  [new THREE.Vector2(-14.2,1.85), new THREE.Vector2(56,1.85), new THREE.Vector2(56,-1.85), new THREE.Vector2(-14.2,-1.85)],
  [new THREE.Vector2(-47.8,-1.85), new THREE.Vector2(12.2,-1.85), new THREE.Vector2(12.2,30.15), new THREE.Vector2(-47.8,30.15)]
];

function routeLength(points) {
  let length = 0;
  for (let i = 0; i < points.length; i++) length += points[i].distanceTo(points[(i + 1) % points.length]);
  return length;
}

function locateRoute(points, distance) {
  const total = routeLength(points);
  let d = ((distance % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = a.distanceTo(b);
    if (d <= len) {
      const t = d / len;
      return { point: a.clone().lerp(b, t), direction: b.clone().sub(a).normalize(), segment: i };
    }
    d -= len;
  }
  return { point: points[0].clone(), direction: points[1].clone().sub(points[0]).normalize(), segment: 0 };
}

function makeVehicle(type = 'car', color = pick(carColors)) {
  const group = new THREE.Group();
  const isBus = type === 'bus';
  const length = isBus ? 3.8 : rand(1.65, 2.15);
  const width = isBus ? 1.15 : .95;
  const bodyMat = material(color, .58, .08);
  group.add(box(width, isBus ? .9 : .48, length, bodyMat, 0, isBus ? .56 : .42, 0));
  if (isBus) {
    group.add(box(width * .96, .5, length * .78, buildingMats[4], 0, 1.16, -.05));
    for (let z = -1.25; z <= 1.25; z += .8) group.add(box(width + .015, .3, .5, MAT.solar, 0, 1.2, z, false, false));
  } else {
    group.add(box(width * .76, .43, length * .48, MAT.solar, 0, .78, -.08));
  }
  const wheelMat = MAT.darkMetal;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = mesh(new THREE.CylinderGeometry(.19, .19, .12, 10), wheelMat, sx * width * .5, .26, sz * length * .3);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
  }
  for (const x of [-width * .3, width * .3]) group.add(box(.14, .14, .05, headlightMaterial, x, .48, length / 2 + .03, false, false));
  group.scale.setScalar(.92);
  return group;
}

for (let i = 0; i < 31; i++) {
  const route = vehicleRoutes[i % vehicleRoutes.length];
  const total = routeLength(route);
  const object = makeVehicle(i % 13 === 0 ? 'bus' : 'car');
  world.add(object);
  vehicles.push({
    object, route, total,
    distance: (i / 31) * total + (i % 5) * 11,
    baseSpeed: i % 13 === 0 ? rand(3.2, 4.0) : rand(4.4, 6.4),
    currentSpeed: 0,
    phaseOffset: rand(0, 10)
  });
}

// Clouds are soft, low-poly clumps to strengthen depth and time changes.
const clouds = [];
for (let i = 0; i < 7; i++) {
  const cloud = new THREE.Group();
  for (let j = 0; j < 5; j++) {
    const puff = mesh(new THREE.SphereGeometry(rand(3.5, 6.5), 10, 7), MAT.smoke, j * rand(3, 5), rand(-1, 1), rand(-2, 2), false, false);
    puff.scale.y = rand(.35, .6);
    cloud.add(puff);
  }
  cloud.position.set(rand(-130, 100), rand(52, 78), rand(-120, 80));
  scene.add(cloud);
  clouds.push({ object: cloud, speed: rand(.35, .7) });
}

// ---------- UI and focus targets ----------
const ui = {
  time: document.querySelector('#city-time'),
  period: document.querySelector('#period-label'),
  slider: document.querySelector('#time-slider'),
  pause: document.querySelector('#pause-btn'),
  traffic: document.querySelector('#traffic-stat'),
  vehicles: document.querySelector('#vehicle-stat'),
  energy: document.querySelector('#energy-stat'),
  weather: document.querySelector('#weather-icon'),
  labels: [...document.querySelectorAll('.scene-label')]
};

const state = { time: 7.5, speed: 1, paused: false, trafficTime: 0 };
const focusTargets = {
  cbd: { target: new THREE.Vector3(-1, 11, 0), position: new THREE.Vector3(53, 48, 72) },
  park: { target: new THREE.Vector3(-31, 3, 16), position: new THREE.Vector3(23, 36, 71) },
  home: { target: new THREE.Vector3(-31, 4, -16), position: new THREE.Vector3(24, 38, 52) },
  energy: { target: new THREE.Vector3(30, 4, -16), position: new THREE.Vector3(78, 38, 40) },
  reset: { target: new THREE.Vector3(-3, 2, 0), position: new THREE.Vector3(102, 82, 118) }
};
let cameraTween = null;

function focusCity(key) {
  const target = focusTargets[key];
  if (!target) return;
  cameraTween = {
    fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
    toPos: target.position.clone(), toTarget: target.target.clone(), progress: 0
  };
}

document.querySelectorAll('[data-focus]').forEach(btn => btn.addEventListener('click', () => focusCity(btn.dataset.focus)));
document.querySelector('#reset-view').addEventListener('click', () => focusCity('reset'));
document.querySelectorAll('.speed-btn').forEach(btn => btn.addEventListener('click', () => {
  state.speed = Number(btn.dataset.speed);
  state.paused = false;
  document.querySelectorAll('.speed-btn').forEach(item => item.classList.toggle('active', item === btn));
  updatePauseIcon();
}));
ui.pause.addEventListener('click', () => { state.paused = !state.paused; updatePauseIcon(); });
ui.slider.addEventListener('input', () => { state.time = Number(ui.slider.value); updateTimeEnvironment(); });

function updatePauseIcon() {
  ui.pause.innerHTML = state.paused
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7L8 19z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z"/></svg>';
  ui.pause.setAttribute('aria-label', state.paused ? '继续时间' : '暂停时间');
}

function formatTime(time) {
  const h = Math.floor(time) % 24;
  const m = Math.floor((time - Math.floor(time)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getPeriod(time) {
  if (time < 5) return ['深夜 · 城市静谧', 'night'];
  if (time < 7) return ['破晓 · 天光初现', 'dawn'];
  if (time < 10) return ['晨间 · 通勤时段', 'morning'];
  if (time < 16.5) return ['日间 · 城市脉动', 'day'];
  if (time < 19.2) return ['黄昏 · 灯火渐起', 'dusk'];
  if (time < 22.5) return ['入夜 · 华灯璀璨', 'night'];
  return ['深夜 · 城市静谧', 'night'];
}

function mixColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)); }

let daylight = 1;
let nightness = 0;
function updateTimeEnvironment() {
  const t = state.time;
  const sunAltitude = Math.sin(((t - 6) / 12) * Math.PI);
  daylight = smooth(clamp01((sunAltitude + .08) / .45));
  nightness = 1 - daylight;
  const duskDistance = Math.min(Math.abs(t - 6), Math.abs(t - 18));
  const dusk = smooth(clamp01(1 - duskDistance / 1.9));

  const topNight = '#06101d', topDay = '#709a9d', topDusk = '#715a67';
  const bottomNight = '#152031', bottomDay = '#d8cfb8', bottomDusk = '#e88962';
  let top = mixColor(topNight, topDay, daylight);
  let bottom = mixColor(bottomNight, bottomDay, daylight);
  top.lerp(new THREE.Color(topDusk), dusk * .62);
  bottom.lerp(new THREE.Color(bottomDusk), dusk * .82);
  skyUniforms.topColor.value.copy(top);
  skyUniforms.bottomColor.value.copy(bottom);
  skyUniforms.horizonColor.value.copy(bottom.clone().lerp(top, .23));
  scene.background.copy(top);
  scene.fog.color.copy(bottom.clone().lerp(top, .35));

  const angle = ((t - 6) / 24) * Math.PI * 2;
  const sunX = Math.cos(angle) * 170;
  const sunY = Math.sin(angle) * 145;
  sun.position.set(sunX, sunY, -120);
  moon.position.set(-sunX * .86, -sunY * .86, 110);
  sun.visible = sunY > -18;
  moon.visible = -sunY > -16;
  sunLight.position.set(sunX * .55, Math.max(8, sunY), -65);
  sunLight.intensity = .08 + daylight * 2.05 + dusk * .25;
  sunLight.color.copy(mixColor('#9db2cc', '#fff0cd', daylight).lerp(new THREE.Color('#ff9b6b'), dusk * .5));
  hemi.intensity = .3 + daylight * .88;
  hemi.color.copy(mixColor('#21385d', '#e1eee5', daylight));
  ambient.intensity = .2 + nightness * .15;
  ambient.color.copy(mixColor('#7890b2', '#fff2d8', daylight));
  fillLight.intensity = .26 + daylight * .2;
  renderer.toneMappingExposure = .86 + daylight * .24 + dusk * .08;

  starMaterial.opacity = Math.pow(nightness, 1.7) * .9;
  windowMaterial.opacity = .045 + Math.pow(nightness, 1.25) * .92;
  lampMaterial.opacity = .08 + nightness * .92;
  headlightMaterial.opacity = .06 + nightness * .94;
  MAT.smoke.opacity = .08 + daylight * .12;
  waterUniforms.uDay.value = daylight;
  waterUniforms.uColorA.value.copy(mixColor('#132b3d', '#315f68', daylight));
  waterUniforms.uColorB.value.copy(mixColor('#36506c', '#78a99e', daylight));

  const [label, period] = getPeriod(t);
  ui.time.textContent = formatTime(t);
  ui.period.textContent = label;
  ui.weather.className = `weather-icon ${period}`;
  ui.period.style.color = period === 'night' ? '#8fc7dd' : period === 'dusk' ? '#ff9b73' : '#ffd574';
  ui.slider.value = t;
  const rush = (t >= 7 && t <= 9.4) || (t >= 17 && t <= 19.4);
  ui.traffic.textContent = rush ? '繁忙' : t < 5 ? '稀少' : '顺畅';
  ui.traffic.nextElementSibling?.classList.toggle('ok', !rush);
  ui.energy.textContent = String(Math.round(52 + daylight * 43));
}

function updateSignals() {
  const phase = state.trafficTime % 20;
  const nsState = phase < 8 ? 'green' : phase < 10 ? 'amber' : 'red';
  const ewState = phase < 8 ? 'red' : phase < 10 ? 'red' : phase < 18 ? 'green' : 'amber';
  for (const [axis, active] of [['ns', nsState], ['ew', ewState]]) {
    for (const color of ['red','amber','green']) {
      signalMaterials[axis][color].emissiveIntensity = color === active ? 3.4 : .08;
      signalMaterials[axis][color].color.set(color === active
        ? ({ red:'#76211d', amber:'#765b1d', green:'#1b7144' })[color]
        : ({ red:'#351918', amber:'#352e1c', green:'#173327' })[color]);
    }
  }
  return { nsState, ewState };
}

function shouldStop(position, direction, signalState) {
  const axis = Math.abs(direction.y) > Math.abs(direction.x) ? 'ns' : 'ew';
  if (signalState[axis + 'State'] === 'green') return 1;
  let nearest = Infinity;
  for (const signal of signals) {
    const toX = signal.x - position.x;
    const toZ = signal.z - position.y;
    const ahead = toX * direction.x + toZ * direction.y;
    const side = Math.abs(toX * -direction.y + toZ * direction.x);
    if (side < 3.1 && ahead > .55 && ahead < nearest) nearest = ahead;
  }
  if (nearest < 5.3) return clamp01((nearest - 1.35) / 3.2);
  return 1;
}

const clock = new THREE.Clock();
const projected = new THREE.Vector3();
const labelAnchors = {
  cbd: new THREE.Vector3(-1, 44, -2),
  park: new THREE.Vector3(-34, 7, 13),
  home: new THREE.Vector3(-54, 7, -18),
  energy: new THREE.Vector3(31, 11, -17)
};

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const label of ui.labels) {
    projected.copy(labelAnchors[label.dataset.label]).applyMatrix4(world.matrixWorld).project(camera);
    const visible = projected.z < 1 && projected.x > -.9 && projected.x < .9 && projected.y > -.85 && projected.y < .9;
    label.style.opacity = visible ? '.86' : '0';
    label.style.left = `${(projected.x * .5 + .5) * width}px`;
    label.style.top = `${(-projected.y * .5 + .5) * height}px`;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  const motion = state.paused ? 0 : state.speed;
  if (!state.paused) {
    state.time = (state.time + dt * .04 * state.speed) % 24;
    state.trafficTime += dt * Math.min(state.speed, 4);
  }
  updateTimeEnvironment();
  const signalState = updateSignals();
  waterUniforms.uTime.value += dt * (state.paused ? 0 : Math.min(3, state.speed));

  for (const vehicle of vehicles) {
    const located = locateRoute(vehicle.route, vehicle.distance);
    const stopFactor = shouldStop(located.point, located.direction, signalState);
    const targetSpeed = vehicle.baseSpeed * stopFactor;
    vehicle.currentSpeed = THREE.MathUtils.lerp(vehicle.currentSpeed, targetSpeed, 1 - Math.exp(-dt * (stopFactor < .2 ? 8 : 3)));
    vehicle.distance = (vehicle.distance + vehicle.currentSpeed * dt * motion) % vehicle.total;
    const next = locateRoute(vehicle.route, vehicle.distance);
    vehicle.object.position.set(next.point.x, 2.05, next.point.y);
    vehicle.object.rotation.y = Math.atan2(next.direction.x, next.direction.y);
  }

  turbines.forEach(t => { t.rotor.rotation.z -= dt * t.speed * motion; });
  boats.forEach((boat, i) => {
    boat.offset += dt * boat.speed * motion;
    if (boat.offset > 46) boat.offset = -46;
    if (boat.offset < -46) boat.offset = 46;
    boat.object.position.z = boat.offset;
    boat.object.rotation.y = boat.speed > 0 ? 0 : Math.PI;
    boat.object.position.y = 2.13 + Math.sin(waterUniforms.uTime.value * 1.4 + i) * .06;
  });
  roofAnimations.forEach(item => {
    if (item.type === 'beacon') item.object.visible = nightness > .2 && Math.sin(state.trafficTime * 2.4 + item.offset) > .25;
  });
  clouds.forEach(cloud => {
    cloud.object.position.x += dt * cloud.speed;
    if (cloud.object.position.x > 150) cloud.object.position.x = -160;
  });

  if (cameraTween) {
    cameraTween.progress = Math.min(1, cameraTween.progress + dt * .72);
    const e = 1 - Math.pow(1 - cameraTween.progress, 3);
    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, e);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, e);
    if (cameraTween.progress >= 1) cameraTween = null;
  }
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
});

updateTimeEnvironment();
ui.vehicles.textContent = String(vehicles.length);
animate();
window.__cityStarted = true;
window.setTimeout(() => document.querySelector('#loading-screen').classList.add('hidden'), 700);
