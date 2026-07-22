/* ============================================================
 * 微缩城市 · Miniature City  (性能优化版)
 * 核心思路：把 draw call 从上万压到 ~150
 *  - 静态几何按颜色合并成少量大 BufferGeometry
 *  - 窗户用 InstancedBufferGeometry + 自定义 shader，亮灯在 GPU 算
 *  - 红绿灯/路灯/树/车灯 全部 InstancedMesh
 *  - 车辆/行人各合并成单 mesh，每帧只改顶点
 * ============================================================ */
(function () {
'use strict';
if (typeof THREE === 'undefined') return;

/* ---------------- 工具 ---------------- */
var seed = 20260721;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function rr(a, b) { return a + rnd() * (b - a); }
function ri(a, b) { return Math.floor(rr(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t * t * (3 - 2 * t); }
function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

/* ---------------- 参数 ---------------- */
var BX = 10, BZ = 8, SP = 16;
var BLK = 9, PAVE = 3, RW = 2;
var HALF = BLK / 2 + PAVE;
var EXT = BZ * SP + 34;

var scene, camera, renderer, controls;
var sunLight, moonLight, hemiLight;
var sunMesh, moonMesh, stars, skyUni;
var cloudGroup;

var modeW = { day: 1, dusk: 0, night: 0 };
var tod = (function(){
  var m = location.search.match(/[?&]t=([\d.]+)/) || location.hash.match(/t=([\d.]+)/);
  return m ? parseFloat(m[1]) : 12;
})(), playing = true, speed = 16;

var INTS = [], INT_MAP = {};
var CARS = [], PEDS = [];
var lampHeadMat, lampGlowMat, parkLampMat;
var beaconMat;                      // 楼顶红色警示灯
var winMesh, winUni;                // 实例化窗户
var tlUni;                          // 红绿灯 uniform
var fountainPts, fountainBase;
var flagMeshes = [];
var carBodyGeo, carGlassGeo, carHeadGeo, carTailGeo;
var pedBodyGeo, pedHeadGeo;
var treeCanopyMat;                  // 树冠（夜间压暗）

/* ================= 静态合批器 ================= */
var bucket = {};
var _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function addBox(color, x, y, z, w, h, d, rx, ry, rz) {
  var g = new THREE.BoxGeometry(w, h, d);
  _e.set(rx || 0, ry || 0, rz || 0);
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m4);
  if (!bucket[color]) bucket[color] = [];
  bucket[color].push(g);
}
function addGeo(color, g, x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0);
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
  g.applyMatrix4(_m4);
  if (!bucket[color]) bucket[color] = [];
  bucket[color].push(g);
}
function flushBucket(castShadow) {
  for (var color in bucket) {
    var arr = bucket[color];
    var totalV = 0, totalI = 0;
    // 统一转成索引几何统计
    arr.forEach(function (g) {
      totalV += g.attributes.position.count;
      totalI += g.index ? g.index.count : g.attributes.position.count;
    });
    var pos = new Float32Array(totalV * 3);
    var nor = new Float32Array(totalV * 3);
    var idx = new Uint32Array(totalI);
    var vo = 0, io = 0;
    arr.forEach(function (g) {
      var vc = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      if (g.index) {
        var gi = g.index.array;
        for (var i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
        io += gi.length;
      } else {
        for (var j = 0; j < vc; j++) idx[io + j] = vo + j;
        io += vc;
      }
      vo += vc;
      g.dispose();
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: parseInt(color) }));
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  bucket = {};
}

/* ================= 初始化 ================= */
function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfd9e8, 200, 850);

  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 3000);
  camera.position.set(150, 120, 180);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;          // 手动控制，隔帧更新
  document.getElementById('app').appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 15;
  controls.maxDistance = 800;

  hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x8a7f6a, 0.5);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  var D = 220;
  sunLight.shadow.camera.left = -D; sunLight.shadow.camera.right = D;
  sunLight.shadow.camera.top = D; sunLight.shadow.camera.bottom = -D;
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 1600;
  sunLight.shadow.bias = -0.0008;
  sunLight.shadow.normalBias = 0.5;
  scene.add(sunLight); scene.add(sunLight.target);

  moonLight = new THREE.DirectionalLight(0x8fa8d8, 0);
  scene.add(moonLight); scene.add(moonLight.target);

  buildSky();
  buildGroundAndRoads();   // 全部进合批
  buildBlocks();           // 建筑/公园/广场 + 窗户实例
  buildTrafficLights();    // 实例化灯球
  buildStreetLamps();      // 实例化
  buildCars();             // 合并 mesh
  buildPedestrians();      // 合并 mesh

  flushBucket(true);       // 所有静态几何合批

  bindUI();
  window.addEventListener('resize', onResize);
}

/* ================= 天空 ================= */
function buildSky() {
  skyUni = {
    topColor:    { value: new THREE.Color(0x3f8fd2) },
    bottomColor: { value: new THREE.Color(0xcfe8f5) },
    offset:      { value: 33 },
    exponent:    { value: 0.7 }
  };
  var mat = new THREE.ShaderMaterial({
    uniforms: skyUni,
    vertexShader:
      'varying vec3 vW;\n' +
      'void main(){ vec4 w = modelMatrix * vec4(position,1.0);\n' +
      '  vW = w.xyz;\n' +
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 topColor; uniform vec3 bottomColor;\n' +
      'uniform float offset; uniform float exponent;\n' +
      'varying vec3 vW;\n' +
      'void main(){ float h = normalize(vW + offset).y;\n' +
      '  gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h,0.0), exponent), 0.0)), 1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 14), mat);
  sky.renderOrder = -10;
  scene.add(sky);

  var n = 500, pos = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var th = rr(0, Math.PI * 2), ph = rr(0.05, Math.PI * 0.48), r = 1150;
    pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.7, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false
  }));
  stars.renderOrder = -9;
  scene.add(stars);

  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
  scene.add(sunMesh);
  moonMesh = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf4, fog: false }));
  scene.add(moonMesh);

  cloudGroup = new THREE.Group();
  var cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  for (var c = 0; c < 8; c++) {
    var cl = new THREE.Group();
    for (var p = 0, pn = ri(3, 5); p < pn; p++) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(rr(5, 10), 10, 8), cm);
      m.position.set(rr(-9, 9), rr(-1.5, 2), rr(-5, 5));
      m.scale.y = 0.55;
      cl.add(m);
    }
    cl.position.set(rr(-EXT * 1.2, EXT * 1.2), rr(80, 120), rr(-EXT * 1.2, EXT * 1.2));
    cl.userData.v = rr(0.8, 2.0);
    cloudGroup.add(cl);
  }
  scene.add(cloudGroup);
}

/* ================= 地面+道路（全部合批） ================= */
function nearGrid(v) { var n = v / SP; return Math.abs(n - Math.round(n)) < 0.32; }

function buildGroundAndRoads() {
  var g = new THREE.Mesh(new THREE.CircleGeometry(EXT * 1.7, 48),
    new THREE.MeshLambertMaterial({ color: 0x5d8f57 }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.05;
  g.receiveShadow = true;
  scene.add(g);

  var C_ROAD = 0x33373d, C_WALK = 0xa9adb3, C_LINE = 0xd9d9cf, C_ZEBRA = 0xf2f2ea;
  var len = (BZ * SP + HALF + RW) * 2;
  var i, k, x, z;

  for (i = -BX; i <= BX; i++) {
    addBox(C_WALK, i * SP, 0.06, 0, HALF * 2 + RW * 2, 0.12, len);
    addBox(C_ROAD, i * SP, 0.145, 0, RW * 2, 0.05, len);
  }
  for (k = -BZ; k <= BZ; k++) {
    addBox(C_WALK, 0, 0.06, k * SP, len, 0.12, HALF * 2 + RW * 2);
    addBox(C_ROAD, 0, 0.145, k * SP, len, 0.05, RW * 2);
  }

  for (i = -BX; i <= BX; i++)
    for (z = -BZ * SP - HALF + 1; z < BZ * SP + HALF; z += 4)
      if (!nearGrid(z)) addBox(C_LINE, i * SP, 0.185, z, 0.22, 0.02, 1.4);
  for (k = -BZ; k <= BZ; k++)
    for (x = -BX * SP - HALF + 1; x < BX * SP + HALF; x += 4)
      if (!nearGrid(x)) addBox(C_LINE, x, 0.185, k * SP, 1.4, 0.02, 0.22);

  for (i = -BX; i <= BX; i++) {
    for (k = -BZ; k <= BZ; k++) {
      var cx = i * SP, cz = k * SP;
      addBox(C_ROAD, cx, 0.146, cz, RW * 2 + 0.4, 0.052, RW * 2 + 0.4);
      for (var s = 0; s < 4; s++) {
        var horiz = s < 2, sign = (s % 2 === 0) ? 1 : -1;
        for (var t = -1.5; t <= 1.5; t++) {
          if (horiz) addBox(C_ZEBRA, cx + t, 0.185, cz + sign * (RW + 1.1), 1, 0.02, 0.5);
          else       addBox(C_ZEBRA, cx + sign * (RW + 1.1), 0.185, cz + t, 0.5, 0.02, 1);
        }
      }
    }
  }
}

/* ================= 建筑/公园/广场 + 窗户实例 ================= */
var winXf = [], winDat = [];   // 窗户变换与亮灯参数

function buildBlocks() {
  for (var i = -BX; i < BX; i++) {
    for (var k = -BZ; k < BZ; k++) {
      var cx = (i + 0.5) * SP, cz = (k + 0.5) * SP;
      var r = Math.sqrt(cx * cx + cz * cz);
      var choose = rnd();
      var parkP = r < 60 ? 0.09 : (r < 130 ? 0.15 : 0.2);
      var plazaP = r < 70 ? 0.06 : 0.03;
      if (choose < parkP) buildPark(cx, cz);
      else if (choose < parkP + plazaP) buildPlaza(cx, cz);
      else buildCityBlock(cx, cz, r);
    }
  }
  buildWindowsInstanced();
}

function buildCityBlock(cx, cz, r) {
  var layouts = [
    [{ x: 0, z: 0, w: 8.6, d: 8.6 }],
    [{ x: -2.35, z: 0, w: 3.9, d: 8.6 }, { x: 2.35, z: 0, w: 3.9, d: 8.6 }],
    [{ x: 0, z: -2.35, w: 8.6, d: 3.9 }, { x: 0, z: 2.35, w: 8.6, d: 3.9 }],
    [{ x: -2.35, z: -2.35, w: 3.9, d: 3.9 }, { x: 2.35, z: -2.35, w: 3.9, d: 3.9 },
     { x: -2.35, z: 2.35, w: 3.9, d: 3.9 }, { x: 2.35, z: 2.35, w: 3.9, d: 3.9 }]
  ];
  layouts[ri(0, 3)].forEach(function (L) {
    var h, p = rnd();
    if (r < 60)       h = p < 0.35 ? rr(26, 44) : (p < 0.8 ? rr(12, 26) : rr(6, 12));
    else if (r < 130) h = p < 0.5 ? rr(12, 26) : (p < 0.88 ? rr(5, 14) : rr(22, 32));
    else              h = p < 0.6 ? rr(4, 8) : (p < 0.92 ? rr(6, 14) : rr(14, 20));
    addBuilding(cx + L.x, cz + L.z, L.w - 0.5, L.d - 0.5, h);
  });
}

function addBuilding(x, z, w, d, h) {
  var palette = [0xd8cfc0, 0xc9d1d6, 0xb8b2a6, 0x9fb2bf, 0x7f93a3, 0xa8927d,
                 0x8a8f96, 0x6f7d8c, 0xc7b8a0, 0x5d6b7a, 0xb3a48e, 0x94a3a8];
  addBox(palette[ri(0, palette.length - 1)], x, h / 2 + 0.12, z, w, h, d);
  addBox(0x3c4046, x, h + 0.27, z, w + 0.15, 0.3, d + 0.15);
  if (w > 3 && d > 3) addBox(0x54585e, x + rr(-w / 4, w / 4), h + 0.7, z + rr(-d / 4, d / 4), rr(0.8, 1.5), rr(0.5, 1), rr(0.8, 1.5));

  if (h > 24) {
    addBox(0x30343a, x, h + 2.8, z, 0.14, 5, 0.14);
    // 警示灯球后面用实例化，先记位置
    beaconPos.push([x, h + 5.4, z]);
  }

  // 窗户实例数据
  var floors = Math.floor((h - 1.2) / 1.8);
  if (floors < 1) return;
  var density = rr(0.45, 0.65);
  function face(nx, nz, len, ry) {
    var cols = Math.floor((len - 1.2) / 1.15);
    if (cols < 1) return;
    for (var f = 0; f < floors; f++) {
      var y = 1.7 + f * 1.8;
      if (y > h - 0.6) break;
      for (var c = 0; c < cols; c++) {
        if (rnd() > density) continue;
        var off = -((cols - 1) * 1.15) / 2 + c * 1.15;
        var px = x + (Math.abs(nx) > 0 ? nx * (w / 2 + 0.07) : off);
        var pz = z + (Math.abs(nz) > 0 ? nz * (d / 2 + 0.07) : off);
        winXf.push(px, y + 0.12, pz, ry);
        var bright = rnd() < 0.2;
        var bucket = bright ? 2 : (rnd() < 0.5 ? 0 : 1);
        var hue = 0.09 + rnd() * 0.04, sat = rr(0.55, 0.8), li = bright ? 0.72 : 0.55;
        var col = hslToRgb(hue, sat, li);
        winDat.push(col[0], col[1], col[2], bucket,
          bucket === 2 ? rr(22.2, 23.2) : rr(16.4, 19.0),
          bucket === 2 ? rr(3.6, 4.6) : rr(5.2, 7.0));
      }
    }
  }
  face(0, 1, w, 0);
  face(0, -1, w, Math.PI);
  face(1, 0, d, Math.PI / 2);
  face(-1, 0, d, -Math.PI / 2);
}
function hslToRgb(h, s, l) {
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

var beaconPos = [];

/* --- 窗户：GPU 实例化 --- */
function buildWindowsInstanced() {
  var N = winXf.length / 4;
  var geo = new THREE.InstancedBufferGeometry();
  var base = new THREE.PlaneGeometry(0.66, 0.85);
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;

  var xf = new Float32Array(N * 4);
  var dt = new Float32Array(N * 6);
  for (var i = 0; i < N; i++) {
    xf[i * 4]     = winXf[i * 4];
    xf[i * 4 + 1] = winXf[i * 4 + 1];
    xf[i * 4 + 2] = winXf[i * 4 + 2];
    xf[i * 4 + 3] = winXf[i * 4 + 3];
    for (var j = 0; j < 6; j++) dt[i * 6 + j] = winDat[i * 6 + j];
  }
  geo.setAttribute('iXf', new THREE.InstancedBufferAttribute(xf, 4));
  geo.setAttribute('iDat', new THREE.InstancedBufferAttribute(dt, 6));
  geo.instanceCount = N;

  winUni = {
    uTime:  { value: 12 },
    uModeW: { value: new THREE.Vector3(1, 0, 0) },
    uSkyTop:{ value: new THREE.Color(0x3f8fd2) },
    uSkyBot:{ value: new THREE.Color(0xcfe8f5) }
  };
  var mat = new THREE.ShaderMaterial({
    uniforms: winUni,
    vertexShader:
      'attribute vec4 iXf;\n' +
      'attribute vec4 iDat;\n' +
      'attribute vec2 iDat2;\n' +
      'varying vec3 vCol;\n' +
      'varying vec3 vTim;\n' +
      'varying float vSeed;\n' +
      'varying float vFacing;\n' +
      'void main(){\n' +
      '  vCol = iDat.rgb;\n' +
      '  vTim = vec3(iDat.a, iDat2.x, iDat2.y);\n' +
      '  vSeed = fract(iXf.x * 0.371 + iXf.y * 0.717 + iXf.z * 0.513);\n' +
      '  float c = cos(iXf.w), s = sin(iXf.w);\n' +
      '  vFacing = iXf.w;\n' +
      '  vec3 p = position;\n' +
      '  p = vec3(p.x * c, p.y, -p.x * s);\n' +
      '  p += iXf.xyz;\n' +
      '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);\n' +
      '}',
    fragmentShader:
      'uniform float uTime;\n' +
      'uniform vec3 uModeW;\n' +
      'uniform vec3 uSkyTop;\n' +
      'uniform vec3 uSkyBot;\n' +
      'varying vec3 vCol;\n' +
      'varying vec3 vTim;\n' +
      'varying float vSeed;\n' +
      'varying float vFacing;\n' +
      'void main(){\n' +
      '  float bucket = vTim.x;\n' +
      '  float onT = vTim.y, offT = vTim.z;\n' +
      '  bool lit = (onT < offT) ? (uTime >= onT && uTime < offT) : (uTime >= onT || uTime < offT);\n' +
      '  float w = bucket < 0.5 ? uModeW.x : (bucket < 1.5 ? max(uModeW.y, uModeW.x * 0.4) : uModeW.z);\n' +
      '  vec3 col;\n' +
      '  if (lit && w > 0.03) {\n' +
      '    col = vCol * w;\n' +
      '  } else {\n' +
      '    // 未亮窗：白天反射天空（带朝向/随机明暗），夜晚压成深色玻璃\n' +
      '    float dayW = uModeW.x;\n' +
      '    float duskW = uModeW.y;\n' +
      '    float nightW = uModeW.z;\n' +
      '    // 朝向差异：东西向更亮（晨昏反光），北向更暗\n' +
      '    float facingK = 0.75 + 0.25 * sin(vFacing + 0.8);\n' +
      '    // 每窗随机明暗（模拟室内窗帘/家具遮挡）\n' +
      '    float rnd = 0.7 + vSeed * 0.5;\n' +
      '    // 玻璃反射的天空色：偏 top 蓝天，少量 bottom 云白\n' +
      '    vec3 skyRef = mix(uSkyTop, uSkyBot, 0.35) * facingK * rnd;\n' +
      '    // 白天：明亮玻璃反光；黄昏：带暖橙反光；夜晚：深黑玻璃\n' +
      '    vec3 dayGlass   = skyRef * 0.95;\n' +
      '    vec3 duskGlass  = skyRef * vec3(1.0, 0.75, 0.55) * 0.55;\n' +
      '    vec3 nightGlass = vec3(0.05, 0.06, 0.09) * (0.7 + vSeed * 0.4);\n' +
      '    col = dayGlass * dayW + duskGlass * duskW + nightGlass * nightW;\n' +
      '  }\n' +
      '  gl_FragColor = vec4(col, 1.0);\n' +
      '}',
    side: THREE.DoubleSide
  });

  // iDat 是 vec4 + iDat2 vec2 → 合起来 6 个 float
  var dt4 = new Float32Array(N * 4);
  var dt2 = new Float32Array(N * 2);
  for (var i2 = 0; i2 < N; i2++) {
    dt4[i2 * 4]     = winDat[i2 * 6];
    dt4[i2 * 4 + 1] = winDat[i2 * 6 + 1];
    dt4[i2 * 4 + 2] = winDat[i2 * 6 + 2];
    dt4[i2 * 4 + 3] = winDat[i2 * 6 + 3];
    dt2[i2 * 2]     = winDat[i2 * 6 + 4];
    dt2[i2 * 2 + 1] = winDat[i2 * 6 + 5];
  }
  geo.deleteAttribute('iDat');
  geo.setAttribute('iDat', new THREE.InstancedBufferAttribute(dt4, 4));
  geo.setAttribute('iDat2', new THREE.InstancedBufferAttribute(dt2, 2));

  winMesh = new THREE.Mesh(geo, mat);
  winMesh.frustumCulled = false;
  scene.add(winMesh);
}

/* ---------- 公园 ---------- */
function buildPark(cx, cz) {
  addBox(0x6fae62, cx, 0.13, cz, 13, 0.14, 13);
  for (var t = 0, tn = ri(5, 8); t < tn; t++) {
    var tx = cx + rr(-5, 5), tz = cz + rr(-5, 5);
    if (Math.abs(tx - cx) < 2.2 && Math.abs(tz - cz) < 2.2) continue;
    treePos.push([tx, tz, rr(0.8, 1.3), ri(0, 3), rnd() < 0.5 ? 0 : 1, rr(0, Math.PI * 2)]);
  }
  if (rnd() < 0.5 && !fountainPts) {
    var basin = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 14),
      new THREE.MeshLambertMaterial({ color: 0xb9bdc4 }));
    basin.position.set(cx, 0.45, cz);
    basin.castShadow = true;
    scene.add(basin);
    var water = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 14),
      new THREE.MeshLambertMaterial({ color: 0x4fa8d8, transparent: true, opacity: 0.85 }));
    water.position.set(cx, 0.66, cz);
    scene.add(water);
    var PN = 70, pb = new Float32Array(PN * 3);
    fountainBase = new Float32Array(PN * 4);
    for (var q = 0; q < PN; q++) {
      fountainBase[q * 4] = rr(0, Math.PI * 2);
      fountainBase[q * 4 + 1] = rr(0.6, 1.0);
      fountainBase[q * 4 + 2] = rr(2.6, 4.2);
      fountainBase[q * 4 + 3] = rr(0, 1);
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pb, 3));
    fountainPts = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0xbfe6ff, size: 0.22, transparent: true, opacity: 0.9
    }));
    fountainPts.position.set(cx, 0.7, cz);
    scene.add(fountainPts);
  } else {
    for (var f = 0; f < 3; f++) {
      var bed = new THREE.Mesh(new THREE.CylinderGeometry(rr(0.5, 0.9), rr(0.6, 1), 0.35, 8),
        new THREE.MeshLambertMaterial({ color: [0xd86a6a, 0xe8a0b4, 0xe8d060][ri(0, 2)] }));
      bed.position.set(cx + rr(-4, 4), 0.32, cz + rr(-4, 4));
      bed.castShadow = true;
      scene.add(bed);
    }
  }
  for (var b = 0; b < 2; b++) {
    var bx = cx + rr(-4.5, 4.5), bz = cz + rr(-4.5, 4.5), br = rr(0, Math.PI * 2);
    addBox(0x8a6a48, bx, 0.42 + 0.14, bz, 1.6, 0.12, 0.5, 0, br, 0);
    addBox(0x8a6a48, bx - Math.sin(br) * 0.22, 0.62 + 0.14, bz - Math.cos(br) * 0.22, 1.6, 0.4, 0.1, 0, br, 0);
    addBox(0x3c4046, bx + Math.cos(br) * 0.65, 0.21 + 0.14, bz - Math.sin(br) * 0.65, 0.1, 0.42, 0.45, 0, br, 0);
    addBox(0x3c4046, bx - Math.cos(br) * 0.65, 0.21 + 0.14, bz + Math.sin(br) * 0.65, 0.1, 0.42, 0.45, 0, br, 0);
  }
  for (var l = 0; l < 2; l++) parkLampPos.push([cx + rr(-5, 5), cz + rr(-5, 5)]);
}

var treePos = [], parkLampPos = [];

/* ---------- 广场 ---------- */
function buildPlaza(cx, cz) {
  for (var ix = 0; ix < 6; ix++)
    for (var iz = 0; iz < 6; iz++)
      addBox((ix + iz) % 2 === 0 ? 0xc2b7a3 : 0xb0a48f,
        cx - 5.375 + ix * 2.15, 0.14, cz - 5.375 + iz * 2.15, 2.15, 0.15, 2.15);

  var base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 10),
    new THREE.MeshLambertMaterial({ color: 0x9a948a }));
  base.position.set(cx, 0.4, cz);
  base.castShadow = true;
  scene.add(base);
  addBox(0x8f9aa8, cx, 3.4, cz, 0.72, 5.5, 0.72, 0, Math.PI / 4, 0);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8b060, emissive: 0x332200 }));
  cap.position.set(cx, 6.4, cz);
  scene.add(cap);
  beaconCapMats.push(cap.material);

  for (var f = 0; f < 3; f++) {
    var ang = f / 3 * Math.PI * 2 + 0.5;
    var fx = cx + Math.cos(ang) * 4.6, fz = cz + Math.sin(ang) * 4.6;
    addBox(0xd8d8d8, fx, 3.1, fz, 0.1, 6, 0.1);
    var fm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 6, 2),
      new THREE.MeshLambertMaterial({ color: 0xc0453e, side: THREE.DoubleSide }));
    fm.position.set(fx + 0.78, 5.4, fz);
    scene.add(fm);
    flagMeshes.push({ mesh: fm, base: fm.geometry.attributes.position.array.slice() });
  }
}
var beaconCapMats = [];

/* ================= 红绿灯（实例化） ================= */
var TL_DUR = [9, 3, 1.5, 9, 3, 1.5], TL_TOTAL = 27;
function tlState(phase, T) {
  var t = (T + phase * TL_TOTAL / 2) % TL_TOTAL, acc = 0;
  for (var i = 0; i < 6; i++) { acc += TL_DUR[i]; if (t < acc) return i; }
  return 0;
}
function tlColors(st) {
  switch (st) {
    case 0: return { ns: 'g', ew: 'r' };
    case 1: return { ns: 'y', ew: 'r' };
    case 2: return { ns: 'r', ew: 'r' };
    case 3: return { ns: 'r', ew: 'g' };
    case 4: return { ns: 'r', ew: 'y' };
    default: return { ns: 'r', ew: 'r' };
  }
}

function buildTrafficLights() {
  // 先收集路口与灯球实例数据
  var inst = [];   // x,y,z, dirIdx(ns=0/ew=1), colorIdx(r=0/y=1/g=2), phase
  for (var i = -BX; i <= BX; i++) {
    for (var k = -BZ; k <= BZ; k++) {
      if (((i + k) & 1) !== 0) continue;
      if (Math.abs(i) === BX || Math.abs(k) === BZ) continue;
      var cx = i * SP, cz = k * SP;
      var phase = Math.abs(i * 5 + k * 9) % 2;
      INT_MAP[i + ',' + k] = INTS.length;
      INTS.push({ i: i, k: k, x: cx, z: cz, phase: phase });
      [[RW + 0.7, RW + 0.7], [-RW - 0.7, -RW - 0.7]].forEach(function (corner) {
        // 杆与箱进合批
        addBox(0x26292f, cx + corner[0], 1.55 + 0.14, cz + corner[1], 0.14, 3.1, 0.14);
        // 每个角 2 个方向箱 + 3 灯球
        [0, 1].forEach(function (dir) {
          var ry = dir === 0 ? 0 : Math.PI / 2;
          addBox(0x26292f, cx + corner[0], 3.3 + 0.14, cz + corner[1], 0.55, 1.35, 0.55, 0, ry, 0);
          for (var c = 0; c < 3; c++) {
            var lx = dir === 0 ? 0.29 : 0, lz = dir === 0 ? 0 : 0.29;
            inst.push(cx + corner[0] + lx, 3.72 - c * 0.42 + 0.14, cz + corner[1] + lz,
                      dir, c, phase);
          }
        });
      });
    }
  }

  // 灯球 InstancedBufferGeometry + shader 按 simT 切换
  var N = inst.length / 6;
  var geo = new THREE.InstancedBufferGeometry();
  var base = new THREE.SphereGeometry(0.16, 8, 6);
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.normal = base.attributes.normal;

  var iPos = new Float32Array(N * 3);
  var iCfg = new Float32Array(N * 3);   // dir, colorIdx, phase
  for (var n = 0; n < N; n++) {
    iPos[n * 3] = inst[n * 6]; iPos[n * 3 + 1] = inst[n * 6 + 1]; iPos[n * 3 + 2] = inst[n * 6 + 2];
    iCfg[n * 3] = inst[n * 6 + 3]; iCfg[n * 3 + 1] = inst[n * 6 + 4]; iCfg[n * 3 + 2] = inst[n * 6 + 5];
  }
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
  geo.setAttribute('iCfg', new THREE.InstancedBufferAttribute(iCfg, 3));
  geo.instanceCount = N;

  tlUni = { uSimT: { value: 0 } };
  var mat = new THREE.ShaderMaterial({
    uniforms: tlUni,
    vertexShader:
      'attribute vec3 iPos;\n' +
      'attribute vec3 iCfg;\n' +
      'varying float vDir;\n' +
      'varying float vCol;\n' +
      'varying float vPhase;\n' +
      'void main(){\n' +
      '  vDir = iCfg.x; vCol = iCfg.y; vPhase = iCfg.z;\n' +
      '  gl_Position = projectionMatrix * viewMatrix * vec4(position + iPos, 1.0);\n' +
      '}',
    fragmentShader:
      'uniform float uSimT;\n' +
      'varying float vDir;\n' +
      'varying float vCol;\n' +
      'varying float vPhase;\n' +
      'float state(float T){\n' +
      '  float t = mod(T + vPhase * 13.5, 27.0);\n' +
      '  if (t < 9.0) return 0.0;\n' +
      '  if (t < 12.0) return 1.0;\n' +
      '  if (t < 13.5) return 2.0;\n' +
      '  if (t < 22.5) return 3.0;\n' +
      '  if (t < 25.5) return 4.0;\n' +
      '  return 5.0;\n' +
      '}\n' +
      'void main(){\n' +
      '  float st = state(uSimT);\n' +
      '  float myCol;\n' +  // 该方向当前应有灯色 0=r 1=y 2=g
      '  if (vDir < 0.5) {\n' +  // ns
      '    myCol = (st == 0.0) ? 2.0 : (st == 1.0) ? 1.0 : 0.0;\n' +
      '  } else {\n' +
      '    myCol = (st == 3.0) ? 2.0 : (st == 4.0) ? 1.0 : 0.0;\n' +
      '  }\n' +
      '  bool on = abs(vCol - myCol) < 0.1;\n' +
      '  vec3 col;\n' +
      '  if (vCol < 0.5)      col = on ? vec3(1.0, 0.25, 0.2) : vec3(0.25, 0.05, 0.05);\n' +
      '  else if (vCol < 1.5) col = on ? vec3(1.0, 0.8, 0.2)  : vec3(0.28, 0.2, 0.05);\n' +
      '  else                 col = on ? vec3(0.25, 1.0, 0.4) : vec3(0.05, 0.25, 0.08);\n' +
      '  gl_FragColor = vec4(col, 1.0);\n' +
      '}'
  });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
}
function updateTrafficLights(T) { tlUni.uSimT.value = T; }

/* ================= 路灯（实例化） ================= */
function buildStreetLamps() {
  lampHeadMat = new THREE.MeshLambertMaterial({ color: 0x444444, emissive: 0x000000 });
  lampGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0, depthWrite: false
  });
  var positions = [];
  var i, k;
  for (k = -BZ; k <= BZ; k += 2)
    for (i = -BX; i < BX; i += 2) {
      positions.push([(i + 0.5) * SP + 3, k * SP + RW + 0.9]);
      positions.push([(i + 0.5) * SP - 3, k * SP - RW - 0.9]);
    }
  for (i = -BX; i <= BX; i += 2)
    for (k = -BZ; k < BZ; k += 2) {
      positions.push([i * SP + RW + 0.9, (k + 0.5) * SP - 3]);
      positions.push([i * SP - RW - 0.9, (k + 0.5) * SP + 3]);
    }
  positions.forEach(function (p) {
    addBox(0x2e3138, p[0], 2.3 + 0.12, p[1], 0.12, 4.6, 0.12);
  });
  // 灯头 + 光晕实例化
  var headIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.28), lampHeadMat, positions.length);
  var glowIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6), lampGlowMat, positions.length);
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  var qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  positions.forEach(function (p, idx) {
    m4.compose(new THREE.Vector3(p[0], 4.65 + 0.12, p[1]), q, s);
    headIM.setMatrixAt(idx, m4);
    m4.compose(new THREE.Vector3(p[0], 4.4 + 0.12, p[1]), qFlat, s);
    glowIM.setMatrixAt(idx, m4);
  });
  scene.add(headIM); scene.add(glowIM);

  // 公园灯
  parkLampMat = new THREE.MeshLambertMaterial({ color: 0x333333, emissive: 0x000000 });
  parkLampPos.forEach(function (p) {
    addBox(0x2e3138, p[0], 1.0, p[1], 0.1, 1.8, 0.1);
  });
  var parkIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), parkLampMat, parkLampPos.length);
  parkLampPos.forEach(function (p, idx) {
    m4.compose(new THREE.Vector3(p[0], 1.95, p[1]), q, s);
    parkIM.setMatrixAt(idx, m4);
  });
  scene.add(parkIM);

  // 树（合批）
  var greens = [0x3e7d46, 0x4c8f52, 0x35704a, 0x5a9a4e];
  treePos.forEach(function (t) {
    var x = t[0], z = t[1], sc = t[2], ci = t[3], kind = t[4], rot = t[5];
    addGeo(0x6a4a32, new THREE.CylinderGeometry(0.12 * sc, 0.16 * sc, 1.1 * sc, 6), x, 0.55 * sc + 0.14, z, 0, rot, 0);
    if (kind === 0) addGeo(greens[ci], new THREE.ConeGeometry(0.85 * sc, 2.2 * sc, 8), x, 2.2 * sc + 0.14, z, 0, rot, 0);
    else            addGeo(greens[ci], new THREE.IcosahedronGeometry(1.0 * sc, 0), x, 1.9 * sc + 0.14, z, 0, rot, 0, 1, 1.15, 1);
  });

  // 楼顶警示灯
  beaconMat = new THREE.MeshLambertMaterial({ color: 0xff4444, emissive: 0x330000 });
  var beaconIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), beaconMat, Math.max(1, beaconPos.length));
  beaconPos.forEach(function (p, idx) {
    m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q, s);
    beaconIM.setMatrixAt(idx, m4);
  });
  beaconIM.count = beaconPos.length;
  scene.add(beaconIM);
}

/* ================= 车辆（合并 mesh + 动态顶点） ================= */
var CAR_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad,
                  0x16a085, 0xd35400, 0x7f8c8d, 0x2c3e50, 0xe74c3c];
var CAR_T = [
  { len: 1.9, h: 0.5, cab: 0.85, cabH: 0.42, cabLen: 0.85 },
  { len: 3.2, h: 0.75, cab: 0.9, cabH: 0.55, cabLen: 0.9 }
];

function buildCars() {
  var paths = [];
  for (var p = 0; p < 24; p++) paths.push(makePath());
  var total = 52;
  for (var c = 0; c < total; c++) {
    var path = paths[c % paths.length];
    var isTaxi = rnd() < 0.12, isTruck = !isTaxi && rnd() < 0.1;
    CARS.push({
      path: path, s: (c / total) * path.total + rr(0, 6),
      v: rr(7.5, 10.5), curV: 0, targetV: 0,
      type: isTruck ? 1 : 0,
      color: isTaxi ? 0xf5c518 : CAR_COLORS[ri(0, CAR_COLORS.length - 1)],
      ang: 0
    });
  }

  // 模板：车身(带顶点色) / 玻璃 / 前灯 / 尾灯
  carBodyGeo  = buildCarBuffer(function (t) { return mkCarBody(t); }, true);
  carGlassGeo = buildCarBuffer(function (t) { return mkCarGlass(t); }, false);
  carHeadGeo  = buildCarBuffer(function (t) { return mkCarLamps(t, 1); }, false);
  carTailGeo  = buildCarBuffer(function (t) { return mkCarLamps(t, -1); }, false);

  scene.add(new THREE.Mesh(carBodyGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  scene.add(new THREE.Mesh(carGlassGeo, new THREE.MeshLambertMaterial({ color: 0x222831 })));
  var headMat2 = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  var tailMat2 = new THREE.MeshBasicMaterial({ color: 0x881111 });
  window.__headMat = headMat2; window.__tailMat = tailMat2;
  scene.add(new THREE.Mesh(carHeadGeo, headMat2));
  scene.add(new THREE.Mesh(carTailGeo, tailMat2));
}

/* 为 52 辆车分配缓冲空间；返回带动态 position 的 BufferGeometry */
function buildCarBuffer(mkFn, withColor) {
  var perCar = [], totalV = 0, totalI = 0;
  for (var i = 0; i < CARS.length; i++) {
    var parts = mkFn(CARS[i].type);
    var v = 0, idx = 0;
    parts.forEach(function (pp) { v += pp.pos.length / 3; idx += pp.idx.length; });
    perCar.push({ parts: parts, vOff: totalV, vCount: v });
    totalV += v; totalI += idx;
  }
  var pos = new Float32Array(totalV * 3);
  var nor = new Float32Array(totalV * 3);
  var idxArr = new Uint16Array(totalI);
  var col = withColor ? new Float32Array(totalV * 3) : null;
  var io = 0;
  CARS.forEach(function (car, ci) {
    var rec = perCar[ci];
    var v = rec.vOff;
    rec.parts.forEach(function (pp) {
      for (var j = 0; j < pp.idx.length; j++) idxArr[io + j] = pp.idx[j] + v;
      io += pp.idx.length;
      v += pp.pos.length / 3;
    });
    if (withColor) {
      var c = new THREE.Color(car.color);
      for (var vv = 0; vv < rec.vCount; vv++) {
        col[(rec.vOff + vv) * 3] = c.r;
        col[(rec.vOff + vv) * 3 + 1] = c.g;
        col[(rec.vOff + vv) * 3 + 2] = c.b;
      }
    }
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  if (withColor) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idxArr, 1));
  g.userData.perCar = perCar;
  return g;
}

/* 模板几何：局部坐标（车头朝 +z），返回 [{pos,nor,idx}] */
function boxPart(w, h, d, cx, cy, cz) {
  var g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  var pos = Array.prototype.slice.call(g.attributes.position.array);
  var nor = Array.prototype.slice.call(g.attributes.normal.array);
  var idx = Array.prototype.slice.call(g.index.array);
  return { pos: pos, nor: nor, idx: idx };
}
function mkCarBody(t) {
  var T = CAR_T[t];
  var parts = [boxPart(1.0, T.h, T.len, 0, 0.32 + T.h / 2, 0)];
  // 轮子也并入车身（深色由顶点色统一，简化）
  [[-0.5, T.len / 2 - 0.45], [0.5, T.len / 2 - 0.45], [-0.5, -T.len / 2 + 0.45], [0.5, -T.len / 2 + 0.45]]
    .forEach(function (wp) { parts.push(boxPart(0.16, 0.44, 0.44, wp[0], 0.24, wp[1])); });
  return parts;
}
function mkCarGlass(t) {
  var T = CAR_T[t];
  return [boxPart(T.cab, T.cabH, t === 1 ? 0.9 : T.len * 0.45, 0,
    0.32 + T.h + T.cabH / 2, t === 1 ? -T.len / 2 + 0.7 : 0.1)];
}
function mkCarLamps(t, dir) {
  var T = CAR_T[t];
  var z = dir * (T.len / 2 + 0.02);
  return [boxPart(0.22, 0.12, 0.06, -0.3, 0.55, z), boxPart(0.22, 0.12, 0.06, 0.3, 0.55, z)];
}

/* 每帧重算所有车顶点 */
var _sin = Math.sin, _cos = Math.cos;
function updateCarGeometry(geo) {
  var pos = geo.attributes.position.array;
  var nor = geo.attributes.normal.array;
  var perCar = geo.userData.perCar;
  for (var ci = 0; ci < CARS.length; ci++) {
    var car = CARS[ci];
    var p = pathPoint(car.path, car.s);
    car.ang = Math.atan2(p.dx, p.dz);
    var c = _cos(car.ang), s = _sin(car.ang);
    var rec = perCar[ci];
    var dst = rec.vOff * 3;
    rec.parts.forEach(function (pp) {
      var src = pp.pos, srcN = pp.nor;
      for (var j = 0; j < src.length; j += 3) {
        var lx = src[j], ly = src[j + 1], lz = src[j + 2];
        pos[dst + j]     = p.x + lx * c + lz * s;
        pos[dst + j + 1] = 0.16 + ly;
        pos[dst + j + 2] = p.z - lx * s + lz * c;
        var nx = srcN[j], nz = srcN[j + 2];
        nor[dst + j]     = nx * c + nz * s;
        nor[dst + j + 1] = srcN[j + 1];
        nor[dst + j + 2] = -nx * s + nz * c;
      }
      dst += src.length;
    });
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
}

/* ================= 行人（合并 mesh） ================= */
var PED_COLS = [0xc0453e, 0x3e6dc0, 0x3ec07a, 0xc0a53e, 0x9b3ec0, 0xe0e0e0, 0x404858];
function buildPedestrians() {
  for (var n = 0; n < 20; n++) {
    var horiz = rnd() < 0.5;
    var gridLine = horiz ? ri(-BZ + 1, BZ - 1) : ri(-BX + 1, BX - 1);
    PEDS.push({
      horiz: horiz,
      line: gridLine * SP + (rnd() < 0.5 ? HALF - 0.6 : -(HALF - 0.6)),
      p: rr(-BX * SP * 0.7, BX * SP * 0.7),
      v: rr(1.0, 1.7) * (rnd() < 0.5 ? 1 : -1),
      col: PED_COLS[ri(0, PED_COLS.length - 1)]
    });
  }
  pedBodyGeo = buildPedBuffer(true);
  pedHeadGeo = buildPedBuffer(false);
  scene.add(new THREE.Mesh(pedBodyGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  scene.add(new THREE.Mesh(pedHeadGeo, new THREE.MeshLambertMaterial({ color: 0xe8c39a })));
}
function buildPedBuffer(withColor) {
  var totalV = 0, totalI = 0, templates = [];
  for (var i = 0; i < PEDS.length; i++) {
    var g = withColor ? new THREE.CylinderGeometry(0.16, 0.2, 0.62, 6)
                      : new THREE.SphereGeometry(0.15, 8, 6);
    var pos = Array.prototype.slice.call(g.attributes.position.array);
    var nor = Array.prototype.slice.call(g.attributes.normal.array);
    var idx = Array.prototype.slice.call(g.index.array);
    templates.push({ pos: pos, nor: nor, idx: idx, vOff: totalV });
    totalV += pos.length / 3; totalI += idx.length;
  }
  var pos = new Float32Array(totalV * 3), nor = new Float32Array(totalV * 3);
  var idxArr = new Uint16Array(totalI);
  var col = withColor ? new Float32Array(totalV * 3) : null;
  var io = 0;
  templates.forEach(function (t, i) {
    for (var j = 0; j < t.idx.length; j++) idxArr[io + j] = t.idx[j] + t.vOff;
    io += t.idx.length;
    if (withColor) {
      var c = new THREE.Color(PEDS[i].col);
      for (var v = 0; v < t.pos.length / 3; v++) {
        col[(t.vOff + v) * 3] = c.r; col[(t.vOff + v) * 3 + 1] = c.g; col[(t.vOff + v) * 3 + 2] = c.b;
      }
    }
  });
  var g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g2.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  if (withColor) g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g2.setIndex(new THREE.BufferAttribute(idxArr, 1));
  g2.userData.templates = templates;
  return g2;
}
function pedPhysics(dt) {
  var limX = BX * SP - HALF, limZ = BZ * SP - HALF;
  for (var i = 0; i < PEDS.length; i++) {
    var pd = PEDS[i];
    pd.p += pd.v * dt;
    var lim = pd.horiz ? limX : limZ;
    if (pd.p > lim) { pd.p = lim; pd.v *= -1; }
    if (pd.p < -lim) { pd.p = -lim; pd.v *= -1; }
  }
}
function updatePedGeometry() {
  [pedBodyGeo, pedHeadGeo].forEach(function (geo, gi) {
    var pos = geo.attributes.position.array;
    var nor = geo.attributes.normal.array;
    var templates = geo.userData.templates;
    for (var i = 0; i < PEDS.length; i++) {
      var pd = PEDS[i];
      var bob = Math.abs(Math.sin(pd.p * 2.6)) * 0.05;
      var ang = pd.horiz ? (pd.v > 0 ? Math.PI / 2 : -Math.PI / 2) : (pd.v > 0 ? 0 : Math.PI);
      var c = _cos(ang), s = _sin(ang);
      var px = pd.horiz ? pd.p : pd.line;
      var pz = pd.horiz ? pd.line : pd.p;
      var py = gi === 0 ? 0.2 + 0.31 + bob : 0.2 + 0.82 + bob;
      var t = templates[i];
      var dst = t.vOff * 3;
      for (var j = 0; j < t.pos.length; j += 3) {
        var lx = t.pos[j], ly = t.pos[j + 1], lz = t.pos[j + 2];
        pos[dst + j]     = px + lx * c + lz * s;
        pos[dst + j + 1] = py + ly;
        pos[dst + j + 2] = pz - lx * s + lz * c;
        var nx = t.nor[j], nz = t.nor[j + 2];
        nor[dst + j]     = nx * c + nz * s;
        nor[dst + j + 1] = t.nor[j + 1];
        nor[dst + j + 2] = -nx * s + nz * c;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  });
}

/* ================= 路径/车辆逻辑（同前） ================= */
function makePath() {
  var si = ri(-BX + 1, BX - 1), sk = ri(-BZ + 1, BZ - 1);
  var i = si, k = sk, dir = ri(0, 3);
  var pts = [{ i: i, k: k }];
  var guard = 0;
  while (guard++ < 60) {
    if (rnd() < 0.4) dir = (dir + (rnd() < 0.5 ? 1 : 3)) % 4;
    var ni = i, nk = k;
    if (dir === 0) ni++; else if (dir === 1) ni--; else if (dir === 2) nk++; else nk--;
    ni = clamp(ni, -BX + 1, BX - 1);
    nk = clamp(nk, -BZ + 1, BZ - 1);
    if (ni === i && nk === k) { dir = (dir + 2) % 4; continue; }
    i = ni; k = nk;
    pts.push({ i: i, k: k });
    if (i === si && k === sk && pts.length > 5) break;
    if (pts.length >= 22) break;
  }
  if (!(i === si && k === sk)) {
    while (i !== si) { i += (si > i ? 1 : -1); pts.push({ i: i, k: k }); }
    while (k !== sk) { k += (sk > k ? 1 : -1); pts.push({ i: i, k: k }); }
  }
  var cum = [0];
  for (var q = 1; q < pts.length; q++) {
    var dx = (pts[q].i - pts[q - 1].i) * SP, dz = (pts[q].k - pts[q - 1].k) * SP;
    cum.push(cum[q - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  return { pts: pts, cum: cum, total: cum[cum.length - 1] };
}
function pathPoint(path, s) {
  s = ((s % path.total) + path.total) % path.total;
  var cum = path.cum, pts = path.pts;
  var lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  var t = (s - cum[lo]) / Math.max(0.0001, cum[lo + 1] - cum[lo]);
  var ax = pts[lo].i * SP, az = pts[lo].k * SP;
  var bx = pts[lo + 1].i * SP, bz = pts[lo + 1].k * SP;
  var dx = bx - ax, dz = bz - az;
  var len = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= len; dz /= len;
  var off = RW / 2;
  return { x: lerp(ax, bx, t) + dz * off, z: lerp(az, bz, t) - dx * off, dx: dx, dz: dz, seg: lo };
}
function carUpdate(car, dt, T) {
  var look = 8;
  var ahead = pathPoint(car.path, car.s + 3);
  car.targetV = car.v;
  var pts = car.path.pts, cum = car.path.cum;
  var seg = ahead.seg;
  var segEndS = cum[seg + 1];
  var distToNode = segEndS - (car.s + 3);
  if (distToNode > 0 && distToNode < look + 2) {
    var node = pts[seg + 1];
    var idx = INT_MAP[node.i + ',' + node.k];
    if (idx !== undefined) {
      var it = INTS[idx];
      var horiz = Math.abs(ahead.dx) > 0.5;
      var cols = tlColors(tlState(it.phase, T));
      var my = horiz ? cols.ew : cols.ns;
      if (my !== 'g') {
        var stopS = segEndS - 3.4;
        var dist = stopS - car.s;
        if (dist < look + 2) {
          car.targetV = clamp(dist * 1.4, 0, car.v);
          if (dist < 0.5) car.targetV = 0;
        }
      }
    }
  }
  for (var o = 0; o < CARS.length; o++) {
    var other = CARS[o];
    if (other === car || other.path !== car.path) continue;
    var gap = other.s - car.s;
    if (gap < 0) gap += car.path.total;
    if (gap > 0 && gap < 6.5) car.targetV = Math.min(car.targetV, Math.max(0, (gap - 3.4) * 2.2));
  }
  var accel = car.targetV > car.curV ? 5.5 : 14;
  car.curV += clamp(car.targetV - car.curV, -accel * dt, accel * dt);
  car.s += car.curV * dt;
}

/* ================= 昼夜系统 ================= */
var PAL = {
  keys: [
    { t: 0.0,  top: 0x060a18, bot: 0x0c1226, fog: 0x0a0e1c, sun: 0x222233, si: 0.0,  hi: 0.10, cloud: 0x2a3040 },
    { t: 4.5,  top: 0x0a1024, bot: 0x1a2340, fog: 0x11182c, sun: 0x333344, si: 0.0,  hi: 0.12, cloud: 0x323a50 },
    { t: 5.8,  top: 0x2a3560, bot: 0xd88a5a, fog: 0x9a7a6a, sun: 0xffb080, si: 0.35, hi: 0.30, cloud: 0xd8a080 },
    { t: 7.0,  top: 0x4a90c8, bot: 0xc8dce8, fog: 0xb8cdd8, sun: 0xfff0d8, si: 0.85, hi: 0.48, cloud: 0xf0e8e0 },
    { t: 10.0, top: 0x3f8fd2, bot: 0xcfe8f5, fog: 0xbfd9e8, sun: 0xffffff, si: 1.10, hi: 0.50, cloud: 0xffffff },
    { t: 15.0, top: 0x3f8fd2, bot: 0xd4ecf7, fog: 0xc2dce9, sun: 0xfff8ee, si: 1.15, hi: 0.50, cloud: 0xffffff },
    { t: 17.2, top: 0x3a6ab0, bot: 0xf0c890, fog: 0xd0b090, sun: 0xffd8a0, si: 0.90, hi: 0.42, cloud: 0xf8e0c0 },
    { t: 18.4, top: 0x35306a, bot: 0xff8a50, fog: 0xc07a58, sun: 0xff9a50, si: 0.50, hi: 0.30, cloud: 0xe8a070 },
    { t: 19.4, top: 0x1a2048, bot: 0xb05060, fog: 0x58384a, sun: 0xff7050, si: 0.15, hi: 0.20, cloud: 0x885868 },
    { t: 20.6, top: 0x0a0f28, bot: 0x1a2244, fog: 0x11162a, sun: 0x222233, si: 0.0,  hi: 0.12, cloud: 0x38405a },
    { t: 24.0, top: 0x060a18, bot: 0x0c1226, fog: 0x0a0e1c, sun: 0x222233, si: 0.0,  hi: 0.10, cloud: 0x2a3040 }
  ]
};
var _c1 = new THREE.Color(), _c2 = new THREE.Color();
function palAt(t, key, target) {
  var ks = PAL.keys, a = ks[0], b = ks[ks.length - 1];
  for (var i = 0; i < ks.length - 1; i++)
    if (t >= ks[i].t && t <= ks[i + 1].t) { a = ks[i]; b = ks[i + 1]; break; }
  var f = ease((t - a.t) / Math.max(0.0001, b.t - a.t));
  if (key === 'si' || key === 'hi') return lerp(a[key], b[key], f);
  _c1.setHex(a[key]); _c2.setHex(b[key]);
  target.copy(_c1).lerp(_c2, f);
  return target;
}
function phaseName(t) {
  if (t < 4.8) return '深夜';
  if (t < 5.8) return '黎明';
  if (t < 7.2) return '清晨 · 日出';
  if (t < 11.0) return '上午';
  if (t < 13.5) return '正午';
  if (t < 17.0) return '下午';
  if (t < 18.6) return '黄昏 · 日落';
  if (t < 19.8) return '暮色';
  if (t < 22.0) return '夜晚';
  return '深夜';
}

function updateDayNight(t) {
  var nW = clamp(smoothstep(19.0, 20.8, t) + (1 - smoothstep(3.8, 5.6, t)), 0, 1);
  var duW = smoothstep(16.0, 17.8, t) * (1 - smoothstep(19.2, 20.8, t));
  var daW = clamp(1 - nW - duW * 0.9, 0, 1);
  modeW.day = daW; modeW.dusk = duW; modeW.night = nW;

  palAt(t, 'top', skyUni.topColor.value);
  palAt(t, 'bot', skyUni.bottomColor.value);
  palAt(t, 'fog', scene.fog.color);
  palAt(t, 'cloud', cloudGroup.children[0].children[0].material.color);

  var dayF = (t - 5.6) / 14.0;
  var sunAlt = Math.sin(clamp(dayF, 0, 1) * Math.PI);
  var sunAz = lerp(-Math.PI * 0.75, Math.PI * 0.75, clamp(dayF, 0, 1));
  var sx = Math.cos(sunAz) * 950, sy = sunAlt * 600, sz = Math.sin(sunAz) * 380 - 200;
  sunMesh.position.set(sx, Math.max(sy, -80), sz);
  sunMesh.visible = sunAlt > -0.08;
  sunLight.position.set(sx, Math.max(sy, 5), sz);
  sunLight.intensity = palAt(t, 'si');
  palAt(t, 'sun', sunLight.color);
  sunLight.userData.az = sunAz;
  sunLight.userData.alt = sunAlt;

  var nightF = ((t + 24 - 19.6) % 24) / 10;
  var mAlt = Math.sin(clamp(nightF, 0, 1) * Math.PI);
  var mAz = lerp(-Math.PI * 0.7, Math.PI * 0.7, clamp(nightF, 0, 1));
  moonMesh.position.set(Math.cos(mAz) * 900, mAlt * 520, Math.sin(mAz) * 360 - 150);
  moonMesh.visible = mAlt > 0.02 && nW > 0.15;
  moonLight.position.copy(moonMesh.position);
  moonLight.intensity = nW * 0.3;

  hemiLight.intensity = palAt(t, 'hi');
  stars.material.opacity = nW * 0.9;

  // 窗户 GPU uniform
  winUni.uTime.value = t;
  winUni.uModeW.value.set(daW, duW, nW);
  winUni.uSkyTop.value.copy(skyUni.topColor.value);
  winUni.uSkyBot.value.copy(skyUni.bottomColor.value);

  var lampGlow = nW * 0.85 + duW * 0.3;
  lampHeadMat.emissive.setRGB(lampGlow, lampGlow * 0.82, lampGlow * 0.45);
  lampHeadMat.color.setHex(lampGlow > 0.1 ? 0xfff2cc : 0x444444);
  lampGlowMat.opacity = nW * 0.35;
  parkLampMat.emissive.setRGB(lampGlow, lampGlow * 0.85, lampGlow * 0.5);
  parkLampMat.color.setHex(lampGlow > 0.1 ? 0xfff6dd : 0x333333);
  beaconMat.emissive.setRGB(0.2 + lampGlow * 0.9, 0.02, 0.02);
  beaconCapMats.forEach(function (m) { m.emissive.setRGB(lampGlow * 0.9, lampGlow * 0.6, lampGlow * 0.25); });
  var hg = clamp(nW + duW * 0.7, 0, 1);
  window.__headMat.color.setRGB(1, lerp(0.96, 0.85, 1 - hg), lerp(0.85, 0.6, 1 - hg));
  window.__tailMat.color.setHex(hg > 0.4 ? 0xff2222 : 0x881111);
  if (fountainPts) fountainPts.material.opacity = 0.55 + 0.35 * daW;

  scene.fog.near = lerp(150, 220, daW);
  scene.fog.far = lerp(580, 880, daW);
}

/* ================= UI ================= */
function fmtTime(t) {
  var h = Math.floor(t) % 24, m = Math.floor((t % 1) * 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
var el = {};
function bindUI() {
  el.clock = document.getElementById('clock');
  el.phase = document.getElementById('phase');
  el.dot = document.getElementById('tlDot');
  el.slider = document.getElementById('timeSlider');
  el.stats = document.getElementById('stats');
  el.playBtn = document.getElementById('playBtn');

  el.playBtn.addEventListener('click', function () {
    playing = !playing;
    el.playBtn.textContent = playing ? '⏸ 暂停' : '▶ 播放';
  });
  document.querySelectorAll('.spd').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.spd').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      speed = parseFloat(b.dataset.v);
      playing = true;
      el.playBtn.textContent = '⏸ 暂停';
    });
  });
  document.querySelectorAll('.jump').forEach(function (b) {
    b.addEventListener('click', function () { tod = parseFloat(b.dataset.t); el.slider.value = tod; });
  });
  el.slider.addEventListener('input', function () { tod = parseFloat(el.slider.value); });

  el.stats.innerHTML =
    '窗户 ' + (winXf.length / 4) + ' 扇 · 车辆 ' + CARS.length + ' 辆 · 行人 ' + PEDS.length + ' 人<br>' +
    '红绿灯路口 ' + INTS.length + ' 个 · 绘制调用 ~' + renderer.info.render.calls + ' 次<br>' +
    '24h 循环 · 当前 ' + speed + '×';
}

/* ================= 主循环 ================= */
var lastNow = performance.now();
var simT = 0;
var frameN = 0;
var lastShadowAz = -999, lastShadowAlt = -999;

function animate() {
  requestAnimationFrame(animate);
  var now = performance.now();
  var dt = clamp((now - lastNow) / 1000, 0, 0.06);
  lastNow = now;

  if (playing) {
    tod = (tod + dt * speed / 60) % 24;
    el.slider.value = tod;
  }
  simT += dt;

  updateTrafficLights(simT);
  for (var c = 0; c < CARS.length; c++) carUpdate(CARS[c], dt, simT);
  updateCarGeometry(carBodyGeo);
  updateCarGeometry(carGlassGeo);
  updateCarGeometry(carHeadGeo);
  updateCarGeometry(carTailGeo);
  pedPhysics(dt);
  updatePedGeometry();

  cloudGroup.children.forEach(function (cl) {
    cl.position.x += cl.userData.v * dt;
    if (cl.position.x > EXT * 1.4) cl.position.x = -EXT * 1.4;
  });

  if (fountainPts) {
    var pos = fountainPts.geometry.attributes.position.array;
    for (var q = 0; q < 70; q++) {
      var b0 = fountainBase[q * 4], b1 = fountainBase[q * 4 + 1],
          b2 = fountainBase[q * 4 + 2], b3 = fountainBase[q * 4 + 3];
      var life = (simT * 0.9 + b3) % 1, tt = life * 1.1;
      pos[q * 3]     = Math.cos(b0) * b1 * tt;
      pos[q * 3 + 1] = b2 * tt - 4.4 * tt * tt;
      pos[q * 3 + 2] = Math.sin(b0) * b1 * tt;
    }
    fountainPts.geometry.attributes.position.needsUpdate = true;
  }

  for (var f = 0; f < flagMeshes.length; f++) {
    var F = flagMeshes[f];
    var fp = F.mesh.geometry.attributes.position.array;
    for (var vi = 0; vi < fp.length; vi += 3) {
      var bx = F.base[vi], by = F.base[vi + 1];
      fp[vi + 2] = Math.sin(bx * 3.2 + simT * 5 + f) * 0.09 * (bx + 0.75) +
                   Math.sin(by * 4 + simT * 3.2) * 0.03;
    }
    F.mesh.geometry.attributes.position.needsUpdate = true;
  }

  updateDayNight(tod);

  // 阴影隔帧更新，且只在太阳角度变化足够时
  frameN++;
  var az = sunLight.userData.az || 0, alt = sunLight.userData.alt || 0;
  var dAz = Math.abs(az - lastShadowAz);
  var dAlt = Math.abs(alt - lastShadowAlt);
  if ((frameN & 7) === 0 || dAz > 0.02 || dAlt > 0.02) {
    renderer.shadowMap.needsUpdate = true;
    lastShadowAz = az;
    lastShadowAlt = alt;
  }

  el.clock.textContent = fmtTime(tod);
  var modeTxt = modeW.night > 0.6 ? '夜间 · 灯火模式' :
                (modeW.dusk > 0.45 ? '黄昏 · 渐入夜色' : '晴天模式');
  el.phase.innerHTML = phaseName(tod) + ' · <b>' + modeTxt + '</b>';
  el.dot.style.left = (tod / 24 * 100) + '%';

  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

window.addEventListener('load', function () {
  init();
  animate();
  // 初始化后统计一次 draw call 显示在 HUD
  setTimeout(function () {
    el.stats.innerHTML =
      '窗户 ' + (winXf.length / 4) + ' 扇 · 车辆 ' + CARS.length + ' 辆 · 行人 ' + PEDS.length + ' 人<br>' +
      '红绿灯路口 ' + INTS.length + ' 个 · 绘制调用 ' + renderer.info.render.calls + ' 次<br>' +
      '24h 循环 · 当前 ' + speed + '×';
  }, 500);
});
})();
