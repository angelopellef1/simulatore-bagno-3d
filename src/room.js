import * as THREE from 'three';

export const ROOM_HEIGHT = 2.7;

// Room specifications for both floorplans:
// 1. Bagno Pianterreno (mq. 4,68 = 1.90*0.80 + 1.76*1.10 + 1.36*0.90, r.a.i. 0,214)
// 2. Bagno Primo Piano (mq. 5,55 = 1.90*2.92, r.a.i. 0,180)
export const ROOM_POLYGON_GROUND = [
  { x: 0.0, z: 0.0 },
  { x: 1.9, z: 0.0 },
  { x: 1.9, z: 2.8 },
  { x: 0.54, z: 2.8 },
  { x: 0.54, z: 1.9 },
  { x: 0.14, z: 1.9 },
  { x: 0.14, z: 0.8 },
  { x: 0.0, z: 0.8 },
];

export const ROOM_POLYGON_FIRST = [
  { x: 0.0, z: 0.0 },
  { x: 1.9, z: 0.0 },
  { x: 1.9, z: 2.92 },
  { x: 0.0, z: 2.92 },
];

export const ROOM_POLYGON = ROOM_POLYGON_GROUND;

function buildQuadGeometry(p1, p2, s0, s1, y0, y1, uBase = 0, flipNormal = false) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;

  const xA = p1.x + ux * s0;
  const zA = p1.z + uz * s0;
  const xB = p1.x + ux * s1;
  const zB = p1.z + uz * s1;

  const nx = flipNormal ? dz / len : -dz / len;
  const nz = flipNormal ? -dx / len : dx / len;

  const positions = new Float32Array([
    xA, y0, zA,
    xB, y0, zB,
    xB, y1, zB,
    xA, y1, zA,
  ]);

  const normals = new Float32Array([
    nx, 0, nz,
    nx, 0, nz,
    nx, 0, nz,
    nx, 0, nz,
  ]);

  const uvs = new Float32Array([
    uBase + s0, y0,
    uBase + s1, y0,
    uBase + s1, y1,
    uBase + s0, y1,
  ]);

  const indices = flipNormal ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

export class BathroomRoom {
  constructor(scene, textureLib) {
    this.scene = scene;
    this.textureLib = textureLib;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.gridUniform = { value: 0 };
    this.wallSplitEnabled = false;
    this.wallSplitHeight = 1.2;

    this.floorMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.04,
    });

    this.wallTileMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.04,
    });

    // Rivestimento superiore (sopra 120 cm) quando la divisione 120 è attiva
    this.wallUpperMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.04,
    });

    this.vanityWallMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.04,
    });

    this.wallPaintMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.85,
      metalness: 0.0,
    });

    for (const m of [
      this.floorMaterial,
      this.wallTileMaterial,
      this.wallUpperMaterial,
      this.vanityWallMaterial,
      this.wallPaintMaterial,
    ]) {
      this.applyGridShader(m);
    }

    this.outerShellMaterial = new THREE.MeshStandardMaterial({
      color: 0xdad5cc,
      roughness: 0.88,
      metalness: 0.0,
    });

    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0xfaf9f6,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.metalMaterial = new THREE.MeshStandardMaterial({
      color: 0xdadfe4,
      roughness: 0.16,
      metalness: 0.92,
    });

    this.ceramicMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xfbfbfb,
      roughness: 0.1,
      metalness: 0.02,
      clearcoat: 0.7,
      clearcoatRoughness: 0.08,
    });

    this.wallGroups = [];
    this.dynamicWallsContainer = new THREE.Group();
    this.root.add(this.dynamicWallsContainer);

    this.roomShellContainer = new THREE.Group();
    this.root.add(this.roomShellContainer);

    this.showerContainer = new THREE.Group();
    this.root.add(this.showerContainer);

    this.hoverHighlightMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.hoverHighlightMesh.visible = false;
    this.root.add(this.hoverHighlightMesh);

    this.fixtureOutlineMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.5, 4),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.fixtureOutlineMesh.visible = false;
    this.root.add(this.fixtureOutlineMesh);

    this.perWallMaterials = new Map(); // wallId -> THREE.MeshStandardMaterial
    this.hoveredWallId = null;

    this.roomType = 'ground'; // 'ground' | 'first'
    this.tileHeightMode = 'door'; // 'full' | 'door' | 'half'
    this.showerTileHeightMode = 'fixed-210'; // 'fixed-210' | 'fixed-270' | 'follow'
    this.vanityWallEnabled = false;
    this.vanityWallHeightMode = 'same'; // 'same' | 'full'
    this.vanityZoneSpan = 'window-to-wall';
    this.cutawayMode = false;
    this.doorOpen = false;
    this.doorCurrentAngle = 0.06;
    this.doorTargetAngle = 0.06;
    this.showerGroup = null;
    this.bidetGroup = null;
    this.wcGroup = null;

    this.showerEnabled = false;
    this.showerSize = '80x80'; // '80x80' | '120x70' | '70x120'
    this.showerTrayMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f3ef,
      roughness: 0.36,
      metalness: 0.02,
    });
    this.showerPlacement = { wallId: 'east', s: 2.52 };
    this.vanityPlacement = { wallId: 'east', s: 2.0 };
    this.vanityTargetSpan = 1.0;
    this.bidetPlacement = { wallId: 'north', s: 0.56 };
    this.wcPlacement = { wallId: 'north', s: 1.18 };

    this.buildSanitaryAndRadiator();
    this.buildRoomLights();
    this.rebuildRoomArchitecture();
  }

  applyGridShader(mat) {
    const uniform = this.gridUniform;
    mat.customProgramCacheKey = () => 'room-grid-v1';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGrid = uniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGridWP;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvGridWP = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vGridWP;
uniform float uGrid;
float gridLine(float v, float step, float w) {
  float d = abs(fract(v / step + 0.5) - 0.5) * step;
  return 1.0 - smoothstep(w, w * 1.8, d);
}`
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
if (uGrid > 0.5) {
  vec3 gn = abs(normalize(cross(dFdx(vGridWP), dFdy(vGridWP))));
  vec2 g2 = gn.y > 0.7 ? vGridWP.xz : (gn.x > gn.z ? vGridWP.zy : vGridWP.xy);
  float dist = length(cameraPosition - vGridWP);
  float lw = 0.0014 + dist * 0.0007;
  float minor = max(gridLine(g2.x, 0.1, lw), gridLine(g2.y, 0.1, lw));
  float major = max(gridLine(g2.x, 0.5, lw * 1.9), gridLine(g2.y, 0.5, lw * 1.9));
  vec3 minorCol = vec3(0.05, 0.55, 0.95);
  vec3 majorCol = vec3(0.95, 0.25, 0.2);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, minorCol, minor * 0.55);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, majorCol, major * 0.85);
}`
        );
    };
    mat.needsUpdate = true;
  }

  setGridEnabled(enabled) {
    this.gridUniform.value = enabled ? 1 : 0;
  }

  getDefaultFixturesForRoom(type = this.roomType) {
    if (type === 'first') {
      return {
        showerEnabled: true,
        showerSize: '80x80',
        showerPlacement: { wallId: 'east', s: 2.52 },
        vanityPlacement: { wallId: 'south', s: 1.35 },
        bidetPlacement: { wallId: 'north', s: 0.56 },
        wcPlacement: { wallId: 'north', s: 1.18 },
      };
    }
    return {
      showerEnabled: false,
      showerSize: '80x80',
      showerPlacement: { wallId: 'south', s: 0.4 },
      vanityPlacement: { wallId: 'east', s: 2.0 },
      bidetPlacement: { wallId: 'north', s: 0.56 },
      wcPlacement: { wallId: 'north', s: 1.18 },
    };
  }

  getActivePolygon() {
    return this.roomType === 'first' ? ROOM_POLYGON_FIRST : ROOM_POLYGON_GROUND;
  }

  isPointInsideRoom(x, z, eps = 0.015) {
    if (this.roomType === 'first') {
      return x >= -eps && x <= 1.9 + eps && z >= -eps && z <= 2.92 + eps;
    }
    if (x > 1.9 + eps || z < -eps || z > 2.8 + eps) return false;
    if (z <= 0.8 + eps) return x >= -eps;
    if (z <= 1.9 + eps) return x >= 0.14 - eps;
    return x >= 0.54 - eps;
  }

  isBoxInsideRoom(box, eps = 0.02) {
    return (
      this.isPointInsideRoom(box.minX, box.minZ, eps) &&
      this.isPointInsideRoom(box.maxX, box.minZ, eps) &&
      this.isPointInsideRoom(box.maxX, box.maxZ, eps) &&
      this.isPointInsideRoom(box.minX, box.maxZ, eps) &&
      this.isPointInsideRoom((box.minX + box.maxX) * 0.5, (box.minZ + box.maxZ) * 0.5, eps)
    );
  }

  setRoomType(type) {
    if (type !== 'ground' && type !== 'first') return;
    const changed = this.roomType !== type;
    this.roomType = type;
    if (changed) {
      this.doorOpen = false;
      this.doorCurrentAngle = type === 'first' ? -0.06 : 0.06;
      this.doorTargetAngle = this.doorCurrentAngle;
      const defs = this.getDefaultFixturesForRoom(type);
      this.showerEnabled = defs.showerEnabled;
      this.showerSize = defs.showerSize || '80x80';
      this.showerPlacement = { ...defs.showerPlacement };
      this.vanityPlacement = { ...defs.vanityPlacement };
      this.bidetPlacement = { ...defs.bidetPlacement };
      this.wcPlacement = { ...defs.wcPlacement };
      this.updateSanitaryPoses();
      this.rebuildRoomArchitecture();
    }
  }

  rebuildRoomArchitecture() {
    while (this.roomShellContainer.children.length > 0) {
      const child = this.roomShellContainer.children[0];
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      this.roomShellContainer.remove(child);
    }

    this.buildFloorAndCeiling();
    this.rebuildWalls();
    this.buildWindowAndExterior();
    this.buildDoor();
    this.rebuildShower();
    this.setCutawayMode(this.cutawayMode);
    this.setLightingMode(this.lightingMode || 'day');
  }

  rebuildShower() {
    while (this.showerContainer.children.length > 0) {
      const child = this.showerContainer.children[0];
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      this.showerContainer.remove(child);
    }
    this.showerGroup = null;
    if (this.showerEnabled) {
      this.buildCornerShower80x80();
    }
  }

  buildFloorAndCeiling() {
    const poly = this.getActivePolygon();
    const shape = new THREE.Shape();
    shape.moveTo(poly[0].x, -poly[0].z);
    for (let i = poly.length - 1; i >= 1; i--) {
      shape.lineTo(poly[i].x, -poly[i].z);
    }
    shape.closePath();

    const floorGeo = new THREE.ShapeGeometry(shape);
    this.floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.receiveShadow = true;
    this.roomShellContainer.add(this.floorMesh);

    const slabShape = new THREE.Shape();
    const out =
      this.roomType === 'first'
        ? [
            { x: -0.18, z: -0.18 },
            { x: 2.08, z: -0.18 },
            { x: 2.08, z: 3.1 },
            { x: -0.18, z: 3.1 },
          ]
        : [
            { x: -0.18, z: -0.18 },
            { x: 2.08, z: -0.18 },
            { x: 2.08, z: 2.98 },
            { x: 0.36, z: 2.98 },
            { x: 0.36, z: 2.08 },
            { x: -0.04, z: 2.08 },
            { x: -0.04, z: 0.98 },
            { x: -0.18, z: 0.98 },
          ];
    slabShape.moveTo(out[0].x, -out[0].z);
    for (let i = out.length - 1; i >= 1; i--) {
      slabShape.lineTo(out[i].x, -out[i].z);
    }
    slabShape.closePath();
    const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
      depth: 0.08,
      bevelEnabled: false,
    });
    const slabMesh = new THREE.Mesh(
      slabGeo,
      new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 0.9 })
    );
    slabMesh.rotation.x = -Math.PI / 2;
    slabMesh.position.y = -0.082;
    this.roomShellContainer.add(slabMesh);

    const ceilShape = new THREE.Shape();
    ceilShape.moveTo(poly[0].x, poly[0].z);
    for (let i = 1; i < poly.length; i++) {
      ceilShape.lineTo(poly[i].x, poly[i].z);
    }
    ceilShape.closePath();
    const ceilGeo = new THREE.ShapeGeometry(ceilShape);
    this.ceilingMesh = new THREE.Mesh(ceilGeo, this.ceilingMaterial);
    this.ceilingMesh.rotation.x = Math.PI / 2;
    this.ceilingMesh.position.y = ROOM_HEIGHT;
    this.roomShellContainer.add(this.ceilingMesh);
  }

  getBaseWallSegments() {
    const raw =
      this.roomType === 'first'
        ? [
            {
              id: 'north',
              label: 'Parete Nord (Sanitari)',
              p1: { x: 0.0, z: 0.0 },
              p2: { x: 1.9, z: 0.0 },
              openings: [],
            },
            {
              id: 'east',
              label: 'Parete Est (Finestra)',
              p1: { x: 1.9, z: 0.0 },
              p2: { x: 1.9, z: 2.92 },
              openings: [{ s0: 0.18, s1: 1.33, y0: 0.8, y1: 1.8, kind: 'window' }],
            },
            {
              id: 'south',
              label: 'Parete Sud (Fondo)',
              p1: { x: 1.9, z: 2.92 },
              p2: { x: 0.0, z: 2.92 },
              openings: [],
            },
            {
              id: 'west-door',
              label: 'Parete Ovest (Porta)',
              p1: { x: 0.0, z: 2.92 },
              p2: { x: 0.0, z: 0.0 },
              openings: [{ s0: 1.52, s1: 2.32, y0: 0.0, y1: 2.1, kind: 'door' }],
            },
          ]
        : [
            {
              id: 'north',
              label: 'Parete Nord (Sanitari)',
              p1: { x: 0.0, z: 0.0 },
              p2: { x: 1.9, z: 0.0 },
              openings: [],
            },
            {
              id: 'east',
              label: 'Parete Est (Finestra)',
              p1: { x: 1.9, z: 0.0 },
              p2: { x: 1.9, z: 2.8 },
              openings: [{ s0: 0.25, s1: 1.4, y0: 0.8, y1: 1.8, kind: 'window' }],
            },
            {
              id: 'south',
              label: 'Parete Sud (136 cm)',
              p1: { x: 1.9, z: 2.8 },
              p2: { x: 0.54, z: 2.8 },
              openings: [],
            },
            {
              id: 'west-bottom',
              label: 'Parete Ovest Sud (90 cm)',
              p1: { x: 0.54, z: 2.8 },
              p2: { x: 0.54, z: 1.9 },
              openings: [],
            },
            {
              id: 'step-40',
              label: 'Spalla Ovest (40 cm)',
              p1: { x: 0.54, z: 1.9 },
              p2: { x: 0.14, z: 1.9 },
              openings: [],
            },
            {
              id: 'west-door',
              label: 'Parete Ovest (Porta)',
              p1: { x: 0.14, z: 1.9 },
              p2: { x: 0.14, z: 0.8 },
              openings: [{ s0: 0.18, s1: 0.98, y0: 0.0, y1: 2.1, kind: 'door' }],
            },
            {
              id: 'step-14',
              label: 'Spalla Ovest (14 cm)',
              p1: { x: 0.14, z: 0.8 },
              p2: { x: 0.0, z: 0.8 },
              openings: [],
            },
            {
              id: 'west-top',
              label: 'Parete Ovest Nord (80 cm)',
              p1: { x: 0.0, z: 0.8 },
              p2: { x: 0.0, z: 0.0 },
              openings: [],
            },
          ];

    return raw.map((seg) => {
      const dx = seg.p2.x - seg.p1.x;
      const dz = seg.p2.z - seg.p1.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const nx = -dz / len;
      const nz = dx / len;
      return { ...seg, dx, dz, len, ux, uz, nx, nz };
    });
  }

  getShowerDimensions(size = this.showerSize) {
    if (size === '120x70') {
      return { along: 1.2, depth: 0.7, label: '70×120' };
    }
    if (size === '70x120') {
      return { along: 0.7, depth: 1.2, label: '70×120' };
    }
    return { along: 0.8, depth: 0.8, label: '80×80' };
  }

  getShowerAABB(placement = this.showerPlacement, forceEnable = false, sizeOverride = this.showerSize) {
    if (!this.showerEnabled && !forceEnable) return null;
    if (!placement) return null;
    const segs = this.getBaseWallSegments();
    const w = segs.find((s) => s.id === placement.wallId) || segs[1];
    const { along, depth, label } = this.getShowerDimensions(sizeOverride);
    const halfAlong = along * 0.5;
    const sClamped =
      w.len >= along
        ? Math.max(halfAlong, Math.min(w.len - halfAlong, placement.s))
        : w.len * 0.5;

    const c1x = w.p1.x + w.ux * (sClamped - halfAlong);
    const c1z = w.p1.z + w.uz * (sClamped - halfAlong);
    const c2x = w.p1.x + w.ux * (sClamped + halfAlong) + w.nx * depth;
    const c2z = w.p1.z + w.uz * (sClamped + halfAlong) + w.nz * depth;
    const minX = Math.min(c1x, c2x);
    const maxX = Math.max(c1x, c2x);
    const minZ = Math.min(c1z, c2z);
    const maxZ = Math.max(c1z, c2z);
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    return {
      minX,
      maxX,
      minZ,
      maxZ,
      wX: maxX - minX,
      dZ: maxZ - minZ,
      along,
      depth,
      label,
      cx,
      cz,
      wallId: w.id,
      s: sClamped,
      wall: w,
    };
  }

  getSanitaryPoseAndAABB(kind, placementOverride = null) {
    const isBidet = kind === 'bidet';
    const placement = placementOverride || (isBidet ? this.bidetPlacement : this.wcPlacement);
    const segs = this.getBaseWallSegments();
    const w = segs.find((s) => s.id === placement?.wallId) || segs[0];
    const halfW = 0.2; // 40 cm lateral width footprint
    const depth = 0.5; // 50 cm projection from wall
    const sClamped =
      w.len >= halfW * 2
        ? Math.max(halfW, Math.min(w.len - halfW, placement?.s ?? w.len * 0.5))
        : w.len * 0.5;

    const x = w.p1.x + w.ux * sClamped;
    const z = w.p1.z + w.uz * sClamped;
    // Local sanitary group was authored at z=0 facing +Z (inward normal (0, 1))
    const rotY = Math.atan2(w.nx, w.nz);

    const c1x = w.p1.x + w.ux * (sClamped - halfW);
    const c1z = w.p1.z + w.uz * (sClamped - halfW);
    const c2x = w.p1.x + w.ux * (sClamped + halfW) + w.nx * depth;
    const c2z = w.p1.z + w.uz * (sClamped + halfW) + w.nz * depth;
    const minX = Math.min(c1x, c2x);
    const maxX = Math.max(c1x, c2x);
    const minZ = Math.min(c1z, c2z);
    const maxZ = Math.max(c1z, c2z);

    return {
      kind,
      x,
      z,
      rotY,
      cx: (minX + maxX) * 0.5,
      cz: (minZ + maxZ) * 0.5,
      minX,
      maxX,
      minZ,
      maxZ,
      s0: sClamped - halfW,
      s1: sClamped + halfW,
      wallId: w.id,
      wallLabel: w.label,
      s: sClamped,
      wall: w,
    };
  }

  getShowerIntervalOnWall(wall, shBox) {
    if (!shBox) return null;
    // Distance from wall line to shower box near face along inward normal
    // Check if any face of shBox lies flush against `wall`
    const pts = [
      { x: shBox.minX, z: shBox.minZ },
      { x: shBox.maxX, z: shBox.minZ },
      { x: shBox.maxX, z: shBox.maxZ },
      { x: shBox.minX, z: shBox.maxZ },
    ];
    let minDist = Infinity;
    let sMin = Infinity;
    let sMax = -Infinity;
    for (const p of pts) {
      const rx = p.x - wall.p1.x;
      const rz = p.z - wall.p1.z;
      const dist = rx * wall.nx + rz * wall.nz;
      if (Math.abs(dist) < 0.03) {
        const s = rx * wall.ux + rz * wall.uz;
        minDist = Math.min(minDist, Math.abs(dist));
        sMin = Math.min(sMin, s);
        sMax = Math.max(sMax, s);
      }
    }
    if (minDist > 0.03 || sMax <= sMin + 0.05) return null;
    const a = Math.max(0, sMin);
    const b = Math.min(wall.len, sMax);
    return b > a + 0.05 ? [a, b] : null;
  }

  getShowerTouchingWalls() {
    if (!this.showerEnabled) return [];
    const shBox = this.getShowerAABB();
    if (!shBox) return [];
    const out = [];
    for (const seg of this.getBaseWallSegments()) {
      const range = this.getShowerIntervalOnWall(seg, shBox);
      if (range && range[1] - range[0] > 0.05) {
        out.push({
          wallId: seg.id,
          showerWallKey: `shower:${seg.id}`,
          label: `Doccia · ${seg.label}`,
          shortLabel: seg.label,
          s0: range[0],
          s1: range[1],
          widthCm: Math.round((range[1] - range[0]) * 100),
        });
      }
    }
    return out;
  }

  getFreeSpanAroundOnWall(wall, sCenter, shBox) {
    let left = 0;
    let right = wall.len;
    for (const op of wall.openings) {
      if (op.s1 <= sCenter + 0.01) left = Math.max(left, op.s1);
      if (op.s0 >= sCenter - 0.01) right = Math.min(right, op.s0);
    }
    for (const kind of ['bidet', 'wc']) {
      const sp = this.getSanitaryPoseAndAABB(kind);
      if (sp.wallId === wall.id) {
        if (sp.s1 <= sCenter + 0.01) left = Math.max(left, sp.s1);
        if (sp.s0 >= sCenter - 0.01) right = Math.min(right, sp.s0);
      }
    }
    const shInt = this.getShowerIntervalOnWall(wall, shBox);
    if (shInt) {
      if (shInt[1] <= sCenter + 0.01) left = Math.max(left, shInt[1]);
      if (shInt[0] >= sCenter - 0.01) right = Math.min(right, shInt[0]);
    }
    return [left, right];
  }

  setVanityTargetSpan(spanM) {
    const next = Math.max(0.58, Math.min(1.4, Number(spanM) || 1.0));
    if (Math.abs(next - this.vanityTargetSpan) > 0.005) {
      this.vanityTargetSpan = next;
    }
  }

  getVanityPoseAndAABB(placement = this.vanityPlacement, shBox = this.getShowerAABB()) {
    const segs = this.getBaseWallSegments();
    const w = segs.find((s) => s.id === placement?.wallId) || segs[1];
    const targetSpan = this.vanityTargetSpan || 1.0;
    const halfBound = Math.max(0.32, Math.min(0.45, targetSpan * 0.48));
    const s = Math.max(halfBound, Math.min(w.len - halfBound, placement?.s ?? w.len * 0.5));
    const [spanL, spanR] = this.getFreeSpanAroundOnWall(w, s, shBox);
    const availWidth = Math.max(0.6, Math.min(1.6, spanR - spanL));
    const effSpan = Math.min(targetSpan, availWidth - 0.02);
    const depth = 0.48;

    const x = w.p1.x + w.ux * s + w.nx * 0.005;
    const z = w.p1.z + w.uz * s + w.nz * 0.005;
    const rotY = Math.atan2(w.nx, w.nz);

    const c1x = w.p1.x + w.ux * (s - effSpan * 0.5);
    const c1z = w.p1.z + w.uz * (s - effSpan * 0.5);
    const c2x = w.p1.x + w.ux * (s + effSpan * 0.5) + w.nx * depth;
    const c2z = w.p1.z + w.uz * (s + effSpan * 0.5) + w.nz * depth;

    return {
      x,
      z,
      rotY,
      availWidth,
      effSpan,
      depth,
      wallId: w.id,
      wallLabel: w.label,
      s,
      spanL,
      spanR,
      wall: w,
      minX: Math.min(c1x, c2x),
      maxX: Math.max(c1x, c2x),
      minZ: Math.min(c1z, c2z),
      maxZ: Math.max(c1z, c2z),
    };
  }

  getWallDefinitions() {
    const segs = this.getBaseWallSegments();
    const shBox = this.getShowerAABB();
    const vanInfo = this.getVanityPoseAndAABB(this.vanityPlacement, shBox);

    return segs.map((seg) => {
      // 1. Build base patches from openings (door / window)
      const basePatches = [];
      let cursor = 0;
      const sortedOps = [...seg.openings].sort((a, b) => a.s0 - b.s0);
      for (const op of sortedOps) {
        if (op.s0 > cursor + 0.005) {
          basePatches.push({ s0: cursor, s1: op.s0, y0: 0, y1: ROOM_HEIGHT });
        }
        if (op.y0 > 0.005) {
          basePatches.push({ s0: op.s0, s1: op.s1, y0: 0, y1: op.y0 });
        }
        if (op.y1 < ROOM_HEIGHT - 0.005) {
          basePatches.push({ s0: op.s0, s1: op.s1, y0: op.y1, y1: ROOM_HEIGHT });
        }
        cursor = op.s1;
      }
      if (cursor < seg.len - 0.005) {
        basePatches.push({ s0: cursor, s1: seg.len, y0: 0, y1: ROOM_HEIGHT });
      }

      // 2. Determine shower interval & vanity accent interval on this wall
      const shRange = this.getShowerIntervalOnWall(seg, shBox);
      let vanRange = null;
      if (this.vanityWallEnabled && vanInfo.wallId === seg.id) {
        if (this.vanityZoneSpan === 'centered') {
          const half = Math.min(0.65, (vanInfo.spanR - vanInfo.spanL) * 0.47);
          const v0 = Math.max(vanInfo.spanL, vanInfo.s - half);
          const v1 = Math.min(vanInfo.spanR, vanInfo.s + half);
          if (v1 > v0 + 0.1) vanRange = [v0, v1];
        } else {
          if (vanInfo.spanR > vanInfo.spanL + 0.1) {
            vanRange = [vanInfo.spanL, vanInfo.spanR];
          }
        }
      }

      // 3. Split full-height patches cleanly at showerRange / vanRange boundaries
      const finalPatches = [];
      for (const bp of basePatches) {
        const isOpeningBand = bp.y0 > 0.01 || bp.y1 < ROOM_HEIGHT - 0.01;
        if (isOpeningBand) {
          finalPatches.push(bp);
          continue;
        }
        const cuts = new Set([bp.s0, bp.s1]);
        if (shRange) {
          if (shRange[0] > bp.s0 + 0.005 && shRange[0] < bp.s1 - 0.005) cuts.add(shRange[0]);
          if (shRange[1] > bp.s0 + 0.005 && shRange[1] < bp.s1 - 0.005) cuts.add(shRange[1]);
        }
        if (vanRange) {
          if (vanRange[0] > bp.s0 + 0.005 && vanRange[0] < bp.s1 - 0.005) cuts.add(vanRange[0]);
          if (vanRange[1] > bp.s0 + 0.005 && vanRange[1] < bp.s1 - 0.005) cuts.add(vanRange[1]);
        }
        const pts = [...cuts].sort((a, b) => a - b);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (b - a < 0.005) continue;
          const mid = (a + b) * 0.5;
          const showerPatch = Boolean(shRange && mid >= shRange[0] && mid <= shRange[1]);
          const vanityZone = Boolean(!showerPatch && vanRange && mid >= vanRange[0] && mid <= vanRange[1]);
          finalPatches.push({
            s0: a,
            s1: b,
            y0: bp.y0,
            y1: bp.y1,
            showerPatch,
            vanityZone,
            showerTrimLeft: Boolean(showerPatch && shRange && Math.abs(a - shRange[0]) < 0.008 && a > 0.02),
            showerTrimRight: Boolean(showerPatch && shRange && Math.abs(b - shRange[1]) < 0.008 && b < seg.len - 0.02),
            trimLeft: vanityZone && Math.abs(a - vanRange[0]) < 0.008 && a > 0.02,
            trimRight: vanityZone && Math.abs(b - vanRange[1]) < 0.008 && b < seg.len - 0.02,
          });
        }
      }

      return {
        id: seg.id,
        label: seg.label,
        p1: seg.p1,
        p2: seg.p2,
        len: seg.len,
        nx: seg.nx,
        nz: seg.nz,
        ux: seg.ux,
        uz: seg.uz,
        patches: finalPatches,
      };
    });
  }

  rebuildWalls() {
    while (this.dynamicWallsContainer.children.length > 0) {
      const child = this.dynamicWallsContainer.children[0];
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      this.dynamicWallsContainer.remove(child);
    }
    this.wallGroups = [];

    const wallDefs = this.getWallDefinitions();
    let uRunning = 0;

    for (const def of wallDefs) {
      const group = new THREE.Group();
      const dx = def.p2.x - def.p1.x;
      const dz = def.p2.z - def.p1.z;
      const len = def.len;
      const nx = def.nx;
      const nz = def.nz;
      const midX = (def.p1.x + def.p2.x) * 0.5;
      const midZ = (def.p1.z + def.p2.z) * 0.5;

      const customWallMat = this.perWallMaterials.get(def.id) || null;

      for (const patch of def.patches) {
        const useVanityAccent = Boolean(patch.vanityZone && this.vanityWallEnabled);
        let tileTop = ROOM_HEIGHT;
        if (patch.showerPatch && this.showerTileHeightMode !== 'follow') {
          tileTop =
            this.showerTileHeightMode === 'fixed-270'
              ? ROOM_HEIGHT
              : this.showerTileHeightMode === 'fixed-240'
                ? 2.4
                : 2.1;
        } else if (useVanityAccent && this.vanityWallHeightMode === 'full') {
          tileTop = ROOM_HEIGHT;
        } else if (useVanityAccent && this.vanityWallHeightMode === 'h240') {
          tileTop = 2.4;
        } else if (this.tileHeightMode === 'h240') {
          tileTop = 2.4;
        } else if (this.tileHeightMode === 'door') {
          tileTop = 2.1;
        } else if (this.tileHeightMode === 'half') {
          tileTop = 1.2;
        } else if (this.tileHeightMode === 'none') {
          tileTop = 0;
        }

        const showerWallKey = `shower:${def.id}`;
        const customShowerMat = patch.showerPatch
          ? this.perWallMaterials.get(showerWallKey) || null
          : null;
        const patchWallId = patch.showerPatch ? showerWallKey : def.id;
        const patchWallLabel = patch.showerPatch ? `Doccia · ${def.label}` : def.label;

        const activeTileMat = patch.showerPatch
          ? customShowerMat || customWallMat || this.wallTileMaterial
          : useVanityAccent
            ? this.vanityWallMaterial
            : customWallMat || this.wallTileMaterial;

        // Lower tiled band (con eventuale divisione: rivestimento diverso sotto/sopra 120 cm)
        const t0 = patch.y0;
        const t1 = Math.min(patch.y1, tileTop);
        const splitY = this.wallSplitHeight;
        const doSplit =
          this.wallSplitEnabled &&
          activeTileMat === this.wallTileMaterial &&
          t0 < splitY - 0.001 &&
          t1 > splitY + 0.001;
        if (t1 > t0 + 0.001) {
          const bands = doSplit
            ? [
                [t0, splitY, this.wallTileMaterial],
                [splitY, t1, this.wallUpperMaterial],
              ]
            : this.wallSplitEnabled &&
                activeTileMat === this.wallTileMaterial &&
                t0 >= splitY - 0.001
              ? [[t0, t1, this.wallUpperMaterial]]
              : [[t0, t1, activeTileMat]];
          for (const [b0, b1, bMat] of bands) {
            const geo = buildQuadGeometry(def.p1, def.p2, patch.s0, patch.s1, b0, b1, uRunning, false);
            const mesh = new THREE.Mesh(geo, bMat);
            mesh.receiveShadow = true;
            mesh.userData = {
              isWall: true,
              wallId: patchWallId,
              baseWallId: def.id,
              isShowerWall: Boolean(patch.showerPatch),
              wallLabel: patchWallLabel,
            };
            group.add(mesh);
          }
          if (doSplit) {
            const segLen = patch.s1 - patch.s0;
            const sMid = (patch.s0 + patch.s1) * 0.5;
            const ux = dx / len;
            const uz = dz / len;
            const splitTrim = new THREE.Mesh(
              new THREE.BoxGeometry(segLen, 0.012, 0.012),
              this.metalMaterial
            );
            splitTrim.position.set(
              def.p1.x + ux * sMid + nx * 0.004,
              splitY,
              def.p1.z + uz * sMid + nz * 0.004
            );
            splitTrim.rotation.y = -Math.atan2(dz, dx);
            group.add(splitTrim);
          }
        }

        // Vertical jolly trim profile along vanity accent zone OR custom shower wall border(s)
        if ((useVanityAccent || customShowerMat) && t1 > t0 + 0.01) {
          const ux = dx / len;
          const uz = dz / len;
          const vTrimSides = [];
          if (useVanityAccent) {
            if (patch.trimLeft) vTrimSides.push(patch.s0);
            if (patch.trimRight) vTrimSides.push(patch.s1);
          } else if (customShowerMat) {
            if (patch.showerTrimLeft) vTrimSides.push(patch.s0);
            if (patch.showerTrimRight) vTrimSides.push(patch.s1);
          }
          for (const sEdge of vTrimSides) {
            const vTrim = new THREE.Mesh(
              new THREE.BoxGeometry(0.01, t1 - t0, 0.01),
              this.metalMaterial
            );
            vTrim.position.set(
              def.p1.x + ux * sEdge + nx * 0.004,
              (t0 + t1) * 0.5,
              def.p1.z + uz * sEdge + nz * 0.004
            );
            group.add(vTrim);
          }
        }

        const generalTop =
          this.tileHeightMode === 'full'
            ? ROOM_HEIGHT
            : this.tileHeightMode === 'h240'
              ? 2.4
              : this.tileHeightMode === 'door'
                ? 2.1
                : this.tileHeightMode === 'half'
                  ? 1.2
                  : 0;
        if (patch.showerPatch && Math.abs(t1 - generalTop) > 0.02) {
          const ux = dx / len;
          const uz = dz / len;
          const yLow = Math.min(t1, generalTop);
          const yHigh = Math.max(t1, generalTop);
          for (const sEdge of [patch.s0, patch.s1]) {
            if (sEdge > 0.02 && sEdge < len - 0.02) {
              const sTrim = new THREE.Mesh(
                new THREE.BoxGeometry(0.01, yHigh - yLow, 0.01),
                this.metalMaterial
              );
              sTrim.position.set(
                def.p1.x + ux * sEdge + nx * 0.004,
                (yLow + yHigh) * 0.5,
                def.p1.z + uz * sEdge + nz * 0.004
              );
              group.add(sTrim);
            }
          }
        }

        // Upper painted plaster band
        const p0 = Math.max(patch.y0, tileTop);
        const p1 = patch.y1;
        if (p1 > p0 + 0.001) {
          const geo = buildQuadGeometry(def.p1, def.p2, patch.s0, patch.s1, p0, p1, uRunning, false);
          const mesh = new THREE.Mesh(geo, this.wallPaintMaterial);
          mesh.receiveShadow = true;
          mesh.userData = {
            isWall: true,
            wallId: patchWallId,
            baseWallId: def.id,
            isShowerWall: Boolean(patch.showerPatch),
            wallLabel: patchWallLabel,
          };
          group.add(mesh);
        }

        // Jolly trim border where tile meets paint
        if (tileTop > patch.y0 + 0.01 && tileTop < patch.y1 - 0.01) {
          const segLen = patch.s1 - patch.s0;
          const trimGeo = new THREE.BoxGeometry(segLen, 0.012, 0.012);
          const trimMesh = new THREE.Mesh(trimGeo, this.metalMaterial);
          const sMid = (patch.s0 + patch.s1) * 0.5;
          const ux = dx / len;
          const uz = dz / len;
          trimMesh.position.set(
            def.p1.x + ux * sMid + nx * 0.004,
            tileTop,
            def.p1.z + uz * sMid + nz * 0.004
          );
          trimMesh.rotation.y = -Math.atan2(dz, dx);
          group.add(trimMesh);
        }

        // Outer architectural shell back-face & top cap (for 3D cutaway maquette view)
        const thick = 0.16;
        const outP1 = { x: def.p1.x - nx * thick, z: def.p1.z - nz * thick };
        const outP2 = { x: def.p2.x - nx * thick, z: def.p2.z - nz * thick };
        const backGeo = buildQuadGeometry(outP1, outP2, patch.s0, patch.s1, patch.y0, patch.y1, 0, true);
        const backMesh = new THREE.Mesh(backGeo, this.outerShellMaterial);
        group.add(backMesh);

        if (Math.abs(patch.y1 - ROOM_HEIGHT) < 0.01) {
          const segLen = patch.s1 - patch.s0;
          const capGeo = new THREE.BoxGeometry(segLen + thick, 0.02, thick);
          const capMesh = new THREE.Mesh(capGeo, this.outerShellMaterial);
          const sMid = (patch.s0 + patch.s1) * 0.5;
          const ux = dx / len;
          const uz = dz / len;
          capMesh.position.set(
            def.p1.x + ux * sMid - nx * (thick * 0.5),
            ROOM_HEIGHT - 0.01,
            def.p1.z + uz * sMid - nz * (thick * 0.5)
          );
          capMesh.rotation.y = -Math.atan2(dz, dx);
          group.add(capMesh);
        }
      }

      this.dynamicWallsContainer.add(group);
      this.wallGroups.push({
        id: def.id,
        group,
        midX,
        midZ,
        nx,
        nz,
      });

      uRunning += len;
    }
  }

  buildWindowAndExterior() {
    // Window 115x100 on East wall at 80 cm from floor (x = 1.90, width = 1.15m, y = 0.80..1.80) with brown wood frames
    this.windowGroup = new THREE.Group();
    const revealMat = new THREE.MeshStandardMaterial({
      color: 0xf2f0eb,
      roughness: 0.65,
      metalness: 0.02,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x5c3822,
      map: this.textureLib.woodGrainMap,
      roughness: 0.42,
      metalness: 0.06,
    });
    const sillMat = new THREE.MeshStandardMaterial({
      color: 0xeae5dc,
      roughness: 0.24,
      metalness: 0.04,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff,
      transparent: true,
      opacity: 0.32,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.65,
    });

    const winW = 1.15;    // 115 cm width
    const depth = 0.16;
    const xCenter = 1.9 + depth * 0.5;
    const zStart = this.roomType === 'first' ? 0.18 : 0.25;
    const zEnd = zStart + winW;
    const zCenter = (zStart + zEnd) * 0.5;
    const yBottom = 0.8;  // 80 cm from floor
    const yTop = 1.8;     // 80 + 100 = 180 cm
    const yCenter = 1.3;  // midpoint of 0.80..1.80

    // Window masonry reveals + marble sill at 80 cm
    const sill = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.05, 0.03, winW + 0.04), sillMat);
    sill.position.set(xCenter - 0.015, yBottom + 0.005, zCenter);
    this.windowGroup.add(sill);

    const topReveal = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.02, winW), revealMat);
    topReveal.position.set(xCenter, yTop - 0.01, zCenter);
    this.windowGroup.add(topReveal);

    for (const zSide of [zStart + 0.01, zEnd - 0.01]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(depth, 1.0, 0.02), revealMat);
      jamb.position.set(xCenter, yCenter, zSide);
      this.windowGroup.add(jamb);
    }

    // Brown double-casement window frame (top, bottom, left, right stiles + center mullion)
    const outerTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, winW - 0.02), frameMat);
    outerTop.position.set(1.96, yTop - 0.038, zCenter);
    const outerBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, winW - 0.02), frameMat);
    outerBot.position.set(1.96, yBottom + 0.042, zCenter);
    const outerLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.96, 0.055), frameMat);
    outerLeft.position.set(1.96, yCenter, zStart + 0.045);
    const outerRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.96, 0.055), frameMat);
    outerRight.position.set(1.96, yCenter, zEnd - 0.045);
    const outerMid = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.94, 0.06), frameMat);
    outerMid.position.set(1.958, yCenter, zCenter);
    this.windowGroup.add(outerTop, outerBot, outerLeft, outerRight, outerMid);

    // Frosted/clear bathroom double-pane glass
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.12, 0.86), glassMat);
    pane.rotation.y = -Math.PI / 2;
    pane.position.set(1.965, yCenter, zCenter);
    this.windowGroup.add(pane);

    // Warm bronze/metal handle on center mullion
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.022), this.metalMaterial);
    handle.position.set(1.922, yCenter - 0.02, zCenter + 0.01);
    this.windowGroup.add(handle);

    // Exterior softer daylight sky backdrop visible through window
    this.skyBackdropMat = new THREE.MeshBasicMaterial({ color: 0xb4cfe6 });
    const skyBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), this.skyBackdropMat);
    skyBackdrop.rotation.y = -Math.PI / 2;
    skyBackdrop.position.set(2.85, 1.35, 0.9);
    this.windowGroup.add(skyBackdrop);

    this.roomShellContainer.add(this.windowGroup);
    this.eastAttachment = this.windowGroup;
  }

  buildDoor() {
    this.doorFrameGroup = new THREE.Group();
    const doorWoodMat = new THREE.MeshStandardMaterial({
      color: 0x5c3822,
      map: this.textureLib.woodGrainMap,
      roughness: 0.42,
      metalness: 0.06,
    });
    const grooveMat = new THREE.MeshStandardMaterial({ color: 0x382012, roughness: 0.55 });

    const isFirst = this.roomType === 'first';
    // Ground: x=0.14, z=0.92..1.72 (hinge at z=0.925, leaf +0.395)
    // First:  x=0.00, z=0.60..1.40 (hinge at z=1.395, leaf -0.395)
    const wallX = isFirst ? 0.0 : 0.14;
    const zTop = isFirst ? 0.6 : 0.92;
    const zBot = isFirst ? 1.4 : 1.72;
    const zMid = (zTop + zBot) * 0.5;
    const sign = isFirst ? -1 : 1;

    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.185, 2.13, 0.06), doorWoodMat);
    jambL.position.set(wallX - 0.075, 1.065, zTop - 0.015);
    const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.185, 2.13, 0.06), doorWoodMat);
    jambR.position.set(wallX - 0.075, 1.065, zBot + 0.015);
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.065, 0.89), doorWoodMat);
    header.position.set(wallX - 0.075, 2.125, zMid);
    this.doorFrameGroup.add(jambL, jambR, header);

    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(wallX + 0.005, 0, isFirst ? zBot - 0.005 : zTop + 0.005);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.044, 2.08, 0.79), doorWoodMat);
    leaf.position.set(0, 1.045, sign * 0.395);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    this.doorPivot.add(leaf);

    for (const gy of [0.45, 0.95, 1.45, 1.85]) {
      const gLine = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.007, 0.76), grooveMat);
      gLine.position.set(0, gy, sign * 0.395);
      this.doorPivot.add(gLine);
    }

    const handleRosette = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.058, 16),
      this.metalMaterial
    );
    handleRosette.rotation.z = Math.PI / 2;
    handleRosette.position.set(0, 1.02, sign * 0.7);
    this.doorPivot.add(handleRosette);

    const leverIn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.12), this.metalMaterial);
    leverIn.position.set(0.045, 1.02, sign * 0.66);
    const leverOut = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.12), this.metalMaterial);
    leverOut.position.set(-0.045, 1.02, sign * 0.66);
    this.doorPivot.add(leverIn, leverOut);

    this.doorFrameGroup.add(this.doorPivot);
    this.roomShellContainer.add(this.doorFrameGroup);
  }

  buildCornerShower80x80() {
    const shBox = this.getShowerAABB();
    if (!shBox) return;

    const shower = new THREE.Group();
    const { cx, cz, minX, maxX, minZ, maxZ, wX, dZ, depth, wall: anchorWall } = shBox;

    // Slim stone-resin shower tray (80x80 or 70x120)
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(wX - 0.005, 0.036, dZ - 0.005),
      this.showerTrayMaterial
    );
    tray.position.set(cx, 0.018, cz);
    tray.receiveShadow = true;
    shower.add(tray);

    const drain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.039, 20),
      this.metalMaterial
    );
    drain.position.set(cx, 0.019, cz);
    shower.add(drain);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe4f3f8,
      transparent: true,
      opacity: 0.28,
      roughness: 0.04,
      metalness: 0.05,
      transmission: 0.72,
      side: THREE.DoubleSide,
    });

    // Check which of the 4 sides of the shower box touch a room masonry wall
    const segs = this.getBaseWallSegments();
    const sideTouchesWall = (mx, mz) => {
      for (const seg of segs) {
        const rx = mx - seg.p1.x;
        const rz = mz - seg.p1.z;
        const s = rx * seg.ux + rz * seg.uz;
        const dist = Math.abs(rx * seg.nx + rz * seg.nz);
        if (dist < 0.035 && s >= -0.05 && s <= seg.len + 0.05) {
          return true;
        }
      }
      return false;
    };

    const wallNorth = sideTouchesWall(cx, minZ);
    const wallSouth = sideTouchesWall(cx, maxZ);
    const wallEast = sideTouchesWall(maxX, cz);
    const wallWest = sideTouchesWall(minX, cz);

    const addGlassSide = (isHoriz, xPos, zPos) => {
      const gW = isHoriz ? wX - 0.01 : 0.01;
      const gD = isHoriz ? 0.01 : dZ - 0.01;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(gW, 2.0, gD), glassMat);
      panel.position.set(xPos, 1.036, zPos);
      const topBar = new THREE.Mesh(
        new THREE.BoxGeometry(isHoriz ? wX - 0.005 : 0.022, 0.022, isHoriz ? 0.022 : dZ - 0.005),
        this.metalMaterial
      );
      topBar.position.set(xPos, 2.036, zPos);
      shower.add(panel, topBar);
    };

    if (!wallNorth) addGlassSide(true, cx, minZ + 0.005);
    if (!wallSouth) addGlassSide(true, cx, maxZ - 0.005);
    if (!wallWest) addGlassSide(false, minX + 0.005, cz);
    if (!wallEast) addGlassSide(false, maxX - 0.005, cz);

    // Corner/wall vertical metal uprights at the 4 corners whenever adjacent to at least one glass side
    const corners = [
      { x: minX + 0.01, z: minZ + 0.01, glassAdj: !wallNorth || !wallWest },
      { x: maxX - 0.01, z: minZ + 0.01, glassAdj: !wallNorth || !wallEast },
      { x: maxX - 0.01, z: maxZ - 0.01, glassAdj: !wallSouth || !wallEast },
      { x: minX + 0.01, z: maxZ - 0.01, glassAdj: !wallSouth || !wallWest },
    ];
    for (const c of corners) {
      if (c.glassAdj) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.024, 2.01, 0.024), this.metalMaterial);
        post.position.set(c.x, 1.04, c.z);
        shower.add(post);
      }
    }

    // Door handle on primary open glass face opposite the anchored wall
    const halfDepth = depth * 0.5;
    const doorFaceX = cx + anchorWall.nx * (halfDepth + 0.005) + anchorWall.ux * 0.16;
    const doorFaceZ = cz + anchorWall.nz * (halfDepth + 0.005) + anchorWall.uz * 0.16;
    const doorHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.34, 12),
      this.metalMaterial
    );
    doorHandle.position.set(doorFaceX, 1.06, doorFaceZ);
    shower.add(doorHandle);

    // Thermostatic shower column + rainfall showerhead mounted on the anchored wall facing inward
    const colGroup = new THREE.Group();
    const backWallX = cx - anchorWall.nx * halfDepth;
    const backWallZ = cz - anchorWall.nz * halfDepth;
    colGroup.position.set(backWallX, 0, backWallZ);
    colGroup.rotation.y = Math.atan2(anchorWall.nx, anchorWall.nz);

    const mixer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.25, 14),
      this.metalMaterial
    );
    mixer.rotation.z = Math.PI / 2;
    mixer.position.set(0, 1.1, 0.04);
    const riser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.04, 12),
      this.metalMaterial
    );
    riser.position.set(0, 1.62, 0.03);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.35, 12),
      this.metalMaterial
    );
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 2.14, 0.2);
    const rainHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.125, 0.012, 26),
      this.metalMaterial
    );
    rainHead.position.set(0, 2.125, 0.36);

    // Caddy shelf + spa bottles mounted next to mixer on anchored wall
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.1), this.metalMaterial);
    shelf.position.set(0.22, 1.24, 0.055);
    const b1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.13, 14),
      new THREE.MeshStandardMaterial({ color: 0x3f574b, roughness: 0.3 })
    );
    b1.position.set(0.18, 1.31, 0.055);
    const b2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.1, 14),
      new THREE.MeshStandardMaterial({ color: 0xd8c3a5, roughness: 0.35 })
    );
    b2.position.set(0.26, 1.295, 0.055);

    colGroup.add(mixer, riser, arm, rainHead, shelf, b1, b2);
    shower.add(colGroup);

    shower.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.fixtureType = 'shower';
      }
    });

    if (this.showerLight) {
      this.showerLight.position.set(cx, 2.55, cz);
    }

    this.showerContainer.add(shower);
    this.showerGroup = shower;
  }

  buildSanitaryAndRadiator() {
    // 1. Movable Bidet unit (Floor-standing Back-to-Wall / Filomuro Bidet + Heated Towel Rail above it)
    this.bidetGroup = new THREE.Group();
    const bidetBowl = this.createFilomuroBowl(true);
    bidetBowl.rotation.y = Math.PI / 2;
    this.bidetGroup.add(bidetBowl);

    this.bidetWallMounted = new THREE.Group();
    for (const dx of [-0.22, 0.22]) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 1.12, 12),
        this.metalMaterial
      );
      rail.position.set(dx, 1.44, 0.055);
      this.bidetWallMounted.add(rail);

      for (const by of [0.98, 1.9]) {
        const bracket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.055, 10),
          this.metalMaterial
        );
        bracket.rotation.x = Math.PI / 2;
        bracket.position.set(dx, by, 0.0275);
        this.bidetWallMounted.add(bracket);
      }
    }

    for (let i = 0; i < 14; i++) {
      if (i === 5 || i === 10) continue;
      const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.44, 10),
        this.metalMaterial
      );
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, 0.92 + i * 0.08, 0.055);
      this.bidetWallMounted.add(rung);
    }

    const towelMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd3,
      roughness: 0.92,
      metalness: 0.0,
    });
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.045), towelMat);
    towel.position.set(0, 1.28, 0.075);
    this.bidetWallMounted.add(towel);
    this.bidetGroup.add(this.bidetWallMounted);

    // Invisible volume collider so clicking anywhere on or above the bidet easily grabs it
    const hitBoxMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });
    const bidetHitBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.45, 0.56), hitBoxMat);
    bidetHitBox.position.set(0, 0.72, 0.26);
    this.bidetGroup.add(bidetHitBox);

    this.bidetGroup.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.fixtureType = 'bidet';
      }
    });

    // 2. Movable WC unit (Floor-standing Back-to-Wall / Filomuro WC + Dual-flush plate + Toilet roll holder)
    this.wcGroup = new THREE.Group();
    const wcBowl = this.createFilomuroBowl(false);
    wcBowl.rotation.y = Math.PI / 2;
    this.wcGroup.add(wcBowl);

    this.wcWallMounted = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.15, 0.014), this.metalMaterial);
    plate.position.set(0, 1.0, 0.008);
    this.wcWallMounted.add(plate);

    const rollHolder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.08), this.metalMaterial);
    rollHolder.position.set(0.26, 0.66, 0.04);
    const paperRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.11, 18),
      new THREE.MeshStandardMaterial({ color: 0xfaf9f5, roughness: 0.85 })
    );
    paperRoll.rotation.z = Math.PI / 2;
    paperRoll.position.set(0.26, 0.62, 0.055);
    this.wcWallMounted.add(rollHolder, paperRoll);
    this.wcGroup.add(this.wcWallMounted);

    // Invisible volume collider so clicking anywhere on or above the WC bowl/flush plate grabs it reliably
    const wcHitBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.18, 0.56), hitBoxMat);
    wcHitBox.position.set(0, 0.59, 0.26);
    this.wcGroup.add(wcHitBox);

    this.wcGroup.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.fixtureType = 'wc';
      }
    });

    this.root.add(this.bidetGroup, this.wcGroup);
    this.updateSanitaryPoses();
  }

  updateSanitaryPoses() {
    if (this.bidetGroup) {
      const bp = this.getSanitaryPoseAndAABB('bidet');
      this.bidetGroup.position.set(bp.x, 0, bp.z);
      this.bidetGroup.rotation.y = bp.rotY;
    }
    if (this.wcGroup) {
      const wp = this.getSanitaryPoseAndAABB('wc');
      this.wcGroup.position.set(wp.x, 0, wp.z);
      this.wcGroup.rotation.y = wp.rotY;
    }
  }

  createFilomuroBowl(isBidet) {
    const g = new THREE.Group();
    // Rounded D-shape floor-standing back-to-wall (filomuro) Italian ceramic bowl resting on floor (y = 0..0.41m)
    const bodyGeo = new THREE.CylinderGeometry(0.185, 0.168, 0.41, 28);
    const body = new THREE.Mesh(bodyGeo, this.ceramicMaterial);
    body.scale.set(1.38, 1, 1);
    body.position.set(-0.27, 0.205, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Flush-to-wall and flush-to-floor rear ceramic block (x = 0..-0.27, y = 0..0.41)
    const rearBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.41, 0.365),
      this.ceramicMaterial
    );
    rearBox.position.set(-0.135, 0.205, 0);
    rearBox.castShadow = true;
    rearBox.receiveShadow = true;
    g.add(rearBox);

    // Crisp ceramic floor-contact base seal (filomuro foot)
    const baseFront = new THREE.Mesh(
      new THREE.CylinderGeometry(0.171, 0.173, 0.012, 28),
      this.ceramicMaterial
    );
    baseFront.scale.set(1.38, 1, 1);
    baseFront.position.set(-0.27, 0.006, 0);
    const baseRear = new THREE.Mesh(
      new THREE.BoxGeometry(0.272, 0.012, 0.368),
      this.ceramicMaterial
    );
    baseRear.position.set(-0.135, 0.006, 0);
    g.add(baseFront, baseRear);

    // Discreet lateral floor-fixing caps typical of Italian filomuro sanitari
    for (const sz of [-0.184, 0.184]) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.006, 12),
        this.metalMaterial
      );
      cap.rotation.x = Math.PI / 2;
      cap.position.set(-0.16, 0.085, sz);
      g.add(cap);
    }

    if (isBidet) {
      // Bidet rim + mixer faucet
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.155, 0.025, 12, 24),
        this.ceramicMaterial
      );
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1.35, 1, 1);
      rim.position.set(-0.28, 0.41, 0);
      g.add(rim);

      const tap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.02, 0.09, 14),
        this.metalMaterial
      );
      tap.position.set(-0.08, 0.455, 0);
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.018), this.metalMaterial);
      spout.position.set(-0.11, 0.485, 0);
      spout.rotation.z = 0.2;
      g.add(tap, spout);
    } else {
      // Slim soft-close WC lid
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.185, 0.185, 0.022, 28),
        this.ceramicMaterial
      );
      lid.scale.set(1.38, 1, 1);
      lid.position.set(-0.27, 0.421, 0);
      const lidRear = new THREE.Mesh(
        new THREE.BoxGeometry(0.27, 0.022, 0.365),
        this.ceramicMaterial
      );
      lidRear.position.set(-0.135, 0.421, 0);
      g.add(lid, lidRear);
    }

    return g;
  }

  buildRoomLights() {
    // Softer, balanced natural indoor lighting so light tiles show full veining & shadow depth
    this.ambientLight = new THREE.HemisphereLight(0xf5f7fa, 0xb8ad99, 0.52);
    this.root.add(this.ambientLight);

    // Natural sunlight entering through the 100x100 East window
    this.sunLight = new THREE.DirectionalLight(0xfff1d9, 1.05);
    this.sunLight.position.set(4.2, 2.7, 0.55);
    this.sunLight.target.position.set(0.6, 0.4, 1.3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 8;
    this.sunLight.shadow.camera.left = -2.2;
    this.sunLight.shadow.camera.right = 2.2;
    this.sunLight.shadow.camera.top = 2.2;
    this.sunLight.shadow.camera.bottom = -2.2;
    this.sunLight.shadow.bias = -0.0008;
    this.root.add(this.sunLight);
    this.root.add(this.sunLight.target);

    // Ceiling recessed LED downlights (balanced intensity)
    this.mainCeilingLight = new THREE.PointLight(0xfff3de, 0.65, 5.2, 1.5);
    this.mainCeilingLight.position.set(0.95, 2.55, 1.15);
    this.root.add(this.mainCeilingLight);

    this.showerLight = new THREE.PointLight(0xfff3de, 0.48, 4.2, 1.6);
    this.showerLight.position.set(1.25, 2.55, 2.15);
    this.root.add(this.showerLight);

    // Visible ceiling recessed fixture discs
    const discMat = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
    for (const [lx, lz] of [
      [0.95, 1.15],
      [1.25, 2.35],
    ]) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.01, 20),
        this.metalMaterial
      );
      ring.position.set(lx, ROOM_HEIGHT - 0.005, lz);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), discMat);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(lx, ROOM_HEIGHT - 0.011, lz);
      this.root.add(ring, bulb);
    }

    this.lightingMode = 'day';
  }

  setLightingMode(mode) {
    this.lightingMode = mode;
    if (mode === 'day') {
      this.ambientLight.intensity = 0.52;
      this.sunLight.intensity = 1.05;
      this.mainCeilingLight.intensity = 0.65;
      this.showerLight.intensity = 0.48;
      this.skyBackdropMat.color.setHex(0xb4cfe6);
    } else {
      // Warm atmospheric evening spa lighting
      this.ambientLight.intensity = 0.22;
      this.sunLight.intensity = 0.06;
      this.mainCeilingLight.intensity = 1.05;
      this.showerLight.intensity = 0.82;
      this.skyBackdropMat.color.setHex(0x1b273d);
    }
  }

  applyFloorBundle(bundle) {
    if (bundle.map) bundle.map.updateMatrix();
    if (bundle.bumpMap) bundle.bumpMap.updateMatrix();
    this.floorMaterial.map = bundle.map;
    this.floorMaterial.bumpMap = bundle.bumpMap;
    this.floorMaterial.bumpScale = bundle.bumpScale ?? 0.01;
    this.floorMaterial.roughness = bundle.roughness ?? 0.5;
    this.floorMaterial.metalness = bundle.metalness ?? 0.04;
    this.floorMaterial.needsUpdate = true;
  }

  applyWallBundle(bundle) {
    if (bundle.map) bundle.map.updateMatrix();
    if (bundle.bumpMap) bundle.bumpMap.updateMatrix();
    this.wallTileMaterial.map = bundle.map;
    this.wallTileMaterial.bumpMap = bundle.bumpMap;
    this.wallTileMaterial.bumpScale = bundle.bumpScale ?? 0.01;
    this.wallTileMaterial.roughness = bundle.roughness ?? 0.35;
    this.wallTileMaterial.metalness = bundle.metalness ?? 0.04;
    this.wallTileMaterial.needsUpdate = true;
  }

  applyUpperWallBundle(bundle) {
    if (bundle.map) bundle.map.updateMatrix();
    if (bundle.bumpMap) bundle.bumpMap.updateMatrix();
    this.wallUpperMaterial.map = bundle.map;
    this.wallUpperMaterial.bumpMap = bundle.bumpMap;
    this.wallUpperMaterial.bumpScale = bundle.bumpScale ?? 0.01;
    this.wallUpperMaterial.roughness = bundle.roughness ?? 0.35;
    this.wallUpperMaterial.metalness = bundle.metalness ?? 0.04;
    this.wallUpperMaterial.needsUpdate = true;
  }

  setWallSplitEnabled(enabled) {
    const next = Boolean(enabled);
    if (this.wallSplitEnabled !== next) {
      this.wallSplitEnabled = next;
      this.rebuildWalls();
    }
  }

  applyVanityWallBundle(bundle) {
    if (bundle.map) bundle.map.updateMatrix();
    if (bundle.bumpMap) bundle.bumpMap.updateMatrix();
    this.vanityWallMaterial.map = bundle.map;
    this.vanityWallMaterial.bumpMap = bundle.bumpMap;
    this.vanityWallMaterial.bumpScale = bundle.bumpScale ?? 0.01;
    this.vanityWallMaterial.roughness = bundle.roughness ?? 0.35;
    this.vanityWallMaterial.metalness = bundle.metalness ?? 0.04;
    this.vanityWallMaterial.needsUpdate = true;
    if (!this.vanityWallEnabled) {
      this.vanityWallEnabled = true;
      this.rebuildWalls();
    }
  }

  setVanityWallEnabled(enabled) {
    if (this.vanityWallEnabled !== enabled) {
      this.vanityWallEnabled = enabled;
      this.rebuildWalls();
    }
  }

  setVanityWallOptions({ span, heightMode }) {
    let changed = false;
    if (span && span !== this.vanityZoneSpan) {
      this.vanityZoneSpan = span;
      changed = true;
    }
    if (heightMode && heightMode !== this.vanityWallHeightMode) {
      this.vanityWallHeightMode = heightMode;
      changed = true;
    }
    if (changed) {
      this.rebuildWalls();
    }
  }

  setFloorPreset(preset) {
    this.applyFloorBundle(this.textureLib.getPresetBundle(preset));
  }

  setWallPreset(preset) {
    this.applyWallBundle(this.textureLib.getPresetBundle(preset));
  }

  applySingleWallBundle(wallId, bundle) {
    if (!wallId || !bundle) return;
    if (bundle.map) bundle.map.updateMatrix();
    if (bundle.bumpMap) bundle.bumpMap.updateMatrix();
    let mat = this.perWallMaterials.get(wallId);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        roughness: 0.35,
        metalness: 0.04,
      });
      this.applyGridShader(mat);
      this.perWallMaterials.set(wallId, mat);
    }
    mat.map = bundle.map;
    mat.bumpMap = bundle.bumpMap;
    mat.bumpScale = bundle.bumpScale ?? 0.01;
    mat.roughness = bundle.roughness ?? 0.35;
    mat.metalness = bundle.metalness ?? 0.04;
    mat.needsUpdate = true;
    this.rebuildWalls();
  }

  clearSingleWallMaterial(wallId) {
    const mat = this.perWallMaterials.get(wallId);
    if (mat) {
      mat.dispose();
      this.perWallMaterials.delete(wallId);
      this.rebuildWalls();
    }
  }

  clearAllSingleWallMaterials() {
    if (this.perWallMaterials.size === 0) return;
    for (const mat of this.perWallMaterials.values()) {
      mat.dispose();
    }
    this.perWallMaterials.clear();
    this.rebuildWalls();
  }

  setHoveredWall(wallId) {
    if (this.hoveredWallId === wallId) return;
    this.hoveredWallId = wallId;
    if (!wallId) {
      this.hoverHighlightMesh.visible = false;
      return;
    }
    const isShowerKey = String(wallId).startsWith('shower:');
    const baseId = isShowerKey ? String(wallId).slice('shower:'.length) : wallId;
    const seg = this.getBaseWallSegments().find((s) => s.id === baseId);
    if (!seg) {
      this.hoverHighlightMesh.visible = false;
      return;
    }
    let s0 = 0;
    let s1 = seg.len;
    if (isShowerKey) {
      const shRange = this.getShowerIntervalOnWall(seg, this.getShowerAABB());
      if (shRange) {
        s0 = shRange[0];
        s1 = shRange[1];
      }
    }
    const spanLen = Math.max(0.05, s1 - s0);
    const sMid = (s0 + s1) * 0.5;
    this.hoverHighlightMesh.scale.set(spanLen, ROOM_HEIGHT, 1);
    const mx = seg.p1.x + seg.ux * sMid + seg.nx * 0.008;
    const mz = seg.p1.z + seg.uz * sMid + seg.nz * 0.008;
    this.hoverHighlightMesh.position.set(mx, ROOM_HEIGHT * 0.5, mz);
    this.hoverHighlightMesh.rotation.set(0, Math.atan2(seg.nx, seg.nz), 0);
    this.hoverHighlightMesh.visible = true;
  }

  setSelectedFixtureHighlight(fixtureType) {
    if (!fixtureType) {
      this.fixtureOutlineMesh.visible = false;
      return;
    }
    if (fixtureType === 'shower') {
      const sh = this.getShowerAABB();
      if (!sh) {
        this.fixtureOutlineMesh.visible = false;
        return;
      }
      this.fixtureOutlineMesh.position.set(sh.cx, 0.042, sh.cz);
      this.fixtureOutlineMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
      this.fixtureOutlineMesh.scale.set(sh.wX * 1.45, sh.dZ * 1.45, 1);
      this.fixtureOutlineMesh.visible = true;
    } else if (fixtureType === 'vanity') {
      const v = this.getVanityPoseAndAABB();
      const cx = (v.minX + v.maxX) * 0.5;
      const cz = (v.minZ + v.maxZ) * 0.5;
      this.fixtureOutlineMesh.position.set(cx, 0.012, cz);
      this.fixtureOutlineMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
      const sx = (v.maxX - v.minX) * 1.42;
      const sz = (v.maxZ - v.minZ) * 1.42;
      this.fixtureOutlineMesh.scale.set(sx, sz, 1);
      this.fixtureOutlineMesh.visible = true;
    } else if (fixtureType === 'bidet' || fixtureType === 'wc') {
      const sp = this.getSanitaryPoseAndAABB(fixtureType);
      this.fixtureOutlineMesh.position.set(sp.cx, 0.014, sp.cz);
      this.fixtureOutlineMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
      const sx = (sp.maxX - sp.minX) * 1.45;
      const sz = (sp.maxZ - sp.minZ) * 1.45;
      this.fixtureOutlineMesh.scale.set(sx, sz, 1);
      this.fixtureOutlineMesh.visible = true;
    }
  }

  boxesOverlap(a, b, pad = 0.02) {
    if (!a || !b) return false;
    return (
      a.maxX > b.minX + pad &&
      a.minX < b.maxX - pad &&
      a.maxZ > b.minZ + pad &&
      a.minZ < b.maxZ - pad
    );
  }

  getForbiddenFixtureBoxes({ excludeKind = null, allowWindow = false } = {}) {
    const isFirst = this.roomType === 'first';
    const boxes = [
      // West doorway clear ingress
      isFirst
        ? { minX: -0.05, maxX: 0.55, minZ: 0.58, maxZ: 1.42, kind: 'door' }
        : { minX: 0.1, maxX: 0.65, minZ: 0.9, maxZ: 1.74, kind: 'door' },
    ];

    if (!allowWindow) {
      // East 115x100 window at 80cm from floor (keep clear of 85cm vanity/mirror & 200cm shower!)
      boxes.push(
        isFirst
          ? { minX: 1.48, maxX: 1.95, minZ: 0.18, maxZ: 1.33, kind: 'window' }
          : { minX: 1.48, maxX: 1.95, minZ: 0.25, maxZ: 1.4, kind: 'window' }
      );
    }

    if (excludeKind !== 'bidet') {
      boxes.push({ ...this.getSanitaryPoseAndAABB('bidet'), kind: 'bidet' });
    }
    if (excludeKind !== 'wc') {
      boxes.push({ ...this.getSanitaryPoseAndAABB('wc'), kind: 'wc' });
    }
    return boxes;
  }

  findNearestVanityPlacement(wx, wz) {
    const segs = this.getBaseWallSegments().filter((s) => s.len >= 0.85);
    const shBox = this.getShowerAABB();
    const forbidden = this.getForbiddenFixtureBoxes({ excludeKind: 'vanity' });

    let best = null;
    let bestDistSq = Infinity;

    for (const seg of segs) {
      const halfMin = Math.min(0.48, seg.len * 0.45);
      for (let s = halfMin; s <= seg.len - halfMin + 0.001; s += 0.02) {
        const cand = { wallId: seg.id, s: Math.min(seg.len - halfMin, s) };
        const info = this.getVanityPoseAndAABB(cand, shBox);
        if (info.spanR - info.spanL < 0.82) continue;
        if (!this.isBoxInsideRoom(info, 0.025)) continue;
        if (shBox && this.boxesOverlap(info, shBox, 0.015)) continue;
        if (forbidden.some((fb) => this.boxesOverlap(info, fb, 0.01))) continue;

        const px = (info.minX + info.maxX) * 0.5;
        const pz = (info.minZ + info.maxZ) * 0.5;
        const dSq = (px - wx) ** 2 + (pz - wz) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = { wallId: seg.id, s: Math.round(cand.s * 1000) / 1000 };
        }
      }
    }

    return best || this.vanityPlacement;
  }

  findNearestShowerPlacement(wx, wz, sizeOverride = this.showerSize) {
    const { along } = this.getShowerDimensions(sizeOverride);
    const halfAlong = along * 0.5;
    const segs = this.getBaseWallSegments().filter((s) => s.len >= along - 0.005);
    const vanInfo = this.getVanityPoseAndAABB(this.vanityPlacement, null);
    const forbidden = this.getForbiddenFixtureBoxes({ excludeKind: 'shower' });

    let best = null;
    let bestDistSq = Infinity;

    for (const seg of segs) {
      const samples = new Set([halfAlong, seg.len - halfAlong]);
      for (let s = halfAlong; s <= seg.len - halfAlong + 0.001; s += 0.02) {
        samples.add(Math.min(seg.len - halfAlong, s));
      }

      for (const rawS of samples) {
        // Magnetic corner snap when within 10 cm of either end of the wall
        let s = rawS;
        if (Math.abs(s - halfAlong) < 0.1) s = halfAlong;
        else if (Math.abs(s - (seg.len - halfAlong)) < 0.1) s = seg.len - halfAlong;

        const cand = { wallId: seg.id, s };
        const box = this.getShowerAABB(cand, true, sizeOverride);
        if (!this.isBoxInsideRoom(box, 0.025)) continue;
        if (this.boxesOverlap(box, vanInfo, 0.015)) continue;
        if (forbidden.some((fb) => this.boxesOverlap(box, fb, 0.01))) continue;

        const dSq = (box.cx - wx) ** 2 + (box.cz - wz) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = { wallId: seg.id, s: Math.round(s * 1000) / 1000 };
        }
      }
    }

    return best || this.showerPlacement;
  }

  findNearestSanitaryPlacement(kind, wx, wz, { ignoreOtherSanitary = false } = {}) {
    const halfW = 0.2;
    const segs = this.getBaseWallSegments().filter((s) => s.len >= 0.42);
    const shBox = this.getShowerAABB();
    const vanInfo = this.getVanityPoseAndAABB(this.vanityPlacement, shBox);
    // Allow WC and Bidet to move freely along North wall (up to the East corner, since window sill is at 80cm height)
    // as well as any other free wall segment in the bathroom.
    let forbidden = this.getForbiddenFixtureBoxes({
      excludeKind: kind,
      allowWindow: true,
    });
    if (ignoreOtherSanitary) {
      forbidden = forbidden.filter((fb) => fb.kind !== 'bidet' && fb.kind !== 'wc');
    }

    let best = null;
    let bestDistSq = Infinity;

    for (const seg of segs) {
      // On East wall, keep Bidet (which carries the 190cm scaldasalviette above it) outside the window opening
      for (let s = halfW + 0.01; s <= seg.len - halfW - 0.01 + 0.001; s += 0.015) {
        const sClamped = Math.min(seg.len - halfW - 0.01, s);
        if (kind === 'bidet' && seg.openings?.some((op) => op.kind === 'window' && sClamped + halfW > op.s0 && sClamped - halfW < op.s1)) {
          continue;
        }
        const cand = { wallId: seg.id, s: sClamped };
        const box = this.getSanitaryPoseAndAABB(kind, cand);
        if (!this.isBoxInsideRoom(box, 0.02)) continue;
        if (shBox && this.boxesOverlap(box, shBox, 0.015)) continue;
        if (vanInfo && this.boxesOverlap(box, vanInfo, 0.015)) continue;
        if (forbidden.some((fb) => this.boxesOverlap(box, fb, 0.012))) continue;

        const dSq = (box.cx - wx) ** 2 + (box.cz - wz) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = { wallId: seg.id, s: Math.round(cand.s * 1000) / 1000 };
        }
      }
    }

    return best || (kind === 'bidet' ? this.bidetPlacement : this.wcPlacement);
  }

  dragSanitaryFixture(kind, wx, wz) {
    const otherKind = kind === 'wc' ? 'bidet' : 'wc';
    const curSelf = kind === 'wc' ? this.wcPlacement : this.bidetPlacement;
    const curOther = otherKind === 'wc' ? this.wcPlacement : this.bidetPlacement;

    // 1. Find ideal placement for `kind` ignoring `otherKind`
    const idealSelf = this.findNearestSanitaryPlacement(kind, wx, wz, { ignoreOtherSanitary: true });
    const idealSelfBox = this.getSanitaryPoseAndAABB(kind, idealSelf);
    const otherBox = this.getSanitaryPoseAndAABB(otherKind, curOther);

    // If ideal placement doesn't collide with the other sanitary fixture, apply directly
    if (!this.boxesOverlap(idealSelfBox, otherBox, 0.012)) {
      return kind === 'wc'
        ? { wcPlacement: idealSelf, bidetPlacement: { ...this.bidetPlacement } }
        : { bidetPlacement: idealSelf, wcPlacement: { ...this.wcPlacement } };
    }

    // 2. If they collide on the same wall, try pushing or swapping `otherKind` along that wall
    if (idealSelf.wallId === curOther.wallId) {
      const seg = this.getBaseWallSegments().find((s) => s.id === idealSelf.wallId);
      if (seg) {
        const halfW = 0.2;
        const minSpacing = 0.425;
        const shBox = this.getShowerAABB();
        const vanInfo = this.getVanityPoseAndAABB(this.vanityPlacement, shBox);
        const baseForbidden = this.getForbiddenFixtureBoxes({
          excludeKind: otherKind,
          allowWindow: true,
        }).filter((fb) => fb.kind !== kind);

        const pushDir = curSelf.wallId === curOther.wallId && curSelf.s > curOther.s ? -1 : 1;
        const candidateOffsets = [pushDir * minSpacing, -pushDir * minSpacing];

        for (const offset of candidateOffsets) {
          const sOtherCand = Math.round((idealSelf.s + offset) * 1000) / 1000;
          if (sOtherCand < halfW + 0.01 || sOtherCand > seg.len - halfW - 0.01) continue;
          if (
            otherKind === 'bidet' &&
            seg.openings?.some(
              (op) => op.kind === 'window' && sOtherCand + halfW > op.s0 && sOtherCand - halfW < op.s1
            )
          ) {
            continue;
          }
          const candOther = { wallId: seg.id, s: sOtherCand };
          const candOtherBox = this.getSanitaryPoseAndAABB(otherKind, candOther);
          if (!this.isBoxInsideRoom(candOtherBox, 0.02)) continue;
          if (shBox && this.boxesOverlap(candOtherBox, shBox, 0.015)) continue;
          if (vanInfo && this.boxesOverlap(candOtherBox, vanInfo, 0.015)) continue;
          if (this.boxesOverlap(candOtherBox, idealSelfBox, 0.012)) continue;
          if (baseForbidden.some((fb) => this.boxesOverlap(candOtherBox, fb, 0.012))) continue;

          return kind === 'wc'
            ? { wcPlacement: idealSelf, bidetPlacement: candOther }
            : { bidetPlacement: idealSelf, wcPlacement: candOther };
        }
      }
    }

    // 3. Fallback: standard constrained nearest placement
    const fallbackSelf = this.findNearestSanitaryPlacement(kind, wx, wz);
    return kind === 'wc'
      ? { wcPlacement: fallbackSelf, bidetPlacement: { ...this.bidetPlacement } }
      : { bidetPlacement: fallbackSelf, wcPlacement: { ...this.wcPlacement } };
  }

  setFixturesConfig({
    showerEnabled,
    showerSize,
    showerPlacement,
    vanityPlacement,
    bidetPlacement,
    wcPlacement,
  }) {
    let needsWallRebuild = false;
    let needsShowerRebuild = false;
    let needsSanitaryUpdate = false;

    if (typeof showerEnabled === 'boolean' && showerEnabled !== this.showerEnabled) {
      this.showerEnabled = showerEnabled;
      needsWallRebuild = true;
      needsShowerRebuild = true;
    }
    if (showerSize && showerSize !== this.showerSize) {
      this.showerSize = showerSize;
      needsWallRebuild = true;
      needsShowerRebuild = true;
    }
    if (
      showerPlacement &&
      (showerPlacement.wallId !== this.showerPlacement.wallId ||
        Math.abs(showerPlacement.s - this.showerPlacement.s) > 0.001)
    ) {
      this.showerPlacement = { ...showerPlacement };
      needsWallRebuild = true;
      needsShowerRebuild = true;
    }
    if (
      vanityPlacement &&
      (vanityPlacement.wallId !== this.vanityPlacement.wallId ||
        Math.abs(vanityPlacement.s - this.vanityPlacement.s) > 0.001)
    ) {
      this.vanityPlacement = { ...vanityPlacement };
      needsWallRebuild = true;
    }
    if (
      bidetPlacement &&
      (bidetPlacement.wallId !== this.bidetPlacement.wallId ||
        Math.abs(bidetPlacement.s - this.bidetPlacement.s) > 0.001)
    ) {
      this.bidetPlacement = { ...bidetPlacement };
      needsSanitaryUpdate = true;
      needsWallRebuild = true;
    }
    if (
      wcPlacement &&
      (wcPlacement.wallId !== this.wcPlacement.wallId ||
        Math.abs(wcPlacement.s - this.wcPlacement.s) > 0.001)
    ) {
      this.wcPlacement = { ...wcPlacement };
      needsSanitaryUpdate = true;
      needsWallRebuild = true;
    }

    if (needsSanitaryUpdate) this.updateSanitaryPoses();
    if (needsWallRebuild) this.rebuildWalls();
    if (needsShowerRebuild) this.rebuildShower();
  }

  setShowerTileHeightMode(mode) {
    if (this.showerTileHeightMode !== mode) {
      this.showerTileHeightMode = mode;
      this.rebuildWalls();
    }
  }

  setTileHeightMode(mode) {
    this.tileHeightMode = mode;
    this.rebuildWalls();
  }

  setPaintColor(hex) {
    this.wallPaintMaterial.color.set(hex);
  }

  setShowerTrayColor(hex) {
    if (this.showerTrayMaterial) {
      this.showerTrayMaterial.color.set(hex);
    }
  }

  setMetalFinish(finish) {
    if (finish === 'black') {
      this.metalMaterial.color.setHex(0x232629);
      this.metalMaterial.roughness = 0.38;
      this.metalMaterial.metalness = 0.55;
    } else if (finish === 'brass') {
      this.metalMaterial.color.setHex(0xd1ab66);
      this.metalMaterial.roughness = 0.24;
      this.metalMaterial.metalness = 0.88;
    } else {
      this.metalMaterial.color.setHex(0xdadfe4);
      this.metalMaterial.roughness = 0.15;
      this.metalMaterial.metalness = 0.92;
    }
  }

  toggleDoor() {
    this.doorOpen = !this.doorOpen;
    if (this.roomType === 'first') {
      this.doorTargetAngle = this.doorOpen ? -1.28 : -0.06;
    } else {
      this.doorTargetAngle = this.doorOpen ? 1.28 : 0.06;
    }
    return this.doorOpen;
  }

  setCutawayMode(enabled) {
    this.cutawayMode = enabled;
    if (this.ceilingMesh) this.ceilingMesh.visible = !enabled;
    if (!enabled) {
      for (const w of this.wallGroups) {
        w.group.visible = true;
      }
      if (this.windowGroup) this.windowGroup.visible = true;
      if (this.doorFrameGroup) this.doorFrameGroup.visible = true;
      if (this.bidetWallMounted) this.bidetWallMounted.visible = true;
      if (this.wcWallMounted) this.wcWallMounted.visible = true;
    }
  }

  update(dt, camera) {
    // Smooth door swing animation
    this.doorCurrentAngle += (this.doorTargetAngle - this.doorCurrentAngle) * Math.min(1, dt * 8);
    if (this.doorPivot) {
      this.doorPivot.rotation.y = this.doorCurrentAngle;
    }

    // Smart architectural cutaway in Orbital 3D mode: hide outer walls facing the camera cleanly
    if (this.cutawayMode && camera) {
      const westIds = new Set(['west-top', 'step-14', 'west-door', 'step-40', 'west-bottom']);
      const maxZ = this.roomType === 'first' ? 2.92 : 2.8;
      const showWest = camera.position.x >= 0.72;
      const showEast = camera.position.x <= 1.65;
      const showNorth = camera.position.z >= 0.25;
      const showSouth = camera.position.z <= maxZ - 0.25;

      const wallVisibleMap = new Map();
      for (const w of this.wallGroups) {
        let visible = true;
        if (westIds.has(w.id)) visible = showWest;
        else if (w.id === 'east') visible = showEast;
        else if (w.id === 'north') visible = showNorth;
        else if (w.id === 'south') visible = showSouth;
        w.group.visible = visible;
        wallVisibleMap.set(w.id, visible);
      }
      if (this.windowGroup) this.windowGroup.visible = showEast;
      if (this.doorFrameGroup) this.doorFrameGroup.visible = showWest;
      if (this.bidetWallMounted) {
        this.bidetWallMounted.visible = wallVisibleMap.get(this.bidetPlacement.wallId) ?? true;
      }
      if (this.wcWallMounted) {
        this.wcWallMounted.visible = wallVisibleMap.get(this.wcPlacement.wallId) ?? true;
      }
    }
  }

  // Exact collision clamp for First-Person walking inside either bathroom (tracks moved shower, vanity, WC & bidet!)
  clampWalkPosition(x, z, margin = 0.24) {
    let cx = x;
    let cz = z;

    if (this.roomType === 'first') {
      cx = Math.max(margin, Math.min(1.9 - margin, cx));
      cz = Math.max(margin, Math.min(2.92 - margin, cz));
    } else {
      cz = Math.max(margin, Math.min(2.8 - margin, cz));
      cx = Math.min(1.9 - margin, cx);
      let minX = margin;
      if (cz > 1.9 - margin * 0.7) {
        minX = 0.54 + margin;
      } else if (cz > 0.8 - margin * 0.7) {
        minX = 0.14 + margin;
      }
      cx = Math.max(minX, cx);
    }

    const pushOutOfBox = (box, pad) => {
      if (!box) return;
      const bMinX = box.minX - pad;
      const bMaxX = box.maxX + pad;
      const bMinZ = box.minZ - pad;
      const bMaxZ = box.maxZ + pad;
      if (cx > bMinX && cx < bMaxX && cz > bMinZ && cz < bMaxZ) {
        const dLeft = cx - bMinX;
        const dRight = bMaxX - cx;
        const dTop = cz - bMinZ;
        const dBot = bMaxZ - cz;
        const minD = Math.min(dLeft, dRight, dTop, dBot);
        if (minD === dLeft) cx = bMinX;
        else if (minD === dRight) cx = bMaxX;
        else if (minD === dTop) cz = bMinZ;
        else cz = bMaxZ;
      }
    };

    pushOutOfBox(this.getSanitaryPoseAndAABB('bidet'), margin * 0.5);
    pushOutOfBox(this.getSanitaryPoseAndAABB('wc'), margin * 0.5);
    pushOutOfBox(this.getShowerAABB(), margin * 0.7);
    pushOutOfBox(this.getVanityPoseAndAABB(), margin * 0.55);

    return { x: cx, z: cz };
  }
}
