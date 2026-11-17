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

    this.floorMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.04,
    });

    this.wallTileMaterial = new THREE.MeshStandardMaterial({
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

    this.roomType = 'ground'; // 'ground' | 'first'
    this.tileHeightMode = 'door'; // 'full' | 'door' | 'half'
    this.vanityWallEnabled = false;
    this.vanityWallHeightMode = 'same'; // 'same' | 'full'
    this.vanityZoneSpan = 'window-to-wall';
    this.cutawayMode = false;
    this.doorOpen = false;
    this.doorCurrentAngle = 0.06;
    this.doorTargetAngle = 0.06;
    this.showerGroup = null;

    this.buildSanitaryAndRadiator();
    this.buildRoomLights();
    this.rebuildRoomArchitecture();
  }

  getActivePolygon() {
    return this.roomType === 'first' ? ROOM_POLYGON_FIRST : ROOM_POLYGON_GROUND;
  }

  setRoomType(type) {
    if (type !== 'ground' && type !== 'first') return;
    if (this.roomType === type) return;
    this.roomType = type;
    this.doorOpen = false;
    this.doorCurrentAngle = type === 'first' ? -0.06 : 0.06;
    this.doorTargetAngle = this.doorCurrentAngle;
    this.rebuildRoomArchitecture();
  }

  rebuildRoomArchitecture() {
    while (this.roomShellContainer.children.length > 0) {
      const child = this.roomShellContainer.children[0];
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      this.roomShellContainer.remove(child);
    }
    this.showerGroup = null;

    this.buildFloorAndCeiling();
    this.rebuildWalls();
    this.buildWindowAndExterior();
    this.buildDoor();
    if (this.roomType === 'first') {
      this.buildCornerShower80x80();
    }
    this.setCutawayMode(this.cutawayMode);
    this.setLightingMode(this.lightingMode || 'day');
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

  getWallDefinitions() {
    if (this.roomType === 'first') {
      // Bagno Primo Piano: 190 x 292 cm (5,55 mq)
      // - East window 100x100 at z = 0.18..1.18, y = 0.80..1.80
      // - SE corner 80x80 shower at x = 1.10..1.90, z = 2.12..2.92
      // - South wall vanity zone beside shower right flank: x = 1.10..0.00 (s = 0.80..1.90 = 110 cm)
      // - West door 80x210 at z = 0.60..1.40 -> along (0,2.92)->(0,0), s = 1.52..2.32
      const southPatches =
        this.vanityWallEnabled && this.vanityZoneSpan === 'centered'
          ? [
              { s0: 0.0, s1: 0.8, y0: 0, y1: ROOM_HEIGHT, showerPatch: true },
              { s0: 0.8, s1: 0.86, y0: 0, y1: ROOM_HEIGHT },
              {
                s0: 0.86,
                s1: 1.84,
                y0: 0,
                y1: ROOM_HEIGHT,
                vanityZone: true,
                trimLeft: true,
                trimRight: true,
              },
              { s0: 1.84, s1: 1.9, y0: 0, y1: ROOM_HEIGHT },
            ]
          : [
              { s0: 0.0, s1: 0.8, y0: 0, y1: ROOM_HEIGHT, showerPatch: true },
              {
                s0: 0.8,
                s1: 1.9,
                y0: 0,
                y1: ROOM_HEIGHT,
                vanityZone: true,
                trimLeft: true,
                trimRight: false,
              },
            ];

      return [
        {
          id: 'north',
          p1: { x: 0.0, z: 0.0 },
          p2: { x: 1.9, z: 0.0 },
          patches: [{ s0: 0, s1: 1.9, y0: 0, y1: ROOM_HEIGHT }],
        },
        {
          id: 'east',
          p1: { x: 1.9, z: 0.0 },
          p2: { x: 1.9, z: 2.92 },
          patches: [
            { s0: 0.0, s1: 0.18, y0: 0, y1: ROOM_HEIGHT },
            { s0: 0.18, s1: 1.18, y0: 0, y1: 0.8 },
            { s0: 0.18, s1: 1.18, y0: 1.8, y1: ROOM_HEIGHT },
            { s0: 1.18, s1: 2.12, y0: 0, y1: ROOM_HEIGHT },
            { s0: 2.12, s1: 2.92, y0: 0, y1: ROOM_HEIGHT, showerPatch: true },
          ],
        },
        {
          id: 'south',
          p1: { x: 1.9, z: 2.92 },
          p2: { x: 0.0, z: 2.92 },
          patches: southPatches,
        },
        {
          id: 'west-door',
          p1: { x: 0.0, z: 2.92 },
          p2: { x: 0.0, z: 0.0 },
          patches: [
            { s0: 0.0, s1: 1.52, y0: 0, y1: ROOM_HEIGHT },
            { s0: 1.52, s1: 2.32, y0: 2.1, y1: ROOM_HEIGHT },
            { s0: 2.32, s1: 2.92, y0: 0, y1: ROOM_HEIGHT },
          ],
        },
      ];
    }

    // Bagno Pianterreno (4,68 mq)
    return [
      {
        id: 'north',
        p1: { x: 0.0, z: 0.0 },
        p2: { x: 1.9, z: 0.0 },
        patches: [{ s0: 0, s1: 1.9, y0: 0, y1: ROOM_HEIGHT }],
      },
      {
        id: 'east',
        p1: { x: 1.9, z: 0.0 },
        p2: { x: 1.9, z: 2.8 },
        // Window 100x100 at s = 0.25..1.25, y = 0.80..1.80; s = 1.25..2.80 (155 cm) holds Mobile Bagno & Specchio!
        patches:
          this.vanityWallEnabled && this.vanityZoneSpan === 'centered'
            ? [
                { s0: 0.0, s1: 0.25, y0: 0, y1: ROOM_HEIGHT },
                { s0: 0.25, s1: 1.25, y0: 0, y1: 0.8 },
                { s0: 0.25, s1: 1.25, y0: 1.8, y1: ROOM_HEIGHT },
                { s0: 1.25, s1: 1.35, y0: 0, y1: ROOM_HEIGHT },
                { s0: 1.35, s1: 2.65, y0: 0, y1: ROOM_HEIGHT, vanityZone: true, trimLeft: true, trimRight: true },
                { s0: 2.65, s1: 2.8, y0: 0, y1: ROOM_HEIGHT },
              ]
            : [
                { s0: 0.0, s1: 0.25, y0: 0, y1: ROOM_HEIGHT },
                { s0: 0.25, s1: 1.25, y0: 0, y1: 0.8 },
                { s0: 0.25, s1: 1.25, y0: 1.8, y1: ROOM_HEIGHT },
                { s0: 1.25, s1: 2.8, y0: 0, y1: ROOM_HEIGHT, vanityZone: true, trimLeft: true, trimRight: false },
              ],
      },
      {
        id: 'south',
        p1: { x: 1.9, z: 2.8 },
        p2: { x: 0.54, z: 2.8 },
        patches: [{ s0: 0, s1: 1.36, y0: 0, y1: ROOM_HEIGHT }],
      },
      {
        id: 'west-bottom',
        p1: { x: 0.54, z: 2.8 },
        p2: { x: 0.54, z: 1.9 },
        patches: [{ s0: 0, s1: 0.9, y0: 0, y1: ROOM_HEIGHT }],
      },
      {
        id: 'step-40',
        p1: { x: 0.54, z: 1.9 },
        p2: { x: 0.14, z: 1.9 },
        patches: [{ s0: 0, s1: 0.4, y0: 0, y1: ROOM_HEIGHT }],
      },
      {
        id: 'west-door',
        p1: { x: 0.14, z: 1.9 },
        p2: { x: 0.14, z: 0.8 },
        // Door 80x210 at z = 0.92..1.72 -> s from (1.90-1.72)=0.18 to (1.90-0.92)=0.98
        patches: [
          { s0: 0.0, s1: 0.18, y0: 0, y1: ROOM_HEIGHT },
          { s0: 0.18, s1: 0.98, y0: 2.1, y1: ROOM_HEIGHT },
          { s0: 0.98, s1: 1.1, y0: 0, y1: ROOM_HEIGHT },
        ],
      },
      {
        id: 'step-14',
        p1: { x: 0.14, z: 0.8 },
        p2: { x: 0.0, z: 0.8 },
        patches: [{ s0: 0, s1: 0.14, y0: 0, y1: ROOM_HEIGHT }],
      },
      {
        id: 'west-top',
        p1: { x: 0.0, z: 0.8 },
        p2: { x: 0.0, z: 0.0 },
        patches: [{ s0: 0, s1: 0.8, y0: 0, y1: ROOM_HEIGHT }],
      },
    ];
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
      const len = Math.hypot(dx, dz);
      const nx = -dz / len;
      const nz = dx / len;
      const midX = (def.p1.x + def.p2.x) * 0.5;
      const midZ = (def.p1.z + def.p2.z) * 0.5;

      for (const patch of def.patches) {
        const useVanityAccent = Boolean(patch.vanityZone && this.vanityWallEnabled);
        let tileTop = ROOM_HEIGHT;
        if (useVanityAccent && this.vanityWallHeightMode === 'full') {
          tileTop = ROOM_HEIGHT;
        } else if (this.tileHeightMode === 'door') {
          tileTop = 2.1;
        } else if (this.tileHeightMode === 'half') {
          tileTop = patch.showerPatch ? 2.1 : 1.2;
        }

        const activeTileMat = useVanityAccent ? this.vanityWallMaterial : this.wallTileMaterial;

        // Lower tiled band
        const t0 = patch.y0;
        const t1 = Math.min(patch.y1, tileTop);
        if (t1 > t0 + 0.001) {
          const geo = buildQuadGeometry(def.p1, def.p2, patch.s0, patch.s1, t0, t1, uRunning, false);
          const mesh = new THREE.Mesh(geo, activeTileMat);
          mesh.receiveShadow = true;
          group.add(mesh);
        }

        // Vertical jolly trim profile along the vanity accent zone border(s)
        if (useVanityAccent && t1 > t0 + 0.01) {
          const ux = dx / len;
          const uz = dz / len;
          const vTrimSides = [];
          if (patch.trimLeft) vTrimSides.push(patch.s0);
          if (patch.trimRight) vTrimSides.push(patch.s1);
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

        // Upper painted plaster band
        const p0 = Math.max(patch.y0, tileTop);
        const p1 = patch.y1;
        if (p1 > p0 + 0.001) {
          const geo = buildQuadGeometry(def.p1, def.p2, patch.s0, patch.s1, p0, p1, uRunning, false);
          const mesh = new THREE.Mesh(geo, this.wallPaintMaterial);
          mesh.receiveShadow = true;
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
    // Window 100x100 on East wall at 80 cm from floor (x = 1.90, z = 0.25..1.25, y = 0.80..1.80) with brown wood frames
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

    const depth = 0.16;
    const xCenter = 1.9 + depth * 0.5;
    const zStart = this.roomType === 'first' ? 0.18 : 0.25;
    const zEnd = zStart + 1.0;
    const zCenter = (zStart + zEnd) * 0.5;
    const yBottom = 0.8;  // 80 cm from floor
    const yTop = 1.8;     // 80 + 100 = 180 cm
    const yCenter = 1.3;  // midpoint of 0.80..1.80

    // Window masonry reveals + marble sill at 80 cm
    const sill = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.05, 0.03, 1.04), sillMat);
    sill.position.set(xCenter - 0.015, yBottom + 0.005, zCenter);
    this.windowGroup.add(sill);

    const topReveal = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.02, 1.0), revealMat);
    topReveal.position.set(xCenter, yTop - 0.01, zCenter);
    this.windowGroup.add(topReveal);

    for (const zSide of [zStart + 0.01, zEnd - 0.01]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(depth, 1.0, 0.02), revealMat);
      jamb.position.set(xCenter, yCenter, zSide);
      this.windowGroup.add(jamb);
    }

    // Brown double-casement window frame (top, bottom, left, right stiles + center mullion)
    const outerTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.98), frameMat);
    outerTop.position.set(1.96, yTop - 0.038, zCenter);
    const outerBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.98), frameMat);
    outerBot.position.set(1.96, yBottom + 0.042, zCenter);
    const outerLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.96, 0.055), frameMat);
    outerLeft.position.set(1.96, yCenter, zStart + 0.045);
    const outerRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.96, 0.055), frameMat);
    outerRight.position.set(1.96, yCenter, zEnd - 0.045);
    const outerMid = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.94, 0.06), frameMat);
    outerMid.position.set(1.958, yCenter, zCenter);
    this.windowGroup.add(outerTop, outerBot, outerLeft, outerRight, outerMid);

    // Frosted/clear bathroom double-pane glass
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.86), glassMat);
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
    // 80x80 cm Corner Shower Box in SE corner (x = 1.10..1.90, z = 2.12..2.92) for Bagno Primo Piano
    const shower = new THREE.Group();

    // Slim white stone-resin 80x80 shower tray
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0xf4f3ef,
      roughness: 0.36,
      metalness: 0.02,
    });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.795, 0.036, 0.795), trayMat);
    tray.position.set(1.5, 0.018, 2.52);
    tray.receiveShadow = true;
    shower.add(tray);

    const drain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.039, 20),
      this.metalMaterial
    );
    drain.position.set(1.5, 0.019, 2.52);
    shower.add(drain);

    // Clear tempered glass enclosure (height 2.00 m -> y = 0.036..2.036)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe4f3f8,
      transparent: true,
      opacity: 0.28,
      roughness: 0.04,
      metalness: 0.05,
      transmission: 0.72,
      side: THREE.DoubleSide,
    });

    // North glass door/panel (z = 2.125, x = 1.105..1.895)
    const glassNorth = new THREE.Mesh(new THREE.BoxGeometry(0.79, 2.0, 0.01), glassMat);
    glassNorth.position.set(1.5, 1.036, 2.125);
    // West glass panel — right flank adjacent to Mobile Bagno (x = 1.105, z = 2.125..2.915)
    const glassWest = new THREE.Mesh(new THREE.BoxGeometry(0.01, 2.0, 0.79), glassMat);
    glassWest.position.set(1.105, 1.036, 2.52);
    shower.add(glassNorth, glassWest);

    // Metal profiles (wall uprights, corner post, top perimeter frame, door handle)
    const profEast = new THREE.Mesh(new THREE.BoxGeometry(0.022, 2.01, 0.024), this.metalMaterial);
    profEast.position.set(1.888, 1.04, 2.125);
    const profSouth = new THREE.Mesh(new THREE.BoxGeometry(0.024, 2.01, 0.022), this.metalMaterial);
    profSouth.position.set(1.105, 1.04, 2.908);
    const cornerPost = new THREE.Mesh(new THREE.BoxGeometry(0.024, 2.01, 0.024), this.metalMaterial);
    cornerPost.position.set(1.108, 1.04, 2.128);
    const topBarN = new THREE.Mesh(new THREE.BoxGeometry(0.795, 0.022, 0.022), this.metalMaterial);
    topBarN.position.set(1.5, 2.036, 2.125);
    const topBarW = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.795), this.metalMaterial);
    topBarW.position.set(1.105, 2.036, 2.52);
    const doorHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.34, 12),
      this.metalMaterial
    );
    doorHandle.position.set(1.26, 1.06, 2.105);
    shower.add(profEast, profSouth, cornerPost, topBarN, topBarW, doorHandle);

    // Thermostatic shower column + rainfall showerhead on East wall inside 80x80 box
    const mixer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.25, 14),
      this.metalMaterial
    );
    mixer.rotation.x = Math.PI / 2;
    mixer.position.set(1.86, 1.1, 2.52);
    const riser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.04, 12),
      this.metalMaterial
    );
    riser.position.set(1.87, 1.62, 2.52);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.35, 12),
      this.metalMaterial
    );
    arm.rotation.z = Math.PI / 2;
    arm.position.set(1.7, 2.14, 2.52);
    const rainHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.125, 0.012, 26),
      this.metalMaterial
    );
    rainHead.position.set(1.54, 2.125, 2.52);
    shower.add(mixer, riser, arm, rainHead);

    // Corner caddy shelf + spa bottles
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.1), this.metalMaterial);
    shelf.position.set(1.72, 1.24, 2.86);
    const b1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.13, 14),
      new THREE.MeshStandardMaterial({ color: 0x3f574b, roughness: 0.3 })
    );
    b1.position.set(1.67, 1.31, 2.86);
    const b2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.1, 14),
      new THREE.MeshStandardMaterial({ color: 0xd8c3a5, roughness: 0.35 })
    );
    b2.position.set(1.76, 1.295, 2.86);
    shower.add(shelf, b1, b2);

    this.roomShellContainer.add(shower);
    this.showerGroup = shower;
  }

  buildSanitaryAndRadiator() {
    const group = new THREE.Group();

    // Bidet (left) & WC (right) along the 190 cm North wall (z = 0.00, facing +Z South), to the left of the East window
    // 1. Suspended Bidet at x = 0.56, z = 0.00
    const bidet = this.createSuspendedBowl(true);
    bidet.rotation.y = Math.PI / 2;
    bidet.position.set(0.56, 0, 0.0);
    group.add(bidet);

    // 2. Heated Towel Rail (Scaldasalviette) mounted on the North wall directly ABOVE the Bidet (x = 0.56)
    const radGroup = new THREE.Group();
    for (const dx of [-0.22, 0.22]) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 1.12, 12),
        this.metalMaterial
      );
      rail.position.set(0.56 + dx, 1.44, 0.055);
      radGroup.add(rail);

      for (const by of [0.98, 1.9]) {
        const bracket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.055, 10),
          this.metalMaterial
        );
        bracket.rotation.x = Math.PI / 2;
        bracket.position.set(0.56 + dx, by, 0.0275);
        radGroup.add(bracket);
      }
    }

    for (let i = 0; i < 14; i++) {
      if (i === 5 || i === 10) continue;
      const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.44, 10),
        this.metalMaterial
      );
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0.56, 0.92 + i * 0.08, 0.055);
      radGroup.add(rung);
    }

    const towelMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd3,
      roughness: 0.92,
      metalness: 0.0,
    });
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.045), towelMat);
    towel.position.set(0.56, 1.28, 0.075);
    radGroup.add(towel);
    const northMounted = new THREE.Group();
    northMounted.add(radGroup);

    // 3. Suspended WC at x = 1.18, z = 0.00
    const wc = this.createSuspendedBowl(false);
    wc.rotation.y = Math.PI / 2;
    wc.position.set(1.18, 0, 0.0);
    group.add(wc);

    // Dual-flush plate on North wall above WC
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.15, 0.014), this.metalMaterial);
    plate.position.set(1.18, 1.0, 0.008);
    northMounted.add(plate);

    // Toilet roll holder beside WC
    const rollHolder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.08), this.metalMaterial);
    rollHolder.position.set(1.48, 0.66, 0.04);
    const paperRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.11, 18),
      new THREE.MeshStandardMaterial({ color: 0xfaf9f5, roughness: 0.85 })
    );
    paperRoll.rotation.z = Math.PI / 2;
    paperRoll.position.set(1.48, 0.62, 0.055);
    northMounted.add(rollHolder, paperRoll);

    group.add(northMounted);
    this.northWallMountedGroup = northMounted;
    this.root.add(group);
  }

  createSuspendedBowl(isBidet) {
    const g = new THREE.Group();
    // Rounded D-shape suspended Italian ceramic bowl facing -X (West)
    const bodyGeo = new THREE.CylinderGeometry(0.185, 0.15, 0.3, 24);
    const body = new THREE.Mesh(bodyGeo, this.ceramicMaterial);
    body.scale.set(1.38, 1, 1);
    body.position.set(-0.27, 0.26, 0);
    body.castShadow = true;
    g.add(body);

    const rearBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.3, 0.36),
      this.ceramicMaterial
    );
    rearBox.position.set(-0.13, 0.26, 0);
    rearBox.castShadow = true;
    g.add(rearBox);

    if (isBidet) {
      // Bidet rim + mixer faucet
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.155, 0.025, 12, 24),
        this.ceramicMaterial
      );
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1.35, 1, 1);
      rim.position.set(-0.28, 0.405, 0);
      g.add(rim);

      const tap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.02, 0.09, 14),
        this.metalMaterial
      );
      tap.position.set(-0.08, 0.45, 0);
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.018), this.metalMaterial);
      spout.position.set(-0.11, 0.48, 0);
      spout.rotation.z = 0.2;
      g.add(tap, spout);
    } else {
      // Slim soft-close WC lid
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.185, 0.185, 0.022, 24),
        this.ceramicMaterial
      );
      lid.scale.set(1.38, 1, 1);
      lid.position.set(-0.27, 0.42, 0);
      const lidRear = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.022, 0.36),
        this.ceramicMaterial
      );
      lidRear.position.set(-0.13, 0.42, 0);
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

  setTileHeightMode(mode) {
    this.tileHeightMode = mode;
    this.rebuildWalls();
  }

  setPaintColor(hex) {
    this.wallPaintMaterial.color.set(hex);
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
      if (this.northWallMountedGroup) this.northWallMountedGroup.visible = true;
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

      for (const w of this.wallGroups) {
        let visible = true;
        if (westIds.has(w.id)) visible = showWest;
        else if (w.id === 'east') visible = showEast;
        else if (w.id === 'north') visible = showNorth;
        else if (w.id === 'south') visible = showSouth;
        w.group.visible = visible;
      }
      if (this.windowGroup) this.windowGroup.visible = showEast;
      if (this.doorFrameGroup) this.doorFrameGroup.visible = showWest;
      if (this.northWallMountedGroup) this.northWallMountedGroup.visible = showNorth;
    }
  }

  // Exact collision clamp for First-Person walking inside either bathroom
  clampWalkPosition(x, z, margin = 0.24) {
    let cx = x;
    let cz = z;

    if (this.roomType === 'first') {
      // Rectangular 190 x 292 cm first-floor bathroom
      cx = Math.max(margin, Math.min(1.9 - margin, cx));
      cz = Math.max(margin, Math.min(2.92 - margin, cz));

      // North-wall Bidet & WC (x = 0.28..1.45, z < 0.50)
      if (cz < 0.5 + margin * 0.65 && cx > 0.28 && cx < 1.45) {
        cz = Math.max(cz, 0.5 + margin * 0.65);
      }

      // SE corner 80x80 shower box (x = 1.10..1.90, z = 2.12..2.92)
      const shBoundX = 1.1 - margin * 0.75;
      const shBoundZ = 2.12 - margin * 0.75;
      if (cx > shBoundX && cz > shBoundZ) {
        if (cx - shBoundX < cz - shBoundZ) {
          cx = shBoundX;
        } else {
          cz = shBoundZ;
        }
      }

      // South-wall Mobile Bagno beside shower (x = 0.00..1.10, z = 2.42..2.92)
      if (cx <= 1.12 && cz > 2.42 - margin * 0.6) {
        cz = Math.min(cz, 2.42 - margin * 0.6);
      }

      return { x: cx, z: cz };
    }

    // Stepped 4.68 mq ground-floor bathroom
    cz = Math.max(margin, Math.min(2.8 - margin, cz));
    cx = Math.min(1.9 - margin, cx);

    let minX = margin;
    if (cz > 1.9 - margin * 0.7) {
      minX = 0.54 + margin;
    } else if (cz > 0.8 - margin * 0.7) {
      minX = 0.14 + margin;
    }
    cx = Math.max(minX, cx);

    if (cz < 0.5 + margin * 0.65 && cx > 0.28 && cx < 1.45) {
      cz = Math.max(cz, 0.5 + margin * 0.65);
    }

    if (cz > 1.32 && cx > 1.38 - margin * 0.6) {
      cx = Math.min(cx, 1.38 - margin * 0.6);
    }

    return { x: cx, z: cz };
  }
}
