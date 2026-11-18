import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  FLOOR_PRESETS,
  WALL_PRESETS,
  PAINT_COLORS,
  VANITY_FINISHES,
  TextureLibrary,
} from './textures.js';
import {
  BathroomRoom,
  ROOM_POLYGON_GROUND,
  ROOM_POLYGON_FIRST,
} from './room.js';
import { VANITY_MODELS, VanityManager } from './vanities.js';
import { CatalogSelector } from './catalogUI.js';

const STORAGE_KEY = 'simulatore_bagno_state_v1';

const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2028);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new RoomEnvironment();
scene.environment = pmrem.fromScene(envScene, 0.04).texture;
scene.environmentIntensity = 0.28;
envScene.dispose();
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(
  68,
  window.innerWidth / window.innerHeight,
  0.06,
  30
);
camera.rotation.order = 'YXZ';

const textureLib = new TextureLibrary(renderer);
const room = new BathroomRoom(scene, textureLib);
const vanityManager = new VanityManager(
  scene,
  textureLib,
  room.metalMaterial,
  room.ceramicMaterial
);

// --- PERSISTENT STATE (LOCALSTORAGE) ---
function createDefaultRoomConfig(roomKey = 'ground') {
  const fixDefs = room.getDefaultFixturesForRoom(roomKey);
  return {
    floor: { key: `preset:${FLOOR_PRESETS[0].id}`, rotated90: false },
    wall: { key: `preset:${WALL_PRESETS[0].id}`, rotated90: false },
    perWallSpecs: {},
    tileHeightMode: 'door',
    showerTileHeightMode: 'fixed-210',
    paintId: PAINT_COLORS[0].id,
    vanityWallEnabled: false,
    vanityWall: { key: `preset:${WALL_PRESETS[1].id}`, rotated90: false },
    vanityZoneSpan: 'window-to-wall',
    vanityWallHeightMode: 'same',
    vanityModelId: VANITY_MODELS[0].id,
    vanityFinishId: VANITY_FINISHES[0].id,
    metalFinish: 'chrome',
    showerEnabled: fixDefs.showerEnabled,
    showerPlacement: { ...fixDefs.showerPlacement },
    vanityPlacement: { ...fixDefs.vanityPlacement },
  };
}

function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        activeRoom: parsed.activeRoom === 'first' ? 'first' : 'ground',
        lightingMode: parsed.lightingMode === 'night' ? 'night' : 'day',
        exposure: Number.isFinite(parsed.exposure) ? parsed.exposure : 78,
        rooms: {
          ground: { ...createDefaultRoomConfig('ground'), ...(parsed.rooms?.ground || {}) },
          first: parsed.rooms?.first
            ? { ...createDefaultRoomConfig('first'), ...parsed.rooms.first }
            : null,
        },
      };
    }
  } catch (err) {
    console.warn('Impossibile leggere stato salvato:', err);
  }
  return {
    activeRoom: 'ground',
    lightingMode: 'day',
    exposure: 78,
    rooms: {
      ground: createDefaultRoomConfig('ground'),
      first: null,
    },
  };
}

const appState = loadAppState();
let isRestoringRoom = false;

let floorSelector = null;
let wallSelector = null;
let singleWallSelector = null;
let vanityWallSelector = null;

// Interactive 3D tool state
let wallPaintMode = false;
let moveFixturesMode = false;
let selectedFixture = null; // 'vanity' | 'shower' | null
let draggingFixture = null; // 'vanity' | 'shower' | null

function getCurrentRoomState() {
  if (!appState.rooms[appState.activeRoom]) {
    const base = createDefaultRoomConfig(appState.activeRoom);
    const src = appState.rooms.ground;
    if (src) {
      base.floor = JSON.parse(JSON.stringify(src.floor));
      base.wall = JSON.parse(JSON.stringify(src.wall));
      base.tileHeightMode = src.tileHeightMode;
      base.showerTileHeightMode = src.showerTileHeightMode || 'fixed-210';
      base.paintId = src.paintId;
      base.vanityWallEnabled = src.vanityWallEnabled;
      base.vanityWall = JSON.parse(JSON.stringify(src.vanityWall));
      base.vanityZoneSpan = src.vanityZoneSpan;
      base.vanityWallHeightMode = src.vanityWallHeightMode;
      base.vanityModelId = src.vanityModelId;
      base.vanityFinishId = src.vanityFinishId;
      base.metalFinish = src.metalFinish;
    }
    appState.rooms[appState.activeRoom] = base;
  }
  return appState.rooms[appState.activeRoom];
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 2300);
}

function saveAppState() {
  if (isRestoringRoom) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    const ind = document.getElementById('saved-indicator');
    if (ind) {
      ind.textContent = '💾 Rivestimenti memorizzati';
    }
  } catch (err) {
    console.warn('Errore salvataggio localStorage:', err);
  }
}

// Initial fallback materials while catalog JSON loads
room.setFloorPreset(FLOOR_PRESETS[0]);
room.setWallPreset(WALL_PRESETS[0]);
room.vanityWallMaterial.map = textureLib.getPresetBundle(WALL_PRESETS[1]).map;
room.vanityWallMaterial.bumpMap = textureLib.getPresetBundle(WALL_PRESETS[1]).bumpMap;

// --- CAMERA & NAVIGATION STATE ---
const navState = {
  mode: 'walk',
  pos: { x: 0.42, y: 1.62, z: 1.38 },
  yaw: -1.46,
  pitch: -0.06,
  fov: 70,
  orbitTarget: new THREE.Vector3(1.0, 0.95, 1.38),
  orbitYaw: -0.72,
  orbitPitch: 0.58,
  orbitDist: 3.65,
};

const activeInputs = {
  forward: false,
  backward: false,
  turnLeft: false,
  turnRight: false,
  strafeLeft: false,
  strafeRight: false,
};

const PRESETS_BY_ROOM = {
  ground: {
    entry: { mode: 'walk', x: 0.42, z: 1.38, yaw: -1.46, pitch: -0.06, fov: 72 },
    vanity: { mode: 'walk', x: 0.8, z: 2.0, yaw: -Math.PI / 2, pitch: -0.07, fov: 68 },
    sanitary: { mode: 'walk', x: 0.88, z: 1.42, yaw: 0.0, pitch: -0.08, fov: 68 },
    orbit: {
      mode: 'orbit',
      target: [1.0, 0.95, 1.38],
      orbitYaw: -0.72,
      orbitPitch: 0.58,
      orbitDist: 3.65,
    },
  },
  first: {
    entry: { mode: 'walk', x: 0.36, z: 1.02, yaw: -2.18, pitch: -0.07, fov: 72 },
    vanity: { mode: 'walk', x: 0.55, z: 1.48, yaw: Math.PI, pitch: -0.07, fov: 68 },
    sanitary: { mode: 'walk', x: 0.88, z: 1.5, yaw: 0.0, pitch: -0.08, fov: 68 },
    shower: { mode: 'walk', x: 0.65, z: 1.52, yaw: -2.5, pitch: -0.08, fov: 70 },
    orbit: {
      mode: 'orbit',
      target: [1.08, 0.88, 1.56],
      orbitYaw: -1.48,
      orbitPitch: 0.56,
      orbitDist: 4.25,
    },
  },
};

function applyCameraPreset(presetName) {
  const roomPresets = PRESETS_BY_ROOM[appState.activeRoom] || PRESETS_BY_ROOM.ground;
  const p = roomPresets[presetName] || roomPresets.entry;
  if (!p) return;

  document.querySelectorAll('.cam-btn[data-preset]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === presetName);
  });

  if (p.mode === 'orbit') {
    navState.mode = 'orbit';
    navState.orbitTarget.set(p.target[0], p.target[1], p.target[2]);
    navState.orbitYaw = p.orbitYaw;
    navState.orbitPitch = p.orbitPitch;
    navState.orbitDist = p.orbitDist;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    room.setCutawayMode(true);
    document.getElementById('coords-readout').textContent = 'Spaccato 3D';
  } else {
    navState.mode = 'walk';
    let targetX = p.x;
    let targetZ = p.z;
    let targetYaw = p.yaw;

    // Dynamically frame Mobile Bagno or Box Doccia wherever the user moved them!
    if (presetName === 'vanity') {
      const vp = room.getVanityPoseAndAABB();
      targetX = vp.x + vp.wall.nx * 1.18;
      targetZ = vp.z + vp.wall.nz * 1.18;
      targetYaw = Math.atan2(vp.wall.nx, vp.wall.nz);
    } else if (presetName === 'shower' && room.showerEnabled) {
      const sb = room.getShowerAABB();
      if (sb) {
        targetX = sb.cx + sb.wall.nx * 0.95;
        targetZ = sb.cz + sb.wall.nz * 0.95;
        targetYaw = Math.atan2(sb.wall.nx, sb.wall.nz);
      }
    }

    const clamped = room.clampWalkPosition(targetX, targetZ);
    navState.pos.x = clamped.x;
    navState.pos.z = clamped.z;
    navState.yaw = targetYaw;
    navState.pitch = p.pitch;
    navState.fov = p.fov;
    camera.fov = navState.fov;
    camera.updateProjectionMatrix();
    room.setCutawayMode(false);
  }
}

// Download PNG photo of active 3D view
function downloadActiveViewPhoto() {
  renderer.render(scene, camera);
  const dataUrl = canvas.toDataURL('image/png');
  const roomSlug = appState.activeRoom === 'first' ? 'primo-piano-5.55mq' : 'pianterreno-4.68mq';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `bagno-${roomSlug}-${ts}.png`;

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.__LAST_PHOTO_DOWNLOAD__ = { filename, length: dataUrl.length };
  showToast(`📸 Foto salvata: ${filename}`);
}

// Keyboard controls
const KEY_MAP = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
  KeyA: 'strafeLeft',
  KeyD: 'strafeRight',
};

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.matches('input, select, textarea')) {
    return;
  }
  if (KEY_MAP[e.code]) {
    e.preventDefault();
    activeInputs[KEY_MAP[e.code]] = true;
    syncDpadVisuals();
  } else if (e.key === '1') {
    applyCameraPreset('entry');
  } else if (e.key === '2') {
    applyCameraPreset('vanity');
  } else if (e.key === '3') {
    applyCameraPreset('sanitary');
  } else if (e.key === '4') {
    applyCameraPreset('orbit');
  } else if (e.key === '5' && appState.activeRoom === 'first') {
    applyCameraPreset('shower');
  }
});

window.addEventListener('keyup', (e) => {
  if (KEY_MAP[e.code]) {
    e.preventDefault();
    activeInputs[KEY_MAP[e.code]] = false;
    syncDpadVisuals();
  }
});

window.addEventListener('blur', () => {
  Object.keys(activeInputs).forEach((k) => {
    activeInputs[k] = false;
  });
  syncDpadVisuals();
});

function syncDpadVisuals() {
  document.querySelectorAll('.dpad-btn').forEach((btn) => {
    const action = btn.dataset.move;
    btn.classList.toggle('pressed', Boolean(activeInputs[action]));
  });
}

document.querySelectorAll('.dpad-btn').forEach((btn) => {
  const action = btn.dataset.move;
  const start = (e) => {
    e.preventDefault();
    activeInputs[action] = true;
    syncDpadVisuals();
  };
  const stop = () => {
    activeInputs[action] = false;
    syncDpadVisuals();
  };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
});

// --- 3D RAYCASTING, SINGLE-WALL CLICK BRUSH & WALL-ANCHORED FIXTURE DRAGGING ---
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const dragFloorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.45);
const dragHitPoint = new THREE.Vector3();

function updateRaycasterFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
}

function raycastVisibleWall(clientX, clientY) {
  updateRaycasterFromClient(clientX, clientY);
  const visibleGroups = room.wallGroups.filter((w) => w.group.visible).map((w) => w.group);
  const hits = raycaster.intersectObjects(visibleGroups, true);
  for (const h of hits) {
    if (h.object?.userData?.isWall && h.object.userData.wallId) {
      return {
        wallId: h.object.userData.wallId,
        wallLabel: h.object.userData.wallLabel || h.object.userData.wallId,
      };
    }
  }
  return null;
}

function raycastMovableFixture(clientX, clientY) {
  updateRaycasterFromClient(clientX, clientY);
  const targets = [vanityManager.anchor];
  if (room.showerEnabled && room.showerGroup) {
    targets.push(room.showerGroup);
  }
  const hits = raycaster.intersectObjects(targets, true);
  for (const h of hits) {
    if (h.object?.userData?.fixtureType) {
      return h.object.userData.fixtureType;
    }
  }
  return null;
}

function raycastFloorDragCoords(clientX, clientY) {
  updateRaycasterFromClient(clientX, clientY);
  if (raycaster.ray.intersectPlane(dragFloorPlane, dragHitPoint)) {
    return { x: dragHitPoint.x, z: dragHitPoint.z };
  }
  return null;
}

function syncVanityPoseToRoom() {
  const pose = room.getVanityPoseAndAABB();
  vanityManager.setWallPose(pose);
  const vanityBadge = document.getElementById('vanity-wall-badge');
  if (vanityBadge) {
    const cm = Math.round(pose.availWidth * 100);
    vanityBadge.textContent = `${pose.wallLabel} (${cm} cm)`;
  }
  const spanBtnFull = document.querySelector('#vanity-span-group .pill-btn[data-span="window-to-wall"]');
  const spanBtnCent = document.querySelector('#vanity-span-group .pill-btn[data-span="centered"]');
  if (spanBtnFull && spanBtnCent) {
    const fullCm = Math.round((pose.spanR - pose.spanL) * 100);
    const centCm = Math.round(Math.min(1.3, (pose.spanR - pose.spanL) * 0.94) * 100);
    spanBtnFull.textContent = `Tutta fascia (${fullCm} cm)`;
    spanBtnCent.textContent = `Centrata (${centCm} cm)`;
  }
}

function getActiveSingleWallBrush() {
  // Prefer singleWallSelector if available, else wallSelector
  const sel = singleWallSelector || wallSelector;
  if (!sel || !sel.currentBaseBundle) return null;
  return {
    bundle: textureLib.getOrientedBundle(sel.currentBaseBundle, sel.rotated90),
    spec: sel.getSelectionSpec(),
    title: sel.activeMeta?.title || 'Piastrella',
  };
}

function syncCustomWallsListUI() {
  const cfg = getCurrentRoomState();
  const specs = cfg.perWallSpecs || {};
  const entries = Object.keys(specs);
  const box = document.getElementById('custom-walls-box');
  const list = document.getElementById('custom-walls-list');
  const dot = document.getElementById('single-wall-dot');

  if (dot) {
    dot.style.display = entries.length > 0 ? 'inline-block' : 'none';
  }
  if (!box || !list) return;

  if (entries.length === 0) {
    box.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  box.style.display = 'block';
  const segMap = new Map(room.getBaseWallSegments().map((s) => [s.id, s.label]));
  list.innerHTML = '';
  for (const wallId of entries) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'custom-wall-chip';
    chip.title = 'Clicca per ripristinare questa parete al rivestimento generale';
    chip.textContent = `${segMap.get(wallId) || wallId} ✕`;
    chip.addEventListener('click', () => {
      delete cfg.perWallSpecs[wallId];
      room.clearSingleWallMaterial(wallId);
      syncCustomWallsListUI();
      saveAppState();
      showToast(`Parete ripristinata: ${segMap.get(wallId) || wallId}`);
    });
    list.appendChild(chip);
  }
}

function setWallZoneUI(z) {
  const zoneSwitch = document.getElementById('wall-zone-switch');
  zoneSwitch?.querySelectorAll('.zone-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.zone === z);
  });
  const m = document.getElementById('wall-zone-main');
  const s = document.getElementById('wall-zone-single');
  const v = document.getElementById('wall-zone-vanity');
  if (m) m.style.display = z === 'main' ? 'block' : 'none';
  if (s) s.style.display = z === 'single' ? 'block' : 'none';
  if (v) v.style.display = z === 'vanity' ? 'block' : 'none';
}

function setWallPaintMode(enabled) {
  wallPaintMode = Boolean(enabled);
  if (wallPaintMode) {
    moveFixturesMode = false;
    draggingFixture = null;
    selectedFixture = null;
    room.setSelectedFixtureHighlight(null);
    setWallZoneUI('single');
  } else {
    room.setHoveredWall(null);
    const activeZone = document.querySelector('#wall-zone-switch .zone-btn.active')?.dataset?.zone;
    if (activeZone === 'single') {
      setWallZoneUI('main');
    }
  }
  document.getElementById('btn-wall-paint-mode')?.classList.toggle('active', wallPaintMode);
  document.getElementById('btn-move-fixtures-mode')?.classList.toggle('active', moveFixturesMode);
  canvas.style.cursor = wallPaintMode ? 'crosshair' : 'grab';
}

function setMoveFixturesMode(enabled) {
  moveFixturesMode = Boolean(enabled);
  if (moveFixturesMode) {
    setWallPaintMode(false);
    if (!selectedFixture) {
      selectedFixture = room.showerEnabled ? 'shower' : 'vanity';
    }
    room.setSelectedFixtureHighlight(selectedFixture);
  } else {
    draggingFixture = null;
    selectedFixture = null;
    room.setSelectedFixtureHighlight(null);
  }
  document.getElementById('btn-move-fixtures-mode')?.classList.toggle('active', moveFixturesMode);
  document.getElementById('btn-wall-paint-mode')?.classList.toggle('active', wallPaintMode);
  canvas.style.cursor = 'grab';
}

function applySingleWallAtClient(clientX, clientY) {
  if (!wallPaintMode) return false;
  const hitW = raycastVisibleWall(clientX, clientY);
  if (!hitW) return false;
  const brush = getActiveSingleWallBrush();
  if (!brush) return false;
  room.applySingleWallBundle(hitW.wallId, brush.bundle);
  const cfg = getCurrentRoomState();
  if (!cfg.perWallSpecs) cfg.perWallSpecs = {};
  cfg.perWallSpecs[hitW.wallId] = brush.spec;
  syncCustomWallsListUI();
  saveAppState();
  showToast(`🖌️ "${brush.title}" applicato a ${hitW.wallLabel}`);
  return true;
}

// Mouse drag look / orbit / wall-dblclick / fixture-drag + wheel zoom
let isDragging = false;
let prevPointer = { x: 0, y: 0 };
let pointerTravel = 0;
let lastTouchTapTime = 0;
let lastTouchTapPos = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  prevPointer = { x: e.clientX, y: e.clientY };
  pointerTravel = 0;
  canvas.setPointerCapture(e.pointerId);

  // Fixture movement is ONLY allowed when "✋ Sposta Arredi" button (moveFixturesMode) is active
  if (moveFixturesMode) {
    const hitFixture = raycastMovableFixture(e.clientX, e.clientY);
    if (hitFixture) {
      selectedFixture = hitFixture;
      draggingFixture = hitFixture;
      room.setSelectedFixtureHighlight(hitFixture);
      canvas.style.cursor = 'grabbing';
      return;
    }
  }

  isDragging = true;
});

canvas.addEventListener('pointermove', (e) => {
  const dx = e.clientX - prevPointer.x;
  const dy = e.clientY - prevPointer.y;
  prevPointer = { x: e.clientX, y: e.clientY };
  pointerTravel += Math.hypot(dx, dy);

  if (draggingFixture && moveFixturesMode) {
    const pt = raycastFloorDragCoords(e.clientX, e.clientY);
    if (pt) {
      if (draggingFixture === 'vanity') {
        const nextP = room.findNearestVanityPlacement(pt.x, pt.z);
        room.setFixturesConfig({ vanityPlacement: nextP });
        getCurrentRoomState().vanityPlacement = { ...nextP };
        syncVanityPoseToRoom();
      } else if (draggingFixture === 'shower' && room.showerEnabled) {
        const nextP = room.findNearestShowerPlacement(pt.x, pt.z);
        room.setFixturesConfig({ showerPlacement: nextP });
        getCurrentRoomState().showerPlacement = { ...nextP };
        syncVanityPoseToRoom();
      }
      room.setSelectedFixtureHighlight(draggingFixture);
    }
    return;
  }

  if (isDragging) {
    if (navState.mode === 'walk') {
      navState.yaw -= dx * 0.0042;
      navState.pitch = Math.max(-1.15, Math.min(0.95, navState.pitch - dy * 0.0036));
    } else {
      navState.orbitYaw -= dx * 0.0065;
      navState.orbitPitch = Math.max(0.18, Math.min(1.38, navState.orbitPitch + dy * 0.0055));
    }
    return;
  }

  // Hover feedback when pointer is not pressed
  if (wallPaintMode) {
    const hitW = raycastVisibleWall(e.clientX, e.clientY);
    room.setHoveredWall(hitW ? hitW.wallId : null);
    canvas.style.cursor = hitW ? 'copy' : 'crosshair';
  } else if (moveFixturesMode) {
    const hitF = raycastMovableFixture(e.clientX, e.clientY);
    canvas.style.cursor = hitF ? 'move' : 'grab';
    if (hitF) {
      room.setSelectedFixtureHighlight(hitF);
    } else {
      room.setSelectedFixtureHighlight(selectedFixture);
    }
  } else {
    canvas.style.cursor = 'grab';
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (draggingFixture) {
    const movedType = draggingFixture;
    draggingFixture = null;
    saveAppState();
    if (pointerTravel < 5) {
      const label = movedType === 'shower' ? 'Box Doccia 80×80' : 'Mobile Bagno';
      showToast(`✋ ${label} selezionato — trascinalo lungo le pareti per spostarlo`);
    }
    canvas.style.cursor = moveFixturesMode ? 'move' : 'grab';
    return;
  }

  if (isDragging) {
    isDragging = false;
    // Touch-screen fallback for double-tap on wall in Clicca Parete mode
    if (e.pointerType === 'touch' && wallPaintMode && pointerTravel < 10) {
      const now = performance.now();
      const dist = Math.hypot(e.clientX - lastTouchTapPos.x, e.clientY - lastTouchTapPos.y);
      if (now - lastTouchTapTime < 360 && dist < 26) {
        lastTouchTapTime = 0;
        applySingleWallAtClient(e.clientX, e.clientY);
      } else {
        lastTouchTapTime = now;
        lastTouchTapPos = { x: e.clientX, y: e.clientY };
      }
    }
  }
});

canvas.addEventListener('dblclick', (e) => {
  if (!wallPaintMode) return;
  e.preventDefault();
  applySingleWallAtClient(e.clientX, e.clientY);
});

canvas.addEventListener('pointercancel', () => {
  isDragging = false;
  draggingFixture = null;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (navState.mode === 'walk') {
      navState.fov = Math.max(42, Math.min(82, navState.fov + e.deltaY * 0.03));
      camera.fov = navState.fov;
      camera.updateProjectionMatrix();
    } else {
      navState.orbitDist = Math.max(2.0, Math.min(6.2, navState.orbitDist + e.deltaY * 0.003));
    }
  },
  { passive: false }
);

// --- ROOM & STATE APPLICATION ---
function syncVanityWallStatusUI() {
  const on = room.vanityWallEnabled;
  const btn = document.getElementById('btn-toggle-vanity-wall');
  const lbl = document.getElementById('accent-status-label');
  const dot = document.getElementById('vanity-zone-dot');
  if (btn) {
    btn.textContent = on ? 'Attivo ✓' : 'Attiva';
    btn.classList.toggle('active', on);
  }
  if (lbl) {
    lbl.textContent = on
      ? 'Rivestimento personalizzato attivo dietro mobile'
      : 'Usa stesso rivestimento delle pareti';
  }
  if (dot) {
    dot.style.display = on ? 'inline-block' : 'none';
  }
}

function syncShowerPresenceUI() {
  const on = Boolean(room.showerEnabled);
  const btn = document.getElementById('btn-toggle-shower-box');
  const btnPreset = document.getElementById('btn-preset-shower');
  const wrapHeight = document.getElementById('shower-height-wrap');
  if (btn) {
    btn.textContent = on ? 'Presente ✓' : 'Assente';
    btn.classList.toggle('active', on);
  }
  if (btnPreset) {
    btnPreset.style.display = on ? 'inline-flex' : 'none';
  }
  if (wrapHeight) {
    wrapHeight.style.opacity = on ? '1' : '0.45';
  }
}

function syncRoomLabelsUI(roomKey) {
  const isFirst = roomKey === 'first';
  document.querySelectorAll('#room-switcher .room-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.room === roomKey);
  });

  const sub = document.getElementById('room-subtitle');
  if (sub) {
    sub.innerHTML = isFirst
      ? 'Piantina Primo Piano · <strong>5,55 mq</strong> (190×292 · Doccia 80×80 · r.a.i. 0,180)'
      : 'Piantina Pianterreno · <strong>4,68 mq</strong> (190×280 / 136×90 · r.a.i. 0,214)';
  }

  document.getElementById('btn-door')?.classList.remove('active');
}

async function resolveSpecToBundle(spec, selectorFallback) {
  if (!spec || !spec.key) return null;
  const rot90 = Boolean(spec.rotated90);
  if (spec.key.startsWith('preset:')) {
    const pid = spec.key.slice('preset:'.length);
    const preset =
      WALL_PRESETS.find((p) => p.id === pid) ||
      FLOOR_PRESETS.find((p) => p.id === pid) ||
      WALL_PRESETS[0];
    return textureLib.getOrientedBundle(textureLib.getPresetBundle(preset), rot90);
  }
  const item = selectorFallback?.byKey?.get(String(spec.key));
  if (!item) return null;
  const base = await textureLib.getCatalogItemBundle(item);
  return textureLib.getOrientedBundle(base, rot90);
}

async function applyRoomConfigToSceneAndUI(roomKey, { resetCamera = true } = {}) {
  isRestoringRoom = true;
  appState.activeRoom = roomKey;
  const cfg = getCurrentRoomState();
  const fixDefs = room.getDefaultFixturesForRoom(roomKey);

  syncRoomLabelsUI(roomKey);
  room.setRoomType(roomKey);
  vanityManager.setRoomPlacement(roomKey);

  // Restore movable wall-anchored fixtures (Shower 80x80 & Mobile Bagno)
  const showerEnabled =
    typeof cfg.showerEnabled === 'boolean' ? cfg.showerEnabled : fixDefs.showerEnabled;
  const showerPlacement = cfg.showerPlacement || fixDefs.showerPlacement;
  const vanityPlacement = cfg.vanityPlacement || fixDefs.vanityPlacement;
  room.setFixturesConfig({
    showerEnabled,
    showerPlacement,
    vanityPlacement,
  });
  syncShowerPresenceUI();

  // Tile height & shower fixed height & paint
  room.setTileHeightMode(cfg.tileHeightMode || 'door');
  document.querySelectorAll('#tile-height-group .pill-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.height === (cfg.tileHeightMode || 'door'));
  });
  document.getElementById('paint-color-section').style.opacity =
    cfg.tileHeightMode === 'full' ? '0.45' : '1';

  const shHeight = cfg.showerTileHeightMode || 'fixed-210';
  room.setShowerTileHeightMode(shHeight);
  document.querySelectorAll('#shower-height-group .pill-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.sheight === shHeight);
  });

  const paintObj = PAINT_COLORS.find((p) => p.id === cfg.paintId) || PAINT_COLORS[0];
  room.setPaintColor(paintObj.hex);
  document.querySelectorAll('#paint-colors .color-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.paintId === paintObj.id);
  });

  // Vanity wall options
  room.setVanityWallOptions({
    span: cfg.vanityZoneSpan || 'window-to-wall',
    heightMode: cfg.vanityWallHeightMode || 'same',
  });
  document.querySelectorAll('#vanity-span-group .pill-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.span === (cfg.vanityZoneSpan || 'window-to-wall'));
  });
  document.querySelectorAll('#vanity-height-group .pill-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.vheight === (cfg.vanityWallHeightMode || 'same'));
  });

  // Furniture model, cabinet finish & metal finish
  const finishObj = VANITY_FINISHES.find((f) => f.id === cfg.vanityFinishId) || VANITY_FINISHES[0];
  vanityManager.setFinish(finishObj);
  document.querySelectorAll('#vanity-finishes .color-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.finishId === finishObj.id);
  });

  vanityManager.setModel(cfg.vanityModelId || VANITY_MODELS[0].id);
  syncVanityPoseToRoom();
  document.querySelectorAll('#vanity-models .model-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.modelId === (cfg.vanityModelId || VANITY_MODELS[0].id));
  });

  room.setMetalFinish(cfg.metalFinish || 'chrome');
  document.querySelectorAll('#metal-finish-group .pill-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.metal === (cfg.metalFinish || 'chrome'));
  });

  // Restore catalog selections (floor, main walls, vanity accent wall, per-wall overrides)
  if (floorSelector && cfg.floor) {
    await floorSelector.applySelectionSpec(cfg.floor, { triggerApply: true });
  }
  if (wallSelector && cfg.wall) {
    await wallSelector.applySelectionSpec(cfg.wall, { triggerApply: true });
  }
  if (vanityWallSelector && cfg.vanityWall) {
    await vanityWallSelector.applySelectionSpec(cfg.vanityWall, {
      triggerApply: Boolean(cfg.vanityWallEnabled),
    });
    if (!cfg.vanityWallEnabled && vanityWallSelector.currentBaseBundle) {
      const b = textureLib.getOrientedBundle(
        vanityWallSelector.currentBaseBundle,
        vanityWallSelector.rotated90
      );
      room.vanityWallMaterial.map = b.map;
      room.vanityWallMaterial.bumpMap = b.bumpMap;
    }
  }

  // Restore individual per-wall custom tiles
  room.clearAllSingleWallMaterials();
  if (cfg.perWallSpecs && wallSelector) {
    for (const [wId, wSpec] of Object.entries(cfg.perWallSpecs)) {
      try {
        const wBundle = await resolveSpecToBundle(wSpec, wallSelector);
        if (wBundle) {
          room.applySingleWallBundle(wId, wBundle);
        }
      } catch (err) {
        console.warn('Impossibile ripristinare parete singola', wId, err);
      }
    }
  }
  syncCustomWallsListUI();

  room.setVanityWallEnabled(Boolean(cfg.vanityWallEnabled));
  syncVanityWallStatusUI();

  if (resetCamera) {
    applyCameraPreset(navState.mode === 'orbit' ? 'orbit' : 'entry');
  }

  isRestoringRoom = false;
  saveAppState();
}

// --- BUILD UI SWATCHES & CONTROLS ---
function initUI() {
  // Room switcher (Pianterreno 4,68 mq <-> Primo Piano 5,55 mq)
  document.querySelectorAll('#room-switcher .room-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetRoom = btn.dataset.room;
      if (targetRoom === appState.activeRoom) return;
      applyRoomConfigToSceneAndUI(targetRoom, { resetCamera: true });
    });
  });

  // Copy coverings & furniture style from the other bathroom (preserving room's own valid wall placements)
  document.getElementById('btn-copy-other-room')?.addEventListener('click', async () => {
    const otherKey = appState.activeRoom === 'ground' ? 'first' : 'ground';
    const otherCfg = appState.rooms[otherKey];
    if (!otherCfg) {
      showToast('Nessuna configurazione salvata nell’altro bagno');
      return;
    }
    const cur = getCurrentRoomState();
    appState.rooms[appState.activeRoom] = {
      ...JSON.parse(JSON.stringify(otherCfg)),
      perWallSpecs: {},
      showerEnabled: cur.showerEnabled,
      showerPlacement: { ...cur.showerPlacement },
      vanityPlacement: { ...cur.vanityPlacement },
    };
    await applyRoomConfigToSceneAndUI(appState.activeRoom, { resetCamera: false });
    showToast('📋 Rivestimenti e arredo copiati dall’altro bagno!');
  });

  // Top-bar interactive mode buttons (Clicca Parete & Sposta Arredi)
  document.getElementById('btn-wall-paint-mode')?.addEventListener('click', () => {
    const next = !wallPaintMode;
    if (next) {
      document.querySelector('.tab-btn[data-tab="walls"]')?.click();
      setWallPaintMode(true);
      showToast('🖌️ Fai doppio clic su una parete in 3D per applicare la piastrella scelta');
    } else {
      setWallPaintMode(false);
      showToast('🧱 Clicca Parete disattivato: la piastrella scelta si applica a tutte le pareti');
    }
  });

  document.getElementById('btn-move-fixtures-mode')?.addEventListener('click', () => {
    const next = !moveFixturesMode;
    setMoveFixturesMode(next);
    if (next) {
      showToast('✋ Modalità Sposta Arredi attiva: trascina Mobile Bagno o Box Doccia lungo le pareti');
    } else {
      showToast('✋ Spostamento arredi bloccato');
    }
  });

  // Photo download button
  document.getElementById('btn-download-photo')?.addEventListener('click', downloadActiveViewPhoto);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab !== 'walls' && wallPaintMode) {
        setWallPaintMode(false);
      }
    });
  });

  // Camera presets
  document.querySelectorAll('.cam-btn[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => applyCameraPreset(btn.dataset.preset));
  });

  // Lighting day/evening toggle + brightness slider
  const exposureSlider = document.getElementById('exposure-slider');
  if (exposureSlider) {
    exposureSlider.value = String(appState.exposure);
  }

  const applyExposureFromSlider = () => {
    const num = parseFloat(exposureSlider ? exposureSlider.value : '78');
    appState.exposure = num;
    const val = num / 100;
    renderer.toneMappingExposure = room.lightingMode === 'day' ? val : val * 0.92;
    saveAppState();
  };

  if (exposureSlider) {
    exposureSlider.addEventListener('input', applyExposureFromSlider);
  }

  room.setLightingMode(appState.lightingMode);
  document.getElementById('lighting-icon').textContent =
    appState.lightingMode === 'day' ? '☀️' : '🌙';
  document.getElementById('lighting-label').textContent =
    appState.lightingMode === 'day' ? 'Giorno' : 'Sera';
  renderer.toneMappingExposure =
    appState.lightingMode === 'day'
      ? appState.exposure / 100
      : (appState.exposure / 100) * 0.92;

  const btnLighting = document.getElementById('btn-lighting');
  btnLighting.addEventListener('click', () => {
    const next = room.lightingMode === 'day' ? 'night' : 'day';
    appState.lightingMode = next;
    room.setLightingMode(next);
    document.getElementById('lighting-icon').textContent = next === 'day' ? '☀️' : '🌙';
    document.getElementById('lighting-label').textContent = next === 'day' ? 'Giorno' : 'Sera';
    applyExposureFromSlider();
  });

  // Door open/close toggle
  const btnDoor = document.getElementById('btn-door');
  btnDoor.addEventListener('click', () => {
    const open = room.toggleDoor();
    btnDoor.classList.toggle('active', open);
  });

  // Config panel show/hide toggle
  const btnTogglePanel = document.getElementById('btn-toggle-panel');
  const configPanel = document.getElementById('config-panel');
  if (btnTogglePanel && configPanel) {
    btnTogglePanel.classList.add('active');
    btnTogglePanel.addEventListener('click', () => {
      const hidden = configPanel.classList.toggle('collapsed');
      btnTogglePanel.classList.toggle('active', !hidden);
    });
  }

  // Wall sub-zone switcher (Pareti Generali / Singola Parete / Area Mobile)
  const zoneSwitch = document.getElementById('wall-zone-switch');
  zoneSwitch.querySelectorAll('.zone-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const z = btn.dataset.zone;
      setWallZoneUI(z);
      setWallPaintMode(z === 'single');
    });
  });

  document.getElementById('btn-reset-all-walls')?.addEventListener('click', () => {
    getCurrentRoomState().perWallSpecs = {};
    room.clearAllSingleWallMaterials();
    syncCustomWallsListUI();
    saveAppState();
    showToast('Tutte le pareti singole ripristinate al rivestimento generale');
  });

  document.getElementById('btn-reset-fixtures')?.addEventListener('click', () => {
    const defs = room.getDefaultFixturesForRoom(appState.activeRoom);
    const cfg = getCurrentRoomState();
    cfg.showerEnabled = defs.showerEnabled;
    cfg.showerPlacement = { ...defs.showerPlacement };
    cfg.vanityPlacement = { ...defs.vanityPlacement };
    room.setFixturesConfig({
      showerEnabled: defs.showerEnabled,
      showerPlacement: defs.showerPlacement,
      vanityPlacement: defs.vanityPlacement,
    });
    syncShowerPresenceUI();
    syncVanityPoseToRoom();
    saveAppState();
    showToast('↺ Posizione Mobile Bagno e Doccia ripristinata');
  });

  document.getElementById('btn-toggle-shower-box')?.addEventListener('click', () => {
    const next = !room.showerEnabled;
    const cfg = getCurrentRoomState();
    cfg.showerEnabled = next;
    let shPlace = cfg.showerPlacement || room.getDefaultFixturesForRoom(appState.activeRoom).showerPlacement;
    if (next) {
      // Ensure shower doesn't overlap current vanity when enabled
      const candBox = room.getShowerAABB(shPlace, true);
      const vanBox = room.getVanityPoseAndAABB(cfg.vanityPlacement, null);
      if (!room.isBoxInsideRoom(candBox, 0.025) || room.boxesOverlap(candBox, vanBox, 0.015)) {
        shPlace = room.findNearestShowerPlacement(1.5, 2.5);
        cfg.showerPlacement = { ...shPlace };
      }
    }
    room.setFixturesConfig({ showerEnabled: next, showerPlacement: shPlace });
    syncShowerPresenceUI();
    syncVanityPoseToRoom();
    saveAppState();
  });

  document.getElementById('btn-toggle-vanity-wall').addEventListener('click', () => {
    const next = !room.vanityWallEnabled;
    if (next && vanityWallSelector?.currentBaseBundle) {
      room.applyVanityWallBundle(
        textureLib.getOrientedBundle(
          vanityWallSelector.currentBaseBundle,
          vanityWallSelector.rotated90
        )
      );
    }
    room.setVanityWallEnabled(next);
    getCurrentRoomState().vanityWallEnabled = next;
    syncVanityWallStatusUI();
    saveAppState();
  });

  const spanGroup = document.getElementById('vanity-span-group');
  spanGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      room.setVanityWallOptions({ span: btn.dataset.span });
      getCurrentRoomState().vanityZoneSpan = btn.dataset.span;
      spanGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveAppState();
    });
  });

  const vHeightGroup = document.getElementById('vanity-height-group');
  vHeightGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      room.setVanityWallOptions({ heightMode: btn.dataset.vheight });
      getCurrentRoomState().vanityWallHeightMode = btn.dataset.vheight;
      vHeightGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveAppState();
    });
  });

  // Tile height mode
  const heightGroup = document.getElementById('tile-height-group');
  heightGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.height;
      room.setTileHeightMode(mode);
      getCurrentRoomState().tileHeightMode = mode;
      heightGroup.querySelectorAll('.pill-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      document.getElementById('paint-color-section').style.opacity =
        mode === 'full' ? '0.45' : '1';
      saveAppState();
    });
  });

  // Shower fixed tile height mode (locks shower tiles at 210 or 270 cm even when general walls change!)
  const showerHeightGroup = document.getElementById('shower-height-group');
  showerHeightGroup?.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const smode = btn.dataset.sheight;
      room.setShowerTileHeightMode(smode);
      getCurrentRoomState().showerTileHeightMode = smode;
      showerHeightGroup.querySelectorAll('.pill-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      saveAppState();
    });
  });

  // Upper wall paint colors
  const paintContainer = document.getElementById('paint-colors');
  PAINT_COLORS.forEach((col) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.dataset.paintId = col.id;
    dot.style.backgroundColor = col.hex;
    dot.title = col.name;
    dot.addEventListener('click', () => {
      getCurrentRoomState().paintId = col.id;
      room.setPaintColor(col.hex);
      paintContainer.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      saveAppState();
    });
    paintContainer.appendChild(dot);
  });

  // Vanity models
  const modelList = document.getElementById('vanity-models');
  VANITY_MODELS.forEach((m) => {
    const card = document.createElement('button');
    card.className = 'model-card';
    card.dataset.modelId = m.id;
    card.innerHTML = `
      <div class="model-name"><span>${m.name}</span></div>
      <div class="model-dims">${m.dims}</div>
      <div class="model-desc">${m.description}</div>
    `;
    card.addEventListener('click', () => {
      getCurrentRoomState().vanityModelId = m.id;
      vanityManager.setModel(m.id);
      syncVanityPoseToRoom();
      modelList.querySelectorAll('.model-card').forEach((c) => {
        c.classList.toggle('active', c.dataset.modelId === m.id);
      });
      saveAppState();
    });
    modelList.appendChild(card);
  });

  // Vanity finishes
  const finishContainer = document.getElementById('vanity-finishes');
  VANITY_FINISHES.forEach((f) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.dataset.finishId = f.id;
    dot.style.backgroundColor = f.hex;
    dot.title = f.name;
    dot.addEventListener('click', () => {
      getCurrentRoomState().vanityFinishId = f.id;
      vanityManager.setFinish(f);
      finishContainer.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      saveAppState();
    });
    finishContainer.appendChild(dot);
  });

  // Metal finish
  const metalGroup = document.getElementById('metal-finish-group');
  metalGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      getCurrentRoomState().metalFinish = btn.dataset.metal;
      room.setMetalFinish(btn.dataset.metal);
      metalGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveAppState();
    });
  });

  // Load Tecnomat, Progetto Baucer, and Armonie Ceramiche catalogs and restore saved coverings
  Promise.all([
    fetch('/tecnomat-gres-catalog.json').then((r) => r.json()),
    fetch('/baucer-catalog.json').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch('/armonie-catalog.json').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
  ])
    .then(async ([tmData, baucerData, armonieData]) => {
      const tmItems = (Array.isArray(tmData.items) ? tmData.items : []).map((it) => ({
        ...it,
        brand: 'tecnomat',
        brandLabel: 'Tecnomat',
      }));
      const baucerItems = Array.isArray(baucerData.items) ? baucerData.items : [];
      const armonieItems = Array.isArray(armonieData.items) ? armonieData.items : [];

      const items = [...tmItems, ...baucerItems, ...armonieItems];
      window.__TECNOMAT_CATALOG__ = tmItems;
      window.__ALL_CATALOGS__ = {
        total: items.length,
        tecnomat: tmItems.length,
        baucer: baucerItems.length,
        armonie: armonieItems.length,
        items,
      };

      const badgeLabel = `${items.length} Piastrelle`;
      const fb = document.getElementById('floor-catalog-badge');
      const wb = document.getElementById('wall-catalog-badge');
      if (fb) fb.textContent = badgeLabel;
      if (wb) wb.textContent = badgeLabel;

      floorSelector = new CatalogSelector({
        mountEl: document.getElementById('floor-catalog-mount'),
        catalogItems: items,
        presets: FLOOR_PRESETS,
        textureLib,
        initialPreset: FLOOR_PRESETS[0],
        onApplyBundle: (bundle) => room.applyFloorBundle(bundle),
        onSelectionChange: (spec) => {
          getCurrentRoomState().floor = spec;
          saveAppState();
        },
      });

      wallSelector = new CatalogSelector({
        mountEl: document.getElementById('wall-catalog-mount'),
        catalogItems: items,
        presets: WALL_PRESETS,
        textureLib,
        initialPreset: WALL_PRESETS[0],
        onApplyBundle: (bundle) => {
          // When Clicca Parete is deselected and the user actively selects a general wall tile,
          // apply it across ALL walls (clearing single-wall overrides unless restoring saved state)
          if (!isRestoringRoom && !wallPaintMode) {
            const cfg = getCurrentRoomState();
            if (cfg.perWallSpecs && Object.keys(cfg.perWallSpecs).length > 0) {
              cfg.perWallSpecs = {};
              room.clearAllSingleWallMaterials();
              syncCustomWallsListUI();
            }
          }
          room.applyWallBundle(bundle);
        },
        onSelectionChange: (spec) => {
          getCurrentRoomState().wall = spec;
          saveAppState();
        },
      });

      singleWallSelector = new CatalogSelector({
        mountEl: document.getElementById('single-wall-catalog-mount'),
        catalogItems: items,
        presets: WALL_PRESETS,
        textureLib,
        initialPreset: WALL_PRESETS[1],
        onApplyBundle: (bundle) => {
          if (isRestoringRoom) return;
          if (!wallPaintMode) {
            // Safety fallback: if Clicca Parete is deselected, apply to all walls
            const cfg = getCurrentRoomState();
            cfg.perWallSpecs = {};
            room.clearAllSingleWallMaterials();
            syncCustomWallsListUI();
            room.applyWallBundle(bundle);
            return;
          }
          const hint = document.getElementById('single-wall-hint-text');
          if (hint && singleWallSelector?.activeMeta) {
            hint.textContent = `Pennello pronto: "${singleWallSelector.activeMeta.title}" — fai doppio clic su una parete 3D!`;
          }
        },
      });

      vanityWallSelector = new CatalogSelector({
        mountEl: document.getElementById('vanity-wall-catalog-mount'),
        catalogItems: items,
        presets: WALL_PRESETS,
        textureLib,
        initialPreset: WALL_PRESETS[1],
        onApplyBundle: (bundle) => {
          room.applyVanityWallBundle(bundle);
          getCurrentRoomState().vanityWallEnabled = true;
          syncVanityWallStatusUI();
        },
        onSelectionChange: (spec) => {
          getCurrentRoomState().vanityWall = spec;
          getCurrentRoomState().vanityWallEnabled = room.vanityWallEnabled;
          saveAppState();
        },
      });

      await applyRoomConfigToSceneAndUI(appState.activeRoom, { resetCamera: true });
    })
    .catch((err) => {
      console.error('Errore caricamento cataloghi:', err);
    });
}

// --- 2D INTERACTIVE FLOORPLAN MINIMAP ---
const minimapCanvas = document.getElementById('minimap');
const mCtx = minimapCanvas.getContext('2d');
const MAP_SCALE = 60; // px per meter (fits both 280 cm and 292 cm plans cleanly)
const MAP_OX = 32;
const MAP_OY = 22;

function toMap(x, z) {
  return [MAP_OX + x * MAP_SCALE, MAP_OY + z * MAP_SCALE];
}

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (minimapCanvas.width / rect.width);
  const py = (e.clientY - rect.top) * (minimapCanvas.height / rect.height);
  const wx = (px - MAP_OX) / MAP_SCALE;
  const wz = (py - MAP_OY) / MAP_SCALE;

  if (wx >= -0.1 && wx <= 2.0 && wz >= -0.1 && wz <= 3.0) {
    navState.mode = 'walk';
    const clamped = room.clampWalkPosition(wx, wz);
    navState.pos.x = clamped.x;
    navState.pos.z = clamped.z;
    camera.fov = navState.fov;
    camera.updateProjectionMatrix();
    room.setCutawayMode(false);
    document.querySelectorAll('.cam-btn[data-preset]').forEach((b) => b.classList.remove('active'));
  }
});

function drawMinimap() {
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const isFirst = room.roomType === 'first';
  const poly = isFirst ? ROOM_POLYGON_FIRST : ROOM_POLYGON_GROUND;
  mCtx.clearRect(0, 0, W, H);

  // Subtle architectural grid background
  mCtx.strokeStyle = 'rgba(0,0,0,0.05)';
  mCtx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 15) {
    mCtx.beginPath();
    mCtx.moveTo(gx, 0);
    mCtx.lineTo(gx, H);
    mCtx.stroke();
  }
  for (let gy = 0; gy < H; gy += 15) {
    mCtx.beginPath();
    mCtx.moveTo(0, gy);
    mCtx.lineTo(W, gy);
    mCtx.stroke();
  }

  // Room polygon fill + thick masonry wall stroke
  mCtx.save();
  mCtx.beginPath();
  poly.forEach((pt, idx) => {
    const [mx, my] = toMap(pt.x, pt.z);
    if (idx === 0) mCtx.moveTo(mx, my);
    else mCtx.lineTo(mx, my);
  });
  mCtx.closePath();
  mCtx.fillStyle = '#ffffff';
  mCtx.fill();
  mCtx.lineWidth = 7;
  mCtx.strokeStyle = '#6c7075';
  mCtx.stroke();
  mCtx.lineWidth = 1.5;
  mCtx.strokeStyle = '#202428';
  mCtx.stroke();
  mCtx.restore();

  // Bidet (x=0.56) + Scaldasalviette bar above it, and WC (x=1.18) along North 190 cm wall
  for (const [sx, label] of [
    [0.56, 'B'],
    [1.18, 'WC'],
  ]) {
    const [bx, by] = toMap(sx - 0.17, 0.02);
    mCtx.fillStyle = '#eef2f5';
    mCtx.strokeStyle = '#666';
    mCtx.lineWidth = 1;
    mCtx.fillRect(bx, by, 0.34 * MAP_SCALE, 0.44 * MAP_SCALE);
    mCtx.strokeRect(bx, by, 0.34 * MAP_SCALE, 0.44 * MAP_SCALE);
    mCtx.fillStyle = '#555';
    mCtx.font = 'bold 7px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.fillText(label, bx + 0.17 * MAP_SCALE, by + 0.27 * MAP_SCALE);
  }

  // Scaldasalviette bar indicator above Bidet on North wall
  const [rx0, ry0] = toMap(0.34, 0.05);
  const [rx1] = toMap(0.78, 0.05);
  mCtx.strokeStyle = '#b45309';
  mCtx.lineWidth = 3;
  mCtx.beginPath();
  mCtx.moveTo(rx0, ry0);
  mCtx.lineTo(rx1, ry0);
  mCtx.stroke();

  // Dynamic Shower 80x80 Box (follows user wall-anchored position!)
  const shBox = room.getShowerAABB();
  if (shBox) {
    const [sx, sy] = toMap(shBox.minX, shBox.minZ);
    mCtx.fillStyle = 'rgba(56, 189, 248, 0.24)';
    mCtx.strokeStyle = '#0284c7';
    mCtx.lineWidth = 1.6;
    mCtx.fillRect(sx, sy, 0.8 * MAP_SCALE, 0.8 * MAP_SCALE);
    mCtx.strokeRect(sx, sy, 0.8 * MAP_SCALE, 0.8 * MAP_SCALE);
    mCtx.fillStyle = '#0369a1';
    mCtx.font = 'bold 7px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.fillText('80×80', sx + 0.4 * MAP_SCALE, sy + 0.45 * MAP_SCALE);
  }

  // Dynamic Vanity Accent Wall Highlight + Mobile Bagno Schematic (follows user wall-anchored position!)
  const vanPose = room.getVanityPoseAndAABB();
  if (room.vanityWallEnabled && vanPose?.wall) {
    const w = vanPose.wall;
    let sA = vanPose.spanL;
    let sB = vanPose.spanR;
    if (room.vanityZoneSpan === 'centered') {
      const half = Math.min(0.65, (vanPose.spanR - vanPose.spanL) * 0.47);
      sA = Math.max(vanPose.spanL, vanPose.s - half);
      sB = Math.min(vanPose.spanR, vanPose.s + half);
    }
    const [ax0, ay0] = toMap(w.p1.x + w.ux * sA, w.p1.z + w.uz * sA);
    const [ax1, ay1] = toMap(w.p1.x + w.ux * sB, w.p1.z + w.uz * sB);
    mCtx.strokeStyle = '#10b981';
    mCtx.lineWidth = 5;
    mCtx.beginPath();
    mCtx.moveTo(ax0, ay0);
    mCtx.lineTo(ax1, ay1);
    mCtx.stroke();
  }

  if (vanPose) {
    const [vx0, vy0] = toMap(vanPose.minX + 0.01, vanPose.minZ + 0.01);
    const vw = (vanPose.maxX - vanPose.minX - 0.02) * MAP_SCALE;
    const vh = (vanPose.maxZ - vanPose.minZ - 0.02) * MAP_SCALE;
    mCtx.fillStyle = '#d7b27d';
    mCtx.strokeStyle = '#6a5230';
    mCtx.lineWidth = 1;
    mCtx.fillRect(vx0, vy0, vw, vh);
    mCtx.strokeRect(vx0, vy0, vw, vh);
  }

  if (isFirst) {
    // East Window 100/100 (z = 0.18..1.18)
    const [wx0, wy0] = toMap(1.88, 0.18);
    const [, wy1] = toMap(1.88, 1.18);
    mCtx.strokeStyle = '#4da6dd';
    mCtx.lineWidth = 5;
    mCtx.beginPath();
    mCtx.moveTo(wx0 + 2, wy0);
    mCtx.lineTo(wx0 + 2, wy1);
    mCtx.stroke();

    // West Door 80/210 (x = 0.00, z = 0.60..1.40, hinged at bottom z=1.40 swinging upward)
    const [dx, dyTop] = toMap(0.0, 0.6);
    const [, dyBot] = toMap(0.0, 1.4);
    mCtx.strokeStyle = '#f6f4ee';
    mCtx.lineWidth = 7;
    mCtx.beginPath();
    mCtx.moveTo(dx, dyTop);
    mCtx.lineTo(dx, dyBot);
    mCtx.stroke();

    mCtx.strokeStyle = '#8b6a42';
    mCtx.lineWidth = 1.4;
    mCtx.beginPath();
    mCtx.moveTo(dx, dyBot);
    mCtx.lineTo(dx + 0.8 * MAP_SCALE, dyBot);
    mCtx.stroke();
    mCtx.setLineDash([2, 2]);
    mCtx.beginPath();
    mCtx.arc(dx, dyBot, 0.8 * MAP_SCALE, -Math.PI * 0.5, 0);
    mCtx.stroke();
    mCtx.setLineDash([]);

    // Blueprint dimensions (cm)
    mCtx.fillStyle = '#2d333b';
    mCtx.font = 'bold 9px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.fillText('190', MAP_OX + 0.95 * MAP_SCALE, MAP_OY - 7);
    mCtx.fillText('190', MAP_OX + 0.95 * MAP_SCALE, MAP_OY + 2.92 * MAP_SCALE + 13);
    mCtx.fillText('292', MAP_OX + 1.9 * MAP_SCALE + 15, MAP_OY + 1.5 * MAP_SCALE);
    mCtx.font = '8px sans-serif';
    mCtx.fillText('292', MAP_OX - 13, MAP_OY + 1.5 * MAP_SCALE);
  } else {
    const [wx0, wy0] = toMap(1.88, 0.25);
    const [, wy1] = toMap(1.88, 1.25);
    mCtx.strokeStyle = '#4da6dd';
    mCtx.lineWidth = 5;
    mCtx.beginPath();
    mCtx.moveTo(wx0 + 2, wy0);
    mCtx.lineTo(wx0 + 2, wy1);
    mCtx.stroke();

    const [dx, dy0] = toMap(0.14, 0.92);
    const [, dy1] = toMap(0.14, 1.72);
    mCtx.strokeStyle = '#f6f4ee';
    mCtx.lineWidth = 7;
    mCtx.beginPath();
    mCtx.moveTo(dx, dy0);
    mCtx.lineTo(dx, dy1);
    mCtx.stroke();

    mCtx.strokeStyle = '#8b6a42';
    mCtx.lineWidth = 1.4;
    mCtx.beginPath();
    mCtx.moveTo(dx, dy0);
    mCtx.lineTo(dx + 0.8 * MAP_SCALE, dy0);
    mCtx.stroke();
    mCtx.setLineDash([2, 2]);
    mCtx.beginPath();
    mCtx.arc(dx, dy0, 0.8 * MAP_SCALE, 0, Math.PI * 0.5);
    mCtx.stroke();
    mCtx.setLineDash([]);

    mCtx.fillStyle = '#2d333b';
    mCtx.font = 'bold 9px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.fillText('190', MAP_OX + 0.95 * MAP_SCALE, MAP_OY - 7);
    mCtx.fillText('136', MAP_OX + 1.22 * MAP_SCALE, MAP_OY + 2.8 * MAP_SCALE + 13);
    mCtx.fillText('280', MAP_OX + 1.9 * MAP_SCALE + 15, MAP_OY + 1.45 * MAP_SCALE);
    mCtx.font = '8px sans-serif';
    mCtx.fillText('80', MAP_OX - 12, MAP_OY + 0.42 * MAP_SCALE);
    mCtx.fillText('110', MAP_OX - 2, MAP_OY + 1.38 * MAP_SCALE);
    mCtx.fillText('90', MAP_OX + 0.36 * MAP_SCALE, MAP_OY + 2.4 * MAP_SCALE);
  }

  // Camera position & view cone
  let camX = navState.pos.x;
  let camZ = navState.pos.z;
  let lookAngle = Math.atan2(-Math.cos(navState.yaw), -Math.sin(navState.yaw));

  if (navState.mode === 'orbit') {
    camX = 0.98;
    camZ = isFirst ? 1.46 : 1.38;
    lookAngle = navState.orbitYaw;
  }

  const [cx, cy] = toMap(camX, camZ);
  mCtx.fillStyle = 'rgba(224, 148, 45, 0.28)';
  mCtx.beginPath();
  mCtx.moveTo(cx, cy);
  mCtx.arc(cx, cy, 32, lookAngle - 0.52, lookAngle + 0.52);
  mCtx.closePath();
  mCtx.fill();

  mCtx.fillStyle = '#d97706';
  mCtx.strokeStyle = '#ffffff';
  mCtx.lineWidth = 2;
  mCtx.beginPath();
  mCtx.arc(cx, cy, 5.5, 0, Math.PI * 2);
  mCtx.fill();
  mCtx.stroke();
}

// --- MAIN ANIMATION LOOP ---
initUI();
syncRoomLabelsUI(appState.activeRoom);
applyCameraPreset('entry');

let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (navState.mode === 'walk') {
    const walkSpeed = 1.35;
    const turnSpeed = 1.65;

    if (activeInputs.turnLeft) navState.yaw += turnSpeed * dt;
    if (activeInputs.turnRight) navState.yaw -= turnSpeed * dt;

    const fwdX = -Math.sin(navState.yaw);
    const fwdZ = -Math.cos(navState.yaw);
    const rightX = Math.cos(navState.yaw);
    const rightZ = -Math.sin(navState.yaw);

    let moveX = 0;
    let moveZ = 0;
    if (activeInputs.forward) {
      moveX += fwdX;
      moveZ += fwdZ;
    }
    if (activeInputs.backward) {
      moveX -= fwdX;
      moveZ -= fwdZ;
    }
    if (activeInputs.strafeRight) {
      moveX += rightX;
      moveZ += rightZ;
    }
    if (activeInputs.strafeLeft) {
      moveX -= rightX;
      moveZ -= rightZ;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.001) {
      const nextX = navState.pos.x + (moveX / len) * walkSpeed * dt;
      const nextZ = navState.pos.z + (moveZ / len) * walkSpeed * dt;
      const clamped = room.clampWalkPosition(nextX, nextZ);
      navState.pos.x = clamped.x;
      navState.pos.z = clamped.z;
    }

    camera.position.set(navState.pos.x, navState.pos.y, navState.pos.z);
    camera.rotation.set(navState.pitch, navState.yaw, 0, 'YXZ');

    document.getElementById('coords-readout').textContent =
      `${Math.round(navState.pos.x * 100)}, ${Math.round(navState.pos.z * 100)} cm`;
  } else {
    if (activeInputs.turnLeft || activeInputs.strafeLeft) navState.orbitYaw -= 1.35 * dt;
    if (activeInputs.turnRight || activeInputs.strafeRight) navState.orbitYaw += 1.35 * dt;
    if (activeInputs.forward) {
      navState.orbitDist = Math.max(2.0, navState.orbitDist - 1.6 * dt);
    }
    if (activeInputs.backward) {
      navState.orbitDist = Math.min(6.2, navState.orbitDist + 1.6 * dt);
    }

    const horiz = Math.cos(navState.orbitPitch) * navState.orbitDist;
    const ox = navState.orbitTarget.x + Math.sin(navState.orbitYaw) * horiz;
    const oz = navState.orbitTarget.z + Math.cos(navState.orbitYaw) * horiz;
    const oy = navState.orbitTarget.y + Math.sin(navState.orbitPitch) * navState.orbitDist;

    camera.position.set(ox, oy, oz);
    camera.lookAt(navState.orbitTarget);
  }

  room.update(dt, camera);
  drawMinimap();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__BATHROOM_SIM__ = {
  appState,
  navState,
  applyCameraPreset,
  applyRoomConfigToSceneAndUI,
  downloadActiveViewPhoto,
  room,
  vanityManager,
};

requestAnimationFrame(animate);
