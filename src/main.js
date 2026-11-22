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
import { CatalogSelector, VanityCatalogSelector } from './catalogUI.js';

const STORAGE_KEY = 'simulatore_bagno_state_v1';
const UNDO_STORAGE_KEY = 'simulatore_bagno_undo_v1';
const MAX_UNDO_STEPS = 30;

const SHOWER_TRAY_FINISHES = [
  { id: 'white-stone', name: 'Bianco Pietra Opaco', hex: '#f4f3ef' },
  { id: 'sand-stone', name: 'Beige Sabbia Naturale', hex: '#dfd5c5' },
  { id: 'corda-taupe', name: 'Tortora Corda', hex: '#b8aea0' },
  { id: 'cement-grey', name: 'Grigio Cemento', hex: '#9ca1a6' },
  { id: 'slate-anthracite', name: 'Antracite Ardesia', hex: '#484d52' },
  { id: 'carbon-black', name: 'Nero Carbone', hex: '#26292c' },
];

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
    wallSplitEnabled: false,
    wallUpper: { key: `preset:${WALL_PRESETS[1].id}`, rotated90: false },
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
    showerSize: fixDefs.showerSize || '80x80',
    showerTrayFinishId: SHOWER_TRAY_FINISHES[0].id,
    showerPlacement: { ...fixDefs.showerPlacement },
    vanityPlacement: { ...fixDefs.vanityPlacement },
    bidetPlacement: { ...fixDefs.bidetPlacement },
    wcPlacement: { ...fixDefs.wcPlacement },
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
        gridEnabled: Boolean(parsed.gridEnabled),
        lastModifiedAt: parsed.lastModifiedAt || null,
        lastActionLabel: parsed.lastActionLabel || null,
        roomPresets: {
          ground: Array.isArray(parsed.roomPresets?.ground)
            ? [
                parsed.roomPresets.ground[0] || null,
                parsed.roomPresets.ground[1] || null,
                parsed.roomPresets.ground[2] || null,
              ]
            : [null, null, null],
          first: Array.isArray(parsed.roomPresets?.first)
            ? [
                parsed.roomPresets.first[0] || null,
                parsed.roomPresets.first[1] || null,
                parsed.roomPresets.first[2] || null,
              ]
            : [null, null, null],
        },
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
    gridEnabled: false,
    lastModifiedAt: null,
    lastActionLabel: null,
    roomPresets: {
      ground: [null, null, null],
      first: [null, null, null],
    },
    rooms: {
      ground: createDefaultRoomConfig('ground'),
      first: null,
    },
  };
}

function loadUndoStack() {
  try {
    const raw = localStorage.getItem(UNDO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-MAX_UNDO_STEPS);
    }
  } catch (err) {
    console.warn('Impossibile leggere cronologia undo:', err);
  }
  return [];
}

function persistUndoStack() {
  try {
    localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(undoStack.slice(-MAX_UNDO_STEPS)));
  } catch (err) {
    console.warn('Impossibile salvare cronologia undo:', err);
  }
}

const appState = loadAppState();
const undoStack = loadUndoStack();
let isRestoringRoom = false;
let preDragSnapshot = null;

let floorSelector = null;
let wallSelector = null;
let wallUpperSelector = null;
let singleWallSelector = null;
let vanityWallSelector = null;
let vanityCatalogSelector = null;
let activeWallSplitTarget = 'lower'; // 'lower' (<120 cm) | 'upper' (>120 cm)

// Interactive 3D tool state
let wallPaintMode = false;
let moveFixturesMode = false;
let selectedFixture = null; // 'vanity' | 'shower' | 'bidet' | 'wc' | null
let draggingFixture = null; // 'vanity' | 'shower' | 'bidet' | 'wc' | null

function getCurrentRoomState() {
  if (!appState.rooms[appState.activeRoom]) {
    const base = createDefaultRoomConfig(appState.activeRoom);
    const src = appState.rooms.ground;
    if (src) {
      base.floor = JSON.parse(JSON.stringify(src.floor));
      base.wall = JSON.parse(JSON.stringify(src.wall));
      base.wallSplitEnabled = Boolean(src.wallSplitEnabled);
      base.wallUpper = src.wallUpper
        ? JSON.parse(JSON.stringify(src.wallUpper))
        : { key: `preset:${WALL_PRESETS[1].id}`, rotated90: false };
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

function captureCurrentSnapshot(label = 'Modifica') {
  getCurrentRoomState();
  return {
    activeRoom: appState.activeRoom,
    rooms: JSON.parse(JSON.stringify(appState.rooms)),
    label,
    timestamp: new Date().toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

function syncUndoButtonsUI() {
  const hasUndo = undoStack.length > 0;
  const lastSnap = hasUndo ? undoStack[undoStack.length - 1] : null;
  for (const id of ['btn-undo', 'btn-undo-panel']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = !hasUndo;
    btn.title = hasUndo
      ? `Annulla: ${lastSnap.label || 'Ultima modifica'} (${undoStack.length}) — Ctrl+Z`
      : 'Nessuna modifica da annullare (Ctrl+Z)';
  }
}

function recordUndoSnapshot(label = 'Modifica') {
  if (isRestoringRoom) return;
  const snap = captureCurrentSnapshot(label);
  const prev = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
  if (
    prev &&
    prev.activeRoom === snap.activeRoom &&
    JSON.stringify(prev.rooms) === JSON.stringify(snap.rooms)
  ) {
    prev.label = label;
    syncUndoButtonsUI();
    return;
  }
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
  persistUndoStack();
  syncUndoButtonsUI();
}

async function performUndo() {
  if (undoStack.length === 0) {
    showToast('↩️ Nessuna modifica precedente da annullare');
    return;
  }
  const snap = undoStack.pop();
  persistUndoStack();
  syncUndoButtonsUI();

  appState.rooms = JSON.parse(JSON.stringify(snap.rooms));
  const targetRoom = snap.activeRoom || appState.activeRoom;
  await applyRoomConfigToSceneAndUI(targetRoom, {
    resetCamera: targetRoom !== appState.activeRoom,
  });
  saveAppState(`Annullato: ${snap.label || 'Modifica'}`);
  showToast(`↩️ Annullata modifica: ${snap.label || 'Stato precedente ripristinato'}`);
}

function updateSavedIndicatorUI() {
  const ind = document.getElementById('saved-indicator');
  if (!ind) return;
  if (appState.lastModifiedAt) {
    const lbl = appState.lastActionLabel ? ` · ${appState.lastActionLabel}` : '';
    ind.textContent = `💾 Salvato ${appState.lastModifiedAt}${lbl}`;
  } else {
    ind.textContent = '💾 Rivestimenti memorizzati';
  }
}

function saveAppState(actionLabel = null) {
  if (isRestoringRoom) return;
  try {
    if (actionLabel) {
      appState.lastModifiedAt = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      appState.lastActionLabel = actionLabel;
    } else if (!appState.lastModifiedAt) {
      appState.lastModifiedAt = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    updateSavedIndicatorUI();
    syncUndoButtonsUI();
    syncRoomPresetsUI();
  } catch (err) {
    console.warn('Errore salvataggio localStorage:', err);
  }
}

function getPresetsForActiveRoom() {
  if (!appState.roomPresets) {
    appState.roomPresets = { ground: [null, null, null], first: [null, null, null] };
  }
  if (!Array.isArray(appState.roomPresets[appState.activeRoom])) {
    appState.roomPresets[appState.activeRoom] = [null, null, null];
  }
  return appState.roomPresets[appState.activeRoom];
}

function syncRoomPresetsUI() {
  const isFirst = appState.activeRoom === 'first';
  const roomShort = isFirst ? '1°P' : 'PT';
  const titleEl = document.getElementById('room-presets-title');
  if (titleEl) {
    titleEl.textContent = `⭐ Preset Bagno ${roomShort}:`;
  }

  const presets = getPresetsForActiveRoom();
  const curJson = JSON.stringify(getCurrentRoomState());

  for (let i = 0; i < 3; i++) {
    const p = presets[i];
    const slotEl = document.querySelector(`.preset-slot[data-slot="${i}"]`);
    const loadBtn = document.querySelector(`.preset-load-btn[data-slot="${i}"]`);
    const stateEl = document.getElementById(`preset-state-${i}`);
    if (!slotEl || !stateEl) continue;

    const hasData = Boolean(p && p.config);
    const isActiveMatch = hasData && JSON.stringify(p.config) === curJson;
    slotEl.classList.toggle('has-data', hasData);
    slotEl.classList.toggle('active-preset', isActiveMatch);

    if (hasData) {
      stateEl.textContent = p.savedAt || 'Salvato';
      if (loadBtn) {
        loadBtn.title = `Richiama Preset ${i + 1} (${roomShort}) — salvato alle ${p.savedAt || ''}${p.summary ? `\n${p.summary}` : ''}`;
      }
    } else {
      stateEl.textContent = 'Vuoto';
      if (loadBtn) {
        loadBtn.title = `Preset ${i + 1} (${roomShort}) vuoto — clicca per salvare la configurazione attuale`;
      }
    }
  }
}

function saveRoomPreset(slotIndex) {
  const presets = getPresetsForActiveRoom();
  const cfg = JSON.parse(JSON.stringify(getCurrentRoomState()));
  const savedAt = new Date().toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const floorTitle = floorSelector?.activeMeta?.title || '';
  const wallTitle = wallSelector?.activeMeta?.title || '';
  const summary = [floorTitle && `Pav: ${floorTitle}`, wallTitle && `Par: ${wallTitle}`]
    .filter(Boolean)
    .join(' · ');

  presets[slotIndex] = {
    name: `Preset ${slotIndex + 1}`,
    savedAt,
    summary,
    config: cfg,
  };

  const roomLabel = appState.activeRoom === 'first' ? 'Primo Piano' : 'Pianterreno';
  saveAppState(`Salvato Preset ${slotIndex + 1} (${roomLabel})`);
  showToast(`⭐ Configurazione salvata in Preset ${slotIndex + 1} (${roomLabel})`);
}

async function loadRoomPreset(slotIndex) {
  const presets = getPresetsForActiveRoom();
  const p = presets[slotIndex];
  if (!p || !p.config) {
    // Empty slot: save immediately on click for convenience
    saveRoomPreset(slotIndex);
    return;
  }

  const roomLabel = appState.activeRoom === 'first' ? 'Primo Piano' : 'Pianterreno';
  recordUndoSnapshot(`Richiamo Preset ${slotIndex + 1}`);
  appState.rooms[appState.activeRoom] = JSON.parse(JSON.stringify(p.config));
  await applyRoomConfigToSceneAndUI(appState.activeRoom, { resetCamera: false });
  saveAppState(`Caricato Preset ${slotIndex + 1} (${roomLabel})`);
  showToast(`⭐ Preset ${slotIndex + 1} (${roomLabel}) caricato!`);
}

// Initial fallback materials while catalog JSON loads
room.setFloorPreset(FLOOR_PRESETS[0]);
room.setWallPreset(WALL_PRESETS[0]);
room.applyUpperWallBundle(textureLib.getPresetBundle(WALL_PRESETS[1]));
room.vanityWallMaterial.map = textureLib.getPresetBundle(WALL_PRESETS[1]).map;
room.vanityWallMaterial.bumpMap = textureLib.getPresetBundle(WALL_PRESETS[1]).bumpMap;
room.setGridEnabled(Boolean(appState.gridEnabled));

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

    // Dynamically frame Mobile Bagno, Box Doccia or Sanitari wherever the user moved them!
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
    } else if (presetName === 'sanitary') {
      const bp = room.getSanitaryPoseAndAABB('bidet');
      const wp = room.getSanitaryPoseAndAABB('wc');
      const midX = (bp.x + wp.x) * 0.5;
      const midZ = (bp.z + wp.z) * 0.5;
      const avgNx = (bp.wall.nx + wp.wall.nx) * 0.5 || bp.wall.nx;
      const avgNz = (bp.wall.nz + wp.wall.nz) * 0.5 || bp.wall.nz;
      const nLen = Math.hypot(avgNx, avgNz) || 1;
      const nx = avgNx / nLen;
      const nz = avgNz / nLen;
      targetX = midX + nx * 1.35;
      targetZ = midZ + nz * 1.35;
      targetYaw = Math.atan2(nx, nz);
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveAppState('Salvataggio manuale');
    showToast('💾 Ultima modifica salvata correttamente!');
    return;
  }
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
  } else if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
    document.getElementById('btn-grid')?.click();
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
  if (room.bidetGroup) {
    targets.push(room.bidetGroup);
  }
  if (room.wcGroup) {
    targets.push(room.wcGroup);
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
  // First intersect visible walls & floor so dragging at any vertical height on a wall tracks (x, z) accurately
  const hitTargets = [];
  if (room.floorMesh) hitTargets.push(room.floorMesh);
  for (const w of room.wallGroups) {
    if (w.group.visible) hitTargets.push(w.group);
  }
  if (hitTargets.length > 0) {
    const hits = raycaster.intersectObjects(hitTargets, true);
    if (hits.length > 0) {
      return { x: hits[0].point.x, z: hits[0].point.z };
    }
  }
  if (raycaster.ray.intersectPlane(dragFloorPlane, dragHitPoint)) {
    return { x: dragHitPoint.x, z: dragHitPoint.z };
  }
  return null;
}

function applyFixtureDragAtWorldCoords(fixtureKind, wx, wz) {
  if (fixtureKind === 'vanity') {
    const nextP = room.findNearestVanityPlacement(wx, wz);
    room.setFixturesConfig({ vanityPlacement: nextP });
    getCurrentRoomState().vanityPlacement = { ...nextP };
    syncVanityPoseToRoom();
  } else if (fixtureKind === 'shower' && room.showerEnabled) {
    const nextP = room.findNearestShowerPlacement(wx, wz);
    room.setFixturesConfig({ showerPlacement: nextP });
    getCurrentRoomState().showerPlacement = { ...nextP };
    syncShowerPresenceUI();
    syncVanityPoseToRoom();
  } else if (fixtureKind === 'bidet' || fixtureKind === 'wc') {
    const res = room.dragSanitaryFixture(fixtureKind, wx, wz);
    room.setFixturesConfig({
      bidetPlacement: res.bidetPlacement,
      wcPlacement: res.wcPlacement,
    });
    getCurrentRoomState().bidetPlacement = { ...res.bidetPlacement };
    getCurrentRoomState().wcPlacement = { ...res.wcPlacement };
    syncVanityPoseToRoom();
  }
  room.setSelectedFixtureHighlight(fixtureKind);
}

function syncVanityPoseToRoom() {
  room.setVanityTargetSpan(vanityManager.getNaturalSpan());
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
      recordUndoSnapshot(`Ripristino ${segMap.get(wallId) || wallId}`);
      delete cfg.perWallSpecs[wallId];
      room.clearSingleWallMaterial(wallId);
      syncCustomWallsListUI();
      saveAppState(`Parete ripristinata: ${segMap.get(wallId) || wallId}`);
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
      selectedFixture = 'wc';
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
  recordUndoSnapshot(`Piastrella su ${hitW.wallLabel}`);
  room.applySingleWallBundle(hitW.wallId, brush.bundle);
  const cfg = getCurrentRoomState();
  if (!cfg.perWallSpecs) cfg.perWallSpecs = {};
  cfg.perWallSpecs[hitW.wallId] = brush.spec;
  syncCustomWallsListUI();
  saveAppState(`Piastrella su ${hitW.wallLabel}`);
  showToast(`🖌️ "${brush.title}" applicato a ${hitW.wallLabel}`);
  return true;
}

// Mouse drag look / orbit / wall-dblclick / fixture-drag + wheel zoom
let isDragging = false;
let prevPointer = { x: 0, y: 0 };
let pointerTravel = 0;
let lastTouchTapTime = 0;
let lastTouchTapPos = { x: 0, y: 0 };

const FIXTURE_LABELS = {
  shower: () => `Box Doccia ${room.getShowerDimensions().label}`,
  vanity: () => 'Mobile Bagno',
  bidet: () => 'Bidet + Scaldasalviette',
  wc: () => 'WC Sospeso',
};

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
      const lbl = FIXTURE_LABELS[hitFixture]?.() || 'Arredo';
      preDragSnapshot = captureCurrentSnapshot(`Spostamento ${lbl}`);
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
      applyFixtureDragAtWorldCoords(draggingFixture, pt.x, pt.z);
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

function finalizeFixtureDrag(movedType) {
  const label = FIXTURE_LABELS[movedType]?.() || 'Arredo';
  if (preDragSnapshot) {
    const curRoomsStr = JSON.stringify(appState.rooms);
    const prevRoomsStr = JSON.stringify(preDragSnapshot.rooms);
    if (curRoomsStr !== prevRoomsStr) {
      undoStack.push(preDragSnapshot);
      if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
      persistUndoStack();
      syncUndoButtonsUI();
      saveAppState(`Posizione ${label}`);
    } else {
      saveAppState();
    }
    preDragSnapshot = null;
  } else {
    saveAppState(`Posizione ${label}`);
  }
}

canvas.addEventListener('pointerup', (e) => {
  if (draggingFixture) {
    const movedType = draggingFixture;
    draggingFixture = null;
    finalizeFixtureDrag(movedType);
    if (pointerTravel < 5) {
      const label = FIXTURE_LABELS[movedType]?.() || 'Arredo';
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
  preDragSnapshot = null;
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

function syncWallSplitUI() {
  const on = Boolean(room.wallSplitEnabled);
  const btn = document.getElementById('btn-toggle-wall-split');
  const lbl = document.getElementById('wall-split-status');
  const targetGroup = document.getElementById('wall-split-target-group');
  const lowerMount = document.getElementById('wall-catalog-mount');
  const upperMount = document.getElementById('wall-upper-catalog-mount');

  if (btn) {
    btn.textContent = on ? 'Attivo ✓' : 'Attiva';
    btn.classList.toggle('active', on);
  }
  if (lbl) {
    lbl.textContent = on
      ? activeWallSplitTarget === 'upper'
        ? 'Stai scegliendo il rivestimento SOPRA i 120 cm'
        : 'Stai scegliendo il rivestimento SOTTO i 120 cm'
      : 'Scegli un rivestimento diverso sotto e sopra i 120 cm';
  }
  if (targetGroup) {
    targetGroup.style.display = on ? 'flex' : 'none';
    targetGroup.querySelectorAll('.pill-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.split === activeWallSplitTarget);
    });
  }
  if (lowerMount && upperMount) {
    if (!on || activeWallSplitTarget === 'lower') {
      lowerMount.style.display = 'block';
      upperMount.style.display = 'none';
    } else {
      lowerMount.style.display = 'none';
      upperMount.style.display = 'block';
    }
  }
}

function syncShowerPresenceUI() {
  const on = Boolean(room.showerEnabled);
  const sz = room.showerSize || '80x80';
  const dimLabel = room.getShowerDimensions(sz).label;
  const btn = document.getElementById('btn-toggle-shower-box');
  const titleEl = document.getElementById('shower-presence-title');
  const badgeEl = document.getElementById('shower-wall-badge');
  const btnPreset = document.getElementById('btn-preset-shower');
  const wrapHeight = document.getElementById('shower-height-wrap');
  const wrapTabHeight = document.getElementById('shower-tab-height-wrap');
  const wrapSize = document.getElementById('shower-size-wrap');
  const wrapTrayFinish = document.getElementById('shower-tray-finish-section');
  if (btn) {
    btn.textContent = on ? 'Presente ✓' : 'Assente';
    btn.classList.toggle('active', on);
  }
  if (titleEl) {
    titleEl.textContent = `🚿 Box Doccia ${dimLabel}`;
  }
  if (badgeEl) {
    const shBox = room.getShowerAABB();
    const wallLbl = shBox?.wall?.label ? ` · ${shBox.wall.label}` : '';
    badgeEl.textContent = on ? `${dimLabel} cm${wallLbl}` : 'Assente';
  }
  if (btnPreset) {
    btnPreset.style.display = on ? 'inline-flex' : 'none';
    btnPreset.title = `Vista box doccia ${dimLabel} (5)`;
  }
  if (wrapHeight) {
    wrapHeight.style.opacity = on ? '1' : '0.45';
  }
  if (wrapTabHeight) {
    wrapTabHeight.style.opacity = on ? '1' : '0.45';
  }
  if (wrapSize) {
    wrapSize.style.opacity = on ? '1' : '0.5';
  }
  if (wrapTrayFinish) {
    wrapTrayFinish.style.opacity = on ? '1' : '0.45';
  }
  document.querySelectorAll('#shower-size-group .pill-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.shsize === sz);
  });
  syncRoomLabelsUI(appState.activeRoom);
}

function syncRoomLabelsUI(roomKey) {
  const isFirst = roomKey === 'first';
  document.querySelectorAll('#room-switcher .room-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.room === roomKey);
  });

  const sub = document.getElementById('room-subtitle');
  if (sub) {
    const shText = room.showerEnabled ? ` · Doccia ${room.getShowerDimensions().label}` : '';
    sub.innerHTML = isFirst
      ? `Piantina Primo Piano · <strong>5,55 mq</strong> (190×292${shText} · r.a.i. 0,180)`
      : `Piantina Pianterreno · <strong>4,68 mq</strong> (190×280 / 136×90${shText} · r.a.i. 0,214)`;
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

  // Restore movable wall-anchored fixtures (Shower 80x80 / 70x120, Mobile Bagno, Bidet & WC)
  const showerEnabled =
    typeof cfg.showerEnabled === 'boolean' ? cfg.showerEnabled : fixDefs.showerEnabled;
  const showerSize = cfg.showerSize || fixDefs.showerSize || '80x80';
  const showerPlacement = cfg.showerPlacement || fixDefs.showerPlacement;
  const vanityPlacement = cfg.vanityPlacement || fixDefs.vanityPlacement;
  const bidetPlacement = cfg.bidetPlacement || fixDefs.bidetPlacement;
  const wcPlacement = cfg.wcPlacement || fixDefs.wcPlacement;
  room.setFixturesConfig({
    showerEnabled,
    showerSize,
    showerPlacement,
    vanityPlacement,
    bidetPlacement,
    wcPlacement,
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
  document
    .querySelectorAll('#shower-height-group .pill-btn, #shower-tab-height-group .pill-btn')
    .forEach((b) => {
      b.classList.toggle('active', b.dataset.sheight === shHeight);
    });

  const trayFinishObj =
    SHOWER_TRAY_FINISHES.find((t) => t.id === cfg.showerTrayFinishId) || SHOWER_TRAY_FINISHES[0];
  room.setShowerTrayColor(trayFinishObj.hex);
  document.querySelectorAll('#shower-tray-finishes .color-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.trayFinishId === trayFinishObj.id);
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

  const targetModelId = cfg.vanityModelId || VANITY_MODELS[0].id;
  vanityManager.setModel(targetModelId);
  if (vanityCatalogSelector) {
    vanityCatalogSelector.setSelection(targetModelId, { triggerCallback: false });
  }
  syncVanityPoseToRoom();

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
  if (wallUpperSelector) {
    const upperSpec = cfg.wallUpper || { key: `preset:${WALL_PRESETS[1].id}`, rotated90: false };
    await wallUpperSelector.applySelectionSpec(upperSpec, { triggerApply: true });
  }
  room.setWallSplitEnabled(Boolean(cfg.wallSplitEnabled));
  syncWallSplitUI();
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

  // 10 cm Grid overlay button
  const btnGrid = document.getElementById('btn-grid');
  if (btnGrid) {
    btnGrid.classList.toggle('active', Boolean(appState.gridEnabled));
    btnGrid.addEventListener('click', () => {
      appState.gridEnabled = !appState.gridEnabled;
      room.setGridEnabled(appState.gridEnabled);
      btnGrid.classList.toggle('active', appState.gridEnabled);
      saveAppState();
      showToast(
        appState.gridEnabled
          ? '📏 Griglia 10 cm attiva su pavimento e pareti (linee rosse ogni 50 cm)'
          : '📏 Griglia 10 cm disattivata'
      );
    });
  }

  // Undo & Save buttons (top bar + side panel)
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    performUndo();
  });
  document.getElementById('btn-undo-panel')?.addEventListener('click', () => {
    performUndo();
  });
  document.getElementById('btn-save-state')?.addEventListener('click', () => {
    saveAppState('Salvataggio manuale');
    showToast('💾 Ultima modifica salvata correttamente!');
  });
  updateSavedIndicatorUI();
  syncUndoButtonsUI();
  syncRoomPresetsUI();

  // Per-bathroom 3 quick presets (save & load)
  document.querySelectorAll('.preset-load-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.slot);
      if (idx >= 0 && idx < 3) loadRoomPreset(idx);
    });
  });
  document.querySelectorAll('.preset-save-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.slot);
      if (idx >= 0 && idx < 3) saveRoomPreset(idx);
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
    recordUndoSnapshot('Copia da altro bagno');
    const cur = getCurrentRoomState();
    appState.rooms[appState.activeRoom] = {
      ...JSON.parse(JSON.stringify(otherCfg)),
      perWallSpecs: {},
      showerEnabled: cur.showerEnabled,
      showerSize: cur.showerSize || '80x80',
      showerPlacement: { ...cur.showerPlacement },
      vanityPlacement: { ...cur.vanityPlacement },
      bidetPlacement: { ...(cur.bidetPlacement || room.bidetPlacement) },
      wcPlacement: { ...(cur.wcPlacement || room.wcPlacement) },
    };
    await applyRoomConfigToSceneAndUI(appState.activeRoom, { resetCamera: false });
    saveAppState('Copia da altro bagno');
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
      showToast('✋ Modalità Sposta Arredi attiva: trascina Mobile, Doccia, WC o Bidet lungo le pareti');
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
    recordUndoSnapshot('Ripristino pareti singole');
    getCurrentRoomState().perWallSpecs = {};
    room.clearAllSingleWallMaterials();
    syncCustomWallsListUI();
    saveAppState('Pareti singole ripristinate');
    showToast('Tutte le pareti singole ripristinate al rivestimento generale');
  });

  document.getElementById('btn-reset-fixtures')?.addEventListener('click', () => {
    recordUndoSnapshot('Ripristino posizione arredi');
    const defs = room.getDefaultFixturesForRoom(appState.activeRoom);
    const cfg = getCurrentRoomState();
    cfg.showerEnabled = defs.showerEnabled;
    cfg.showerSize = defs.showerSize || '80x80';
    cfg.showerPlacement = { ...defs.showerPlacement };
    cfg.vanityPlacement = { ...defs.vanityPlacement };
    cfg.bidetPlacement = { ...defs.bidetPlacement };
    cfg.wcPlacement = { ...defs.wcPlacement };
    room.setFixturesConfig({
      showerEnabled: defs.showerEnabled,
      showerSize: defs.showerSize || '80x80',
      showerPlacement: defs.showerPlacement,
      vanityPlacement: defs.vanityPlacement,
      bidetPlacement: defs.bidetPlacement,
      wcPlacement: defs.wcPlacement,
    });
    syncShowerPresenceUI();
    syncVanityPoseToRoom();
    saveAppState('Posizione arredi ripristinata');
    showToast('↺ Posizione Mobile, Doccia, WC e Bidet ripristinata');
  });

  document.getElementById('btn-toggle-shower-box')?.addEventListener('click', () => {
    recordUndoSnapshot(room.showerEnabled ? 'Rimozione box doccia' : 'Aggiunta box doccia');
    const next = !room.showerEnabled;
    const cfg = getCurrentRoomState();
    cfg.showerEnabled = next;
    const shSize = cfg.showerSize || room.showerSize || '80x80';
    let shPlace = cfg.showerPlacement || room.getDefaultFixturesForRoom(appState.activeRoom).showerPlacement;
    if (next) {
      // Ensure shower doesn't overlap current vanity or sanitari when enabled
      const candBox = room.getShowerAABB(shPlace, true, shSize);
      const vanBox = room.getVanityPoseAndAABB(cfg.vanityPlacement, null);
      const forbidden = room.getForbiddenFixtureBoxes({ excludeKind: 'shower' });
      if (
        !room.isBoxInsideRoom(candBox, 0.025) ||
        room.boxesOverlap(candBox, vanBox, 0.015) ||
        forbidden.some((fb) => room.boxesOverlap(candBox, fb, 0.01))
      ) {
        shPlace = room.findNearestShowerPlacement(1.5, 2.5, shSize);
        cfg.showerPlacement = { ...shPlace };
      }
    }
    room.setFixturesConfig({ showerEnabled: next, showerSize: shSize, showerPlacement: shPlace });
    syncShowerPresenceUI();
    syncVanityPoseToRoom();
    saveAppState(next ? 'Box doccia attivato' : 'Box doccia rimosso');
  });

  document.querySelectorAll('#shower-size-group .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSize = btn.dataset.shsize || '80x80';
      const cfg = getCurrentRoomState();
      if (cfg.showerSize === nextSize && room.showerEnabled) return;
      recordUndoSnapshot(`Formato doccia ${room.getShowerDimensions(nextSize).label}`);
      cfg.showerSize = nextSize;
      let shPlace = cfg.showerPlacement || room.showerPlacement;
      const curBox = room.getShowerAABB(shPlace, true, room.showerSize);
      const targetX = curBox ? curBox.cx : 1.5;
      const targetZ = curBox ? curBox.cz : 2.5;

      const candBox = room.getShowerAABB(shPlace, true, nextSize);
      const vanBox = room.getVanityPoseAndAABB(cfg.vanityPlacement, null);
      const forbidden = room.getForbiddenFixtureBoxes({ excludeKind: 'shower' });
      if (
        !candBox ||
        candBox.wall.len < candBox.along - 0.005 ||
        !room.isBoxInsideRoom(candBox, 0.025) ||
        room.boxesOverlap(candBox, vanBox, 0.015) ||
        forbidden.some((fb) => room.boxesOverlap(candBox, fb, 0.01))
      ) {
        shPlace = room.findNearestShowerPlacement(targetX, targetZ, nextSize);
        cfg.showerPlacement = { ...shPlace };
      } else {
        shPlace = { wallId: candBox.wallId, s: Math.round(candBox.s * 1000) / 1000 };
        cfg.showerPlacement = { ...shPlace };
      }

      if (!room.showerEnabled) {
        cfg.showerEnabled = true;
      }
      room.setFixturesConfig({
        showerEnabled: true,
        showerSize: nextSize,
        showerPlacement: shPlace,
      });
      if (selectedFixture === 'shower') {
        room.setSelectedFixtureHighlight('shower');
      }
      syncShowerPresenceUI();
      syncVanityPoseToRoom();
      saveAppState(`Piatto doccia ${room.getShowerDimensions(nextSize).label}`);
      showToast(`🚿 Piatto doccia impostato a ${room.getShowerDimensions(nextSize).label} cm`);
    });
  });

  document.getElementById('btn-toggle-vanity-wall').addEventListener('click', () => {
    recordUndoSnapshot('Fascia parete mobile');
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
    saveAppState(next ? 'Fascia mobile attivata' : 'Fascia mobile disattivata');
  });

  const spanGroup = document.getElementById('vanity-span-group');
  spanGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (getCurrentRoomState().vanityZoneSpan === btn.dataset.span) return;
      recordUndoSnapshot('Larghezza fascia mobile');
      room.setVanityWallOptions({ span: btn.dataset.span });
      getCurrentRoomState().vanityZoneSpan = btn.dataset.span;
      spanGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveAppState('Larghezza fascia mobile');
    });
  });

  const vHeightGroup = document.getElementById('vanity-height-group');
  vHeightGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (getCurrentRoomState().vanityWallHeightMode === btn.dataset.vheight) return;
      recordUndoSnapshot('Altezza fascia mobile');
      room.setVanityWallOptions({ heightMode: btn.dataset.vheight });
      getCurrentRoomState().vanityWallHeightMode = btn.dataset.vheight;
      vHeightGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveAppState('Altezza fascia mobile');
    });
  });

  // Tile height mode
  const heightGroup = document.getElementById('tile-height-group');
  heightGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.height;
      if (getCurrentRoomState().tileHeightMode === mode) return;
      recordUndoSnapshot('Altezza piastrelle pareti');
      room.setTileHeightMode(mode);
      getCurrentRoomState().tileHeightMode = mode;
      heightGroup.querySelectorAll('.pill-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      document.getElementById('paint-color-section').style.opacity =
        mode === 'full' ? '0.45' : '1';
      saveAppState('Altezza piastrelle pareti');
    });
  });

  document.getElementById('btn-move-shower-quick')?.addEventListener('click', () => {
    const cfg = getCurrentRoomState();
    if (!room.showerEnabled) {
      recordUndoSnapshot('Aggiunta box doccia');
      cfg.showerEnabled = true;
      const shSize = cfg.showerSize || '80x80';
      const shPlace = room.findNearestShowerPlacement(1.5, 2.5, shSize);
      cfg.showerPlacement = { ...shPlace };
      room.setFixturesConfig({ showerEnabled: true, showerSize: shSize, showerPlacement: shPlace });
      syncShowerPresenceUI();
      syncVanityPoseToRoom();
      saveAppState('Box doccia attivato');
    }
    selectedFixture = 'shower';
    setMoveFixturesMode(true);
    room.setSelectedFixtureHighlight('shower');
    showToast('✋ Trascina il Box Doccia lungo le pareti in 3D o sulla Piantina 2D');
  });

  // Shower fixed tile height mode (locks shower tiles at 210 or 270 cm even when general walls change!)
  const applyShowerHeightSelection = (smode) => {
    if (getCurrentRoomState().showerTileHeightMode === smode) return;
    recordUndoSnapshot('Altezza piastrelle doccia');
    room.setShowerTileHeightMode(smode);
    getCurrentRoomState().showerTileHeightMode = smode;
    document
      .querySelectorAll('#shower-height-group .pill-btn, #shower-tab-height-group .pill-btn')
      .forEach((b) => {
        b.classList.toggle('active', b.dataset.sheight === smode);
      });
    saveAppState('Altezza piastrelle doccia');
  };

  document
    .querySelectorAll('#shower-height-group .pill-btn, #shower-tab-height-group .pill-btn')
    .forEach((btn) => {
      btn.addEventListener('click', () => applyShowerHeightSelection(btn.dataset.sheight));
    });

  // Shower tray stone-resin finishes
  const trayFinishContainer = document.getElementById('shower-tray-finishes');
  if (trayFinishContainer) {
    SHOWER_TRAY_FINISHES.forEach((tf) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot';
      dot.dataset.trayFinishId = tf.id;
      dot.style.backgroundColor = tf.hex;
      dot.title = tf.name;
      dot.addEventListener('click', () => {
        if (getCurrentRoomState().showerTrayFinishId === tf.id) return;
        recordUndoSnapshot(`Colore piatto doccia ${tf.name}`);
        getCurrentRoomState().showerTrayFinishId = tf.id;
        room.setShowerTrayColor(tf.hex);
        trayFinishContainer.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        saveAppState(`Piatto doccia ${tf.name}`);
      });
      trayFinishContainer.appendChild(dot);
    });
  }

  // Upper wall paint colors
  const paintContainer = document.getElementById('paint-colors');
  PAINT_COLORS.forEach((col) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.dataset.paintId = col.id;
    dot.style.backgroundColor = col.hex;
    dot.title = col.name;
    dot.addEventListener('click', () => {
      if (getCurrentRoomState().paintId === col.id) return;
      recordUndoSnapshot(`Intonaco ${col.name}`);
      getCurrentRoomState().paintId = col.id;
      room.setPaintColor(col.hex);
      paintContainer.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      saveAppState(`Intonaco ${col.name}`);
    });
    paintContainer.appendChild(dot);
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
      if (getCurrentRoomState().vanityFinishId === f.id) return;
      recordUndoSnapshot(`Finitura mobile ${f.name}`);
      getCurrentRoomState().vanityFinishId = f.id;
      vanityManager.setFinish(f);
      finishContainer.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      saveAppState(`Finitura mobile ${f.name}`);
    });
    finishContainer.appendChild(dot);
  });

  // Metal finish
  const metalGroup = document.getElementById('metal-finish-group');
  metalGroup.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (getCurrentRoomState().metalFinish === btn.dataset.metal) return;
      recordUndoSnapshot(`Rubinetteria ${btn.textContent.trim()}`);
      getCurrentRoomState().metalFinish = btn.dataset.metal;
      room.setMetalFinish(btn.dataset.metal);
      metalGroup.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
      saveAppState(`Rubinetteria ${btn.textContent.trim()}`);
    });
  });

  // Split wall covering below 120 cm / above 120 cm
  document.getElementById('btn-toggle-wall-split')?.addEventListener('click', () => {
    const cfg = getCurrentRoomState();
    const next = !room.wallSplitEnabled;
    recordUndoSnapshot(next ? 'Divisione parete a 120 cm' : 'Parete unica');
    cfg.wallSplitEnabled = next;
    // If tileHeightMode was 'half' (120 cm), promote to 'door' (210 cm) so the >120 cm band is visible!
    if (next && cfg.tileHeightMode === 'half') {
      cfg.tileHeightMode = 'door';
      room.setTileHeightMode('door');
      document.querySelectorAll('#tile-height-group .pill-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.height === 'door');
      });
    }
    if (next && wallUpperSelector?.currentBaseBundle) {
      room.applyUpperWallBundle(
        textureLib.getOrientedBundle(
          wallUpperSelector.currentBaseBundle,
          wallUpperSelector.rotated90
        )
      );
    }
    room.setWallSplitEnabled(next);
    syncWallSplitUI();
    saveAppState(next ? 'Rivestimento diviso a 120 cm' : 'Rivestimento unico');
    showToast(
      next
        ? '✂️ Divisione a 120 cm attiva: scegli piastrelle diverse Sotto 120 cm e Sopra 120 cm'
        : '✂️ Divisione a 120 cm disattivata'
    );
  });

  document.querySelectorAll('#wall-split-target-group .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeWallSplitTarget = btn.dataset.split === 'upper' ? 'upper' : 'lower';
      syncWallSplitUI();
    });
  });

  // Load all 14 ceramic catalogs + Iperceramica Avivo & Deghi bathroom furniture catalogs
  const fetchCat = (url) =>
    fetch(url)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .catch(() => ({ items: [] }));

  Promise.all([
    fetchCat('/atlas-catalog.json'),
    fetchCat('/fioranese-catalog.json'),
    fetchCat('/caesar-catalog.json'),
    fetchCat('/delconca-catalog.json'),
    fetchCat('/demaio-catalog.json'),
    fetchCat('/tecnolam-catalog.json'),
    fetchCat('/florim-catalog.json'),
    fetchCat('/mirage-catalog.json'),
    fetchCat('/fap-catalog.json'),
    fetchCat('/bardelli-catalog.json'),
    fetchCat('/serenissima-catalog.json'),
    fetchCat('/tecnomat-gres-catalog.json'),
    fetchCat('/baucer-catalog.json'),
    fetchCat('/armonie-catalog.json'),
    fetchCat('/iperceramica-avivo-vanities.json'),
    fetchCat('/deghi-vanities.json'),
  ])
    .then(
      async ([
        atlasData,
        fioraneseData,
        caesarData,
        delconcaData,
        demaioData,
        tecnolamData,
        florimData,
        mirageData,
        fapData,
        bardelliData,
        serenissimaData,
        tmData,
        baucerData,
        armonieData,
        avivoData,
        deghiData,
      ]) => {
        const atlasItems = Array.isArray(atlasData.items) ? atlasData.items : [];
        const fioraneseItems = Array.isArray(fioraneseData.items) ? fioraneseData.items : [];
        const caesarItems = Array.isArray(caesarData.items) ? caesarData.items : [];
        const delconcaItems = Array.isArray(delconcaData.items) ? delconcaData.items : [];
        const demaioItems = Array.isArray(demaioData.items) ? demaioData.items : [];
        const tecnolamItems = Array.isArray(tecnolamData.items) ? tecnolamData.items : [];
        const florimItems = Array.isArray(florimData.items) ? florimData.items : [];
        const mirageItems = Array.isArray(mirageData.items) ? mirageData.items : [];
        const fapItems = Array.isArray(fapData.items) ? fapData.items : [];
        const bardelliItems = Array.isArray(bardelliData.items) ? bardelliData.items : [];
        const serenissimaItems = Array.isArray(serenissimaData.items) ? serenissimaData.items : [];
        const tmItems = (Array.isArray(tmData.items) ? tmData.items : []).map((it) => ({
          ...it,
          brand: 'tecnomat',
          brandLabel: 'Tecnomat',
        }));
        const baucerItems = Array.isArray(baucerData.items) ? baucerData.items : [];
        const armonieItems = Array.isArray(armonieData.items) ? armonieData.items : [];
        const avivoVanities = Array.isArray(avivoData.items) ? avivoData.items : [];
        const deghiVanities = Array.isArray(deghiData.items) ? deghiData.items : [];
        const allVanities = [...deghiVanities, ...avivoVanities];

        vanityManager.registerCatalogItems(allVanities);
        window.__IPERCERAMICA_AVIVO_VANITIES__ = avivoVanities;
        window.__DEGHI_VANITIES__ = deghiVanities;
        window.__ALL_VANITY_CATALOGS__ = {
          total: allVanities.length,
          deghi: deghiVanities.length,
          iperceramica: avivoVanities.length,
          items: allVanities,
        };

        const vanityMount = document.getElementById('vanity-catalog-mount');
        if (vanityMount) {
          vanityCatalogSelector = new VanityCatalogSelector({
            mountEl: vanityMount,
            catalogItems: allVanities,
            presetModels: VANITY_MODELS,
            initialModelId: getCurrentRoomState().vanityModelId || VANITY_MODELS[0].id,
            onSelectModel: (modelId) => {
              const cfg = getCurrentRoomState();
              if (!isRestoringRoom && cfg.vanityModelId !== modelId) {
                recordUndoSnapshot('Modello mobile bagno');
              }
              cfg.vanityModelId = modelId;
              vanityManager.setModel(modelId);
              syncVanityPoseToRoom();
              saveAppState('Mobile bagno aggiornato');
            },
          });
        }

        const items = [
          ...atlasItems,
          ...fioraneseItems,
          ...caesarItems,
          ...delconcaItems,
          ...demaioItems,
          ...tecnolamItems,
          ...florimItems,
          ...mirageItems,
          ...fapItems,
          ...bardelliItems,
          ...serenissimaItems,
          ...tmItems,
          ...baucerItems,
          ...armonieItems,
        ];
        window.__TECNOMAT_CATALOG__ = tmItems;
        window.__ALL_CATALOGS__ = {
          total: items.length,
          atlas: atlasItems.length,
          fioranese: fioraneseItems.length,
          caesar: caesarItems.length,
          delconca: delconcaItems.length,
          demaio: demaioItems.length,
          tecnolam: tecnolamItems.length,
          florim: florimItems.length,
          mirage: mirageItems.length,
          fap: fapItems.length,
          bardelli: bardelliItems.length,
          serenissima: serenissimaItems.length,
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
          const cfg = getCurrentRoomState();
          if (!isRestoringRoom && JSON.stringify(cfg.floor) !== JSON.stringify(spec)) {
            recordUndoSnapshot('Piastrella pavimento');
          }
          cfg.floor = spec;
          saveAppState('Pavimento aggiornato');
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
              recordUndoSnapshot('Rivestimento pareti');
              cfg.perWallSpecs = {};
              room.clearAllSingleWallMaterials();
              syncCustomWallsListUI();
            }
          }
          room.applyWallBundle(bundle);
        },
        onSelectionChange: (spec) => {
          const cfg = getCurrentRoomState();
          if (!isRestoringRoom && JSON.stringify(cfg.wall) !== JSON.stringify(spec)) {
            recordUndoSnapshot(
              room.wallSplitEnabled ? 'Rivestimento sotto 120 cm' : 'Rivestimento pareti'
            );
          }
          cfg.wall = spec;
          saveAppState(
            room.wallSplitEnabled
              ? 'Rivestimento sotto 120 cm aggiornato'
              : 'Rivestimento pareti aggiornato'
          );
        },
      });

      wallUpperSelector = new CatalogSelector({
        mountEl: document.getElementById('wall-upper-catalog-mount'),
        catalogItems: items,
        presets: WALL_PRESETS,
        textureLib,
        initialPreset: WALL_PRESETS[1],
        onApplyBundle: (bundle) => {
          room.applyUpperWallBundle(bundle);
        },
        onSelectionChange: (spec) => {
          const cfg = getCurrentRoomState();
          if (!isRestoringRoom && JSON.stringify(cfg.wallUpper) !== JSON.stringify(spec)) {
            recordUndoSnapshot('Rivestimento sopra 120 cm');
          }
          cfg.wallUpper = spec;
          saveAppState('Rivestimento sopra 120 cm aggiornato');
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
            recordUndoSnapshot('Rivestimento pareti');
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
          const cfg = getCurrentRoomState();
          if (!isRestoringRoom && JSON.stringify(cfg.vanityWall) !== JSON.stringify(spec)) {
            recordUndoSnapshot('Piastrella fascia mobile');
          }
          cfg.vanityWall = spec;
          cfg.vanityWallEnabled = room.vanityWallEnabled;
          saveAppState('Fascia mobile aggiornata');
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

function minimapClientToWorld(clientX, clientY) {
  const rect = minimapCanvas.getBoundingClientRect();
  const px = (clientX - rect.left) * (minimapCanvas.width / rect.width);
  const py = (clientY - rect.top) * (minimapCanvas.height / rect.height);
  return {
    wx: (px - MAP_OX) / MAP_SCALE,
    wz: (py - MAP_OY) / MAP_SCALE,
  };
}

function hitTestMinimapFixture(wx, wz) {
  const pad = 0.08;
  for (const kind of ['wc', 'bidet']) {
    const sp = room.getSanitaryPoseAndAABB(kind);
    if (
      sp &&
      wx >= sp.minX - pad &&
      wx <= sp.maxX + pad &&
      wz >= sp.minZ - pad &&
      wz <= sp.maxZ + pad
    ) {
      return kind;
    }
  }
  const vp = room.getVanityPoseAndAABB();
  if (
    vp &&
    wx >= vp.minX - pad &&
    wx <= vp.maxX + pad &&
    wz >= vp.minZ - pad &&
    wz <= vp.maxZ + pad
  ) {
    return 'vanity';
  }
  const sb = room.getShowerAABB();
  if (
    sb &&
    wx >= sb.minX - pad &&
    wx <= sb.maxX + pad &&
    wz >= sb.minZ - pad &&
    wz <= sb.maxZ + pad
  ) {
    return 'shower';
  }
  return null;
}

let minimapDraggingFixture = null;

minimapCanvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const { wx, wz } = minimapClientToWorld(e.clientX, e.clientY);
  if (moveFixturesMode) {
    const hitF = hitTestMinimapFixture(wx, wz);
    if (hitF) {
      e.preventDefault();
      minimapCanvas.setPointerCapture(e.pointerId);
      selectedFixture = hitF;
      minimapDraggingFixture = hitF;
      const lbl = FIXTURE_LABELS[hitF]?.() || 'Arredo';
      preDragSnapshot = captureCurrentSnapshot(`Spostamento ${lbl}`);
      room.setSelectedFixtureHighlight(hitF);
      return;
    }
  }
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

minimapCanvas.addEventListener('pointermove', (e) => {
  const { wx, wz } = minimapClientToWorld(e.clientX, e.clientY);
  if (minimapDraggingFixture && moveFixturesMode) {
    applyFixtureDragAtWorldCoords(minimapDraggingFixture, wx, wz);
    return;
  }
  if (moveFixturesMode) {
    const hitF = hitTestMinimapFixture(wx, wz);
    minimapCanvas.style.cursor = hitF ? 'move' : 'pointer';
  } else {
    minimapCanvas.style.cursor = 'pointer';
  }
});

minimapCanvas.addEventListener('pointerup', () => {
  if (minimapDraggingFixture) {
    const movedType = minimapDraggingFixture;
    minimapDraggingFixture = null;
    finalizeFixtureDrag(movedType);
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

  // Dynamic Bidet + Scaldasalviette and WC (follow user wall-anchored positions!)
  for (const [kind, label] of [
    ['bidet', 'B'],
    ['wc', 'WC'],
  ]) {
    const sp = room.getSanitaryPoseAndAABB(kind);
    if (!sp) continue;
    const [bx, by] = toMap(sp.minX + 0.03, sp.minZ + 0.02);
    const bw = Math.max(0.28, sp.maxX - sp.minX - 0.06) * MAP_SCALE;
    const bh = Math.max(0.28, sp.maxZ - sp.minZ - 0.04) * MAP_SCALE;
    mCtx.fillStyle = '#eef2f5';
    mCtx.strokeStyle = '#666';
    mCtx.lineWidth = 1;
    mCtx.fillRect(bx, by, bw, bh);
    mCtx.strokeRect(bx, by, bw, bh);
    mCtx.fillStyle = '#555';
    mCtx.font = 'bold 7px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.fillText(label, bx + bw * 0.5, by + bh * 0.62);

    if (kind === 'bidet' && sp.wall) {
      const w = sp.wall;
      const [rx0, ry0] = toMap(
        w.p1.x + w.ux * (sp.s - 0.21) + w.nx * 0.05,
        w.p1.z + w.uz * (sp.s - 0.21) + w.nz * 0.05
      );
      const [rx1, ry1] = toMap(
        w.p1.x + w.ux * (sp.s + 0.21) + w.nx * 0.05,
        w.p1.z + w.uz * (sp.s + 0.21) + w.nz * 0.05
      );
      mCtx.strokeStyle = '#b45309';
      mCtx.lineWidth = 3;
      mCtx.beginPath();
      mCtx.moveTo(rx0, ry0);
      mCtx.lineTo(rx1, ry1);
      mCtx.stroke();
    }
  }

  // Dynamic Shower Box 80x80 or 70x120 (follows user wall-anchored position!)
  const shBox = room.getShowerAABB();
  if (shBox) {
    const [sx, sy] = toMap(shBox.minX, shBox.minZ);
    const sw = shBox.wX * MAP_SCALE;
    const sh = shBox.dZ * MAP_SCALE;
    mCtx.fillStyle = 'rgba(56, 189, 248, 0.24)';
    mCtx.strokeStyle = '#0284c7';
    mCtx.lineWidth = 1.6;
    mCtx.fillRect(sx, sy, sw, sh);
    mCtx.strokeRect(sx, sy, sw, sh);
    mCtx.fillStyle = '#0369a1';
    mCtx.font = 'bold 7px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.fillText(shBox.label || '80×80', sx + sw * 0.5, sy + sh * 0.55);
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
    // East Window 115x100 (z = 0.18..1.33)
    const [wx0, wy0] = toMap(1.88, 0.18);
    const [, wy1] = toMap(1.88, 1.33);
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
    // East Window 115x100 (z = 0.25..1.40)
    const [wx0, wy0] = toMap(1.88, 0.25);
    const [, wy1] = toMap(1.88, 1.4);
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
  undoStack,
  performUndo,
  recordUndoSnapshot,
  saveAppState,
  navState,
  applyCameraPreset,
  applyRoomConfigToSceneAndUI,
  downloadActiveViewPhoto,
  room,
  vanityManager,
};

requestAnimationFrame(animate);
