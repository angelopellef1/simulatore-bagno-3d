import * as THREE from 'three';

export const VANITY_MODELS = [
  {
    id: 'milano',
    name: 'Milano 100 — Sospeso Minimal',
    dims: 'L 100 × P 48 cm · Specchio Ø 85 LED',
    description: 'Doppio cassettone sospeso con gola, lavabo integrato e specchio tondo retroilluminato.',
  },
  {
    id: 'brera',
    name: 'Brera 120 — Mensola & Ciotola',
    dims: 'L 120 × P 50 cm · Lavabo d’appoggio',
    description: 'Top sospeso con base asimmetrica, bacinella ovale, canna alta e lampada pendente.',
  },
  {
    id: 'venezia',
    name: 'Venezia 105 — Atelier su Piedini',
    dims: 'L 105 × P 48 cm · Specchio ad Arco',
    description: ' Frontali cannettati, piedini slanciati, top marmo e specchio ad arco con applique.',
  },
  {
    id: 'cortina',
    name: 'Cortina 100 — Industrial Loft',
    dims: 'L 100 × P 47 cm · Telaio Metallo',
    description: 'Struttura tubolare a vista con ripiano inferiore, cassetto centrale e specchio cornice.',
  },
  {
    id: 'amalfi',
    name: 'Amalfi 95 — Curvo + Colonna',
    dims: 'L 95 + Pensile 32 cm · Capsula LED',
    description: 'Design organico arrotondato con specchio a capsula LED e pensile contenitore laterale.',
  },
];

const MODEL_SPAN_INFO = {
  milano: { span: 1.01, centerOffset: 0.0 },
  brera: { span: 1.18, centerOffset: 0.03 },
  venezia: { span: 1.06, centerOffset: 0.0 },
  cortina: { span: 1.01, centerOffset: 0.0 },
  amalfi: { span: 1.36, centerOffset: 0.09 },
};

export class VanityManager {
  constructor(scene, textureLib, sharedMetalMat, sharedCeramicMat) {
    this.scene = scene;
    this.textureLib = textureLib;
    this.metalMat = sharedMetalMat;
    this.ceramicMat = sharedCeramicMat;

    // Anchor on the East wall to the RIGHT of the 100x100 window (window z=0.25..1.25 -> solid wall z=1.25..2.80 = 155 cm)
    // Centered at z = 2.00, x = 1.895, rotated Ry(-90deg) to face West (-X) into the bathroom
    this.anchor = new THREE.Group();
    this.anchor.position.set(1.895, 0, 2.0);
    this.anchor.rotation.y = -Math.PI / 2;
    this.scene.add(this.anchor);

    this.cabinetMaterial = new THREE.MeshStandardMaterial({
      color: 0xc29666,
      map: this.textureLib.woodGrainMap,
      roughness: 0.48,
      metalness: 0.03,
    });

    this.darkGrooveMat = new THREE.MeshStandardMaterial({
      color: 0x242628,
      roughness: 0.6,
      metalness: 0.2,
    });

    this.marbleTopMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f2ed,
      roughness: 0.16,
      metalness: 0.03,
      clearcoat: 0.5,
    });

    this.mirrorMat = new THREE.MeshStandardMaterial({
      color: 0xeef5fa,
      roughness: 0.02,
      metalness: 0.96,
    });

    this.ledGlowMat = new THREE.MeshBasicMaterial({
      color: 0xf4dfbe,
    });

    this.mirrorLight = new THREE.PointLight(0xffe6bd, 0.45, 2.4, 1.7);
    this.mirrorLight.position.set(0, 1.55, 0.28);
    this.anchor.add(this.mirrorLight);

    this.currentGroup = null;
    this.currentModelId = 'milano';
    this.catalogItemsById = new Map();
    this.activeCatalogItem = null;
    this.roomType = 'ground';
    this.wallPose = {
      x: 1.895,
      z: 2.0,
      rotY: -Math.PI / 2,
      availWidth: 1.55,
    };
  }

  registerCatalogItems(items = []) {
    this.catalogItemsById.clear();
    for (const it of items) {
      if (it && it.id) {
        this.catalogItemsById.set(it.id, it);
      }
    }
  }

  getSpanInfo() {
    if (this.activeCatalogItem) {
      return {
        span: Math.max(0.58, (this.activeCatalogItem.widthCm || 90) / 100),
        centerOffset: 0.0,
      };
    }
    return MODEL_SPAN_INFO[this.currentModelId] || MODEL_SPAN_INFO.milano;
  }

  getNaturalSpan() {
    return this.getSpanInfo().span;
  }

  setWallPose(pose) {
    if (!pose) return;
    this.wallPose = { ...this.wallPose, ...pose };
    this.updateAnchorTransform();
  }

  setRoomPlacement(roomType) {
    this.roomType = roomType;
    this.updateAnchorTransform();
  }

  updateAnchorTransform() {
    const info = this.getSpanInfo();
    const avail = Math.max(0.75, this.wallPose.availWidth || 1.55);
    const scaleX = Math.min(1.0, (avail - 0.03) / info.span);
    const scaleZ = scaleX < 0.9 ? 0.93 : 1.0;

    // Local +X points to the right when facing local +Z: world tangent of local +X is (cos(rotY), -sin(rotY))
    const rotY = this.wallPose.rotY;
    const shiftLocalX = -info.centerOffset * scaleX;
    const wx = this.wallPose.x + Math.cos(rotY) * shiftLocalX;
    const wz = this.wallPose.z - Math.sin(rotY) * shiftLocalX;

    this.anchor.position.set(wx, 0, wz);
    this.anchor.rotation.y = rotY;
    this.anchor.scale.set(scaleX, 1, scaleZ);
  }

  setFinish(finishObj) {
    this.cabinetMaterial.color.set(finishObj.hex);
    this.cabinetMaterial.map = finishObj.wood ? this.textureLib.woodGrainMap : null;
    this.cabinetMaterial.roughness = finishObj.wood ? 0.48 : 0.4;
    this.cabinetMaterial.needsUpdate = true;
  }

  setModel(modelId) {
    this.currentModelId = modelId;
    const catItem = this.catalogItemsById.get(modelId) || null;
    this.activeCatalogItem = catItem;
    if (catItem && catItem.hex) {
      this.setFinish({ hex: catItem.hex, wood: Boolean(catItem.wood) });
    }

    if (this.currentGroup) {
      this.currentGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      this.anchor.remove(this.currentGroup);
    }

    const g = new THREE.Group();
    if (catItem) {
      this.buildAvivo(g, catItem);
    } else {
      switch (modelId) {
        case 'brera':
          this.buildBrera(g);
          break;
        case 'venezia':
          this.buildVenezia(g);
          break;
        case 'cortina':
          this.buildCortina(g);
          break;
        case 'amalfi':
          this.buildAmalfi(g);
          break;
        case 'milano':
        default:
          this.buildMilano(g);
          break;
      }
    }

    g.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.userData.fixtureType = 'vanity';
      }
    });

    this.currentGroup = g;
    this.anchor.add(g);
    this.updateAnchorTransform();
  }

  addFaucet(parent, x, y, z, tall = false) {
    const h = tall ? 0.25 : 0.14;
    const spoutLen = tall ? 0.14 : 0.11;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.021, h, 16),
      this.metalMat
    );
    stem.position.set(x, y + h * 0.5, z);

    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, spoutLen, 14),
      this.metalMat
    );
    spout.rotation.x = Math.PI / 2 - 0.18;
    spout.position.set(x, y + h - 0.025, z + spoutLen * 0.48);

    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 0.075), this.metalMat);
    lever.position.set(x, y + h + 0.01, z + 0.015);

    const drain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.008, 16),
      this.metalMat
    );
    drain.position.set(x, y - 0.045, z + 0.13);

    parent.add(stem, spout, lever, drain);
  }

  addCounterDecor(parent, x, y, z) {
    // Soap dispenser + toothbrush tumbler
    const soapBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.035, 0.11, 16),
      new THREE.MeshStandardMaterial({ color: 0xe6e0d5, roughness: 0.35 })
    );
    soapBody.position.set(x, y + 0.055, z);

    const pump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.035, 10),
      this.metalMat
    );
    pump.position.set(x, y + 0.125, z);

    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.035), this.metalMat);
    nozzle.position.set(x, y + 0.14, z + 0.012);

    // Small ceramic pot with green succulent
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.028, 0.065, 14),
      new THREE.MeshStandardMaterial({ color: 0xd9cfc1, roughness: 0.6 })
    );
    pot.position.set(x + 0.09, y + 0.032, z - 0.02);

    const plant = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.036, 1),
      new THREE.MeshStandardMaterial({ color: 0x527358, roughness: 0.75 })
    );
    plant.position.set(x + 0.09, y + 0.078, z - 0.02);

    parent.add(soapBody, pump, nozzle, pot, plant);
  }

  buildIntegratedBasinTop(parent, width, depth, yTop) {
    // 4 surround rim bars + recessed inner basin bottom so the sink actually looks concave!
    const rimH = 0.035;
    const basinW = Math.min(0.54, width * 0.54);
    const basinD = depth * 0.62;
    const sideW = (width - basinW) * 0.5;
    const backD = (depth - basinD) * 0.58;
    const frontD = depth - basinD - backD;

    const leftRim = new THREE.Mesh(new THREE.BoxGeometry(sideW, rimH, depth), this.ceramicMat);
    leftRim.position.set(-width * 0.5 + sideW * 0.5, yTop - rimH * 0.5, depth * 0.5);

    const rightRim = new THREE.Mesh(new THREE.BoxGeometry(sideW, rimH, depth), this.ceramicMat);
    rightRim.position.set(width * 0.5 - sideW * 0.5, yTop - rimH * 0.5, depth * 0.5);

    const backRim = new THREE.Mesh(new THREE.BoxGeometry(basinW, rimH, backD), this.ceramicMat);
    backRim.position.set(0, yTop - rimH * 0.5, backD * 0.5);

    const frontRim = new THREE.Mesh(new THREE.BoxGeometry(basinW, rimH, frontD), this.ceramicMat);
    frontRim.position.set(0, yTop - rimH * 0.5, depth - frontD * 0.5);

    const basinWell = new THREE.Mesh(
      new THREE.BoxGeometry(basinW + 0.02, 0.09, basinD + 0.02),
      this.ceramicMat
    );
    basinWell.position.set(0, yTop - rimH - 0.035, backD + basinD * 0.5);

    parent.add(leftRim, rightRim, backRim, frontRim, basinWell);
  }

  // 1. MILANO 100 — Sospeso Minimal Moderno
  buildMilano(g) {
    const W = 1.0;
    const D = 0.48;

    // Carcass
    const carcass = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.01, 0.5, D - 0.02),
      this.cabinetMaterial
    );
    carcass.position.set(0, 0.58, (D - 0.02) * 0.5);
    g.add(carcass);

    // Two suspended soft-close drawers with recessed handle groove
    const d1 = new THREE.Mesh(new THREE.BoxGeometry(W, 0.235, 0.022), this.cabinetMaterial);
    d1.position.set(0, 0.45, D - 0.01);
    const d2 = new THREE.Mesh(new THREE.BoxGeometry(W, 0.235, 0.022), this.cabinetMaterial);
    d2.position.set(0, 0.705, D - 0.01);
    const groove = new THREE.Mesh(new THREE.BoxGeometry(W - 0.012, 0.025, 0.025), this.darkGrooveMat);
    groove.position.set(0, 0.578, D - 0.018);
    g.add(d1, d2, groove);

    this.buildIntegratedBasinTop(g, W + 0.01, D + 0.01, 0.865);
    this.addFaucet(g, 0, 0.865, 0.09, false);
    this.addCounterDecor(g, -0.36, 0.865, 0.16);

    // Round Ø 85 cm backlit LED mirror
    const glowHalo = new THREE.Mesh(new THREE.CircleGeometry(0.445, 48), this.ledGlowMat);
    glowHalo.position.set(0, 1.54, 0.012);
    const mirrorBacking = new THREE.Mesh(
      new THREE.CylinderGeometry(0.425, 0.425, 0.02, 48),
      this.mirrorMat
    );
    mirrorBacking.rotation.x = Math.PI / 2;
    mirrorBacking.position.set(0, 1.54, 0.024);
    g.add(glowHalo, mirrorBacking);
  }

  // 2. BRERA 120 — Mensolone Design + Ciotola d'appoggio + Pendente
  buildBrera(g) {
    const W = 1.18;
    const D = 0.5;

    // Thick floating counter slab (y = 0.74..0.81)
    const topSlab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.075, D), this.cabinetMaterial);
    topSlab.position.set(0.03, 0.775, D * 0.5);
    g.add(topSlab);

    // Lower asymmetric floating drawer module shifted slightly right
    const lowerUnit = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, D - 0.03), this.cabinetMaterial);
    lowerUnit.position.set(0.16, 0.46, (D - 0.03) * 0.5);
    const lowerFront = new THREE.Mesh(new THREE.BoxGeometry(0.865, 0.255, 0.02), this.cabinetMaterial);
    lowerFront.position.set(0.16, 0.46, D - 0.02);
    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.025), this.metalMat);
    handleBar.position.set(0.16, 0.57, D);
    g.add(lowerUnit, lowerFront, handleBar);

    // Folded towels on lower shelf left overhang
    const towelStack = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.09, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xede8de, roughness: 0.9 })
    );
    towelStack.position.set(-0.38, 0.64, 0.24);
    const towelBar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.36), this.metalMat);
    towelBar.position.set(-0.38, 0.59, 0.24);
    g.add(towelStack, towelBar);

    // Oval countertop vessel bowl (Lavabo a ciotola) on left-center
    const vesselOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.155, 0.145, 32, 1, true),
      this.ceramicMat
    );
    vesselOuter.material = this.ceramicMat.clone();
    vesselOuter.material.side = THREE.DoubleSide;
    vesselOuter.scale.set(1.28, 1, 0.92);
    vesselOuter.position.set(-0.08, 0.885, 0.26);

    const vesselBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.15, 0.025, 32),
      this.ceramicMat
    );
    vesselBottom.scale.set(1.28, 1, 0.92);
    vesselBottom.position.set(-0.08, 0.822, 0.26);
    g.add(vesselOuter, vesselBottom);

    this.addFaucet(g, -0.08, 0.812, 0.075, true);
    this.addCounterDecor(g, 0.36, 0.812, 0.22);

    // Wide panoramic backlit rectangular mirror (112 x 72 cm)
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), this.ledGlowMat);
    halo.position.set(0.03, 1.54, 0.01);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.02), this.mirrorMat);
    mirror.position.set(0.03, 1.54, 0.024);
    g.add(halo, mirror);

    // Designer pendant globe lamp hanging from ceiling on right side
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 1.08, 8),
      this.metalMat
    );
    cord.position.set(0.46, 2.16, 0.26);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 24, 24),
      this.ledGlowMat
    );
    globe.position.set(0.46, 1.58, 0.26);
    g.add(cord, globe);
  }

  // 3. VENEZIA 105 — Classico Contemporaneo su Piedini con Frontali Cannettati
  buildVenezia(g) {
    const W = 1.04;
    const D = 0.48;

    // 4 tapered metal legs (h = 0.24 m)
    for (const lx of [-W * 0.46, W * 0.46]) {
      for (const lz of [0.06, D - 0.05]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.01, 0.24, 12),
          this.metalMat
        );
        leg.position.set(lx, 0.12, lz);
        g.add(leg);
      }
    }

    // Cabinet body (y = 0.24..0.83)
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.59, D - 0.02), this.cabinetMaterial);
    body.position.set(0, 0.535, (D - 0.02) * 0.5);
    g.add(body);

    // Fluted vertical slats across two cabinet doors + metal knobs
    const slats = 26;
    const slatW = (W - 0.06) / slats;
    for (let i = 0; i < slats; i++) {
      const sx = -W * 0.5 + 0.03 + (i + 0.5) * slatW;
      if (Math.abs(sx) < 0.008) continue; // center door gap
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(slatW * 0.65, 0.53, 0.014),
        this.cabinetMaterial
      );
      rib.position.set(sx, 0.535, D - 0.008);
      g.add(rib);
    }

    // Two round knobs
    for (const kx of [-0.045, 0.045]) {
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.024, 14),
        this.metalMat
      );
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, 0.66, D + 0.008);
      g.add(knob);
    }

    // Marble countertop + backsplash (alzatina) + undermount basin
    const backSplash = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.07, 0.02), this.marbleTopMat);
    backSplash.position.set(0, 0.895, 0.01);
    g.add(backSplash);

    this.buildIntegratedBasinTop(g, W + 0.02, D + 0.015, 0.865);
    this.addFaucet(g, 0, 0.865, 0.095, false);
    this.addCounterDecor(g, -0.37, 0.865, 0.18);

    // Arched mirror with metal frame + twin side wall sconces
    const archShape = new THREE.Shape();
    const mw = 0.36;
    const mh = 0.52;
    archShape.moveTo(-mw, 0);
    archShape.lineTo(mw, 0);
    archShape.lineTo(mw, mh);
    archShape.absarc(0, mh, mw, 0, Math.PI, false);
    archShape.lineTo(-mw, 0);

    const frameGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.024, bevelEnabled: false });
    const frameMesh = new THREE.Mesh(frameGeo, this.metalMat);
    frameMesh.scale.set(1.04, 1.025, 1);
    frameMesh.position.set(0, 1.12, 0.005);

    const mirrorGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.028, bevelEnabled: false });
    const mirrorMesh = new THREE.Mesh(mirrorGeo, this.mirrorMat);
    mirrorMesh.position.set(0, 1.13, 0.006);
    g.add(frameMesh, mirrorMesh);

    // Wall sconces left & right
    for (const sx of [-0.47, 0.47]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.08), this.metalMat);
      arm.position.set(sx, 1.62, 0.04);
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.18, 16),
        this.ledGlowMat
      );
      shade.position.set(sx, 1.68, 0.08);
      g.add(arm, shade);
    }
  }

  // 4. CORTINA 100 — Industrial Loft Metallo & Legno
  buildCortina(g) {
    const W = 1.0;
    const D = 0.47;
    const tube = 0.022;

    // Open tubular metal frame (4 vertical posts + top/bottom/shelf rails)
    for (const px of [-W * 0.5 + tube * 0.5, W * 0.5 - tube * 0.5]) {
      for (const pz of [tube, D - tube * 0.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(tube, 0.83, tube), this.metalMat);
        post.position.set(px, 0.415, pz);
        g.add(post);
      }
      // Side crossbars
      for (const py of [0.16, 0.52, 0.82]) {
        const sideBar = new THREE.Mesh(new THREE.BoxGeometry(tube, tube, D - tube), this.metalMat);
        sideBar.position.set(px, py, D * 0.5);
        g.add(sideBar);
      }
    }

    for (const py of [0.16, 0.82]) {
      const frontBar = new THREE.Mesh(new THREE.BoxGeometry(W, tube, tube), this.metalMat);
      frontBar.position.set(0, py, D - tube * 0.5);
      g.add(frontBar);
    }

    // Slatted lower shelf at y = 0.16
    for (let s = 0; s < 6; s++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.012, 0.048), this.metalMat);
      slat.position.set(0, 0.165, 0.07 + s * 0.068);
      g.add(slat);
    }

    // Rolled spa towels on lower shelf
    for (let t = 0; t < 3; t++) {
      const roll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.28, 16),
        new THREE.MeshStandardMaterial({ color: t === 1 ? 0xd9d2c5 : 0xf1ede4, roughness: 0.9 })
      );
      roll.rotation.x = Math.PI / 2;
      roll.position.set(-0.26 + t * 0.11, 0.22, 0.24);
      g.add(roll);
    }

    // Suspended wooden drawer box inside metal frame (y = 0.46..0.73)
    const drawerBox = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.05, 0.26, D - 0.05),
      this.cabinetMaterial
    );
    drawerBox.position.set(0, 0.6, D * 0.5);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.016, 0.025), this.metalMat);
    pull.position.set(0, 0.62, D - 0.01);
    g.add(drawerBox, pull);

    // Thick ceramic block sink top (y = 0.83..0.89)
    this.buildIntegratedBasinTop(g, W + 0.01, D + 0.01, 0.88);
    this.addFaucet(g, 0, 0.88, 0.085, false);
    this.addCounterDecor(g, 0.34, 0.88, 0.17);

    // Rectangular metal-framed industrial mirror + top linear LED bar
    const mFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.8, 0.026), this.metalMat);
    mFrame.position.set(0, 1.54, 0.014);
    const mGlass = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.76, 0.03), this.mirrorMat);
    mGlass.position.set(0, 1.54, 0.015);
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.02, 0.09), this.metalMat);
    lightBar.position.set(0, 1.98, 0.05);
    const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.008, 0.03), this.ledGlowMat);
    lightStrip.position.set(0, 1.968, 0.07);
    g.add(mFrame, mGlass, lightBar, lightStrip);
  }

  // 5. AMALFI 95 — Curvo Organico + Colonna Pensile Laterale
  buildAmalfi(g) {
    // Shift main curved vanity slightly left (-0.12) and place matching tall wall cabinet on right (+0.58)
    const sub = new THREE.Group();
    sub.position.set(-0.1, 0, 0);

    // Pill/stadium rounded cabinet shape extruded vertically
    const cw = 0.62;
    const rad = 0.18; // total width = 0.62 + 0.36 = 0.98 m, depth = 0.46 m
    const pillShape = new THREE.Shape();
    pillShape.moveTo(-cw * 0.5 - rad, 0);
    pillShape.lineTo(cw * 0.5 + rad, 0);
    pillShape.lineTo(cw * 0.5 + rad, 0.28);
    pillShape.absarc(cw * 0.5, 0.28, rad, 0, Math.PI * 0.5, false);
    pillShape.lineTo(-cw * 0.5, 0.28 + rad);
    pillShape.absarc(-cw * 0.5, 0.28, rad, Math.PI * 0.5, Math.PI, false);
    pillShape.closePath();

    const cabGeo = new THREE.ExtrudeGeometry(pillShape, { depth: 0.46, bevelEnabled: false });
    const cabMesh = new THREE.Mesh(cabGeo, this.cabinetMaterial);
    cabMesh.rotation.x = Math.PI / 2;
    cabMesh.position.set(0, 0.81, 0);
    sub.add(cabMesh);

    // Decorative horizontal shadow reveal line around curved front
    const revealGeo = new THREE.ExtrudeGeometry(pillShape, { depth: 0.014, bevelEnabled: false });
    const revealMesh = new THREE.Mesh(revealGeo, this.darkGrooveMat);
    revealMesh.scale.set(1.003, 1.003, 1);
    revealMesh.rotation.x = Math.PI / 2;
    revealMesh.position.set(0, 0.585, 0);
    sub.add(revealMesh);

    // Curved ceramic top cap + oval integrated basin
    const topGeo = new THREE.ExtrudeGeometry(pillShape, { depth: 0.032, bevelEnabled: false });
    const topMesh = new THREE.Mesh(topGeo, this.ceramicMat);
    topMesh.scale.set(1.012, 1.012, 1);
    topMesh.rotation.x = Math.PI / 2;
    topMesh.position.set(0, 0.845, 0);
    sub.add(topMesh);

    const basinRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 12, 32),
      this.ceramicMat
    );
    basinRim.rotation.x = Math.PI / 2;
    basinRim.scale.set(1.3, 0.9, 1);
    basinRim.position.set(0, 0.848, 0.25);
    sub.add(basinRim);

    this.addFaucet(sub, 0, 0.845, 0.08, false);
    this.addCounterDecor(sub, -0.31, 0.845, 0.16);

    // Vertical LED pill/capsule mirror (54 x 92 cm)
    const capShape = new THREE.Shape();
    const mr = 0.26;
    const mStraight = 0.4;
    capShape.absarc(0, 0, mr, Math.PI, Math.PI * 2, false);
    capShape.lineTo(mr, mStraight);
    capShape.absarc(0, mStraight, mr, 0, Math.PI, false);
    capShape.closePath();

    const glowCap = new THREE.Mesh(new THREE.ShapeGeometry(capShape), this.ledGlowMat);
    glowCap.scale.set(1.06, 1.04, 1);
    glowCap.position.set(0, 1.34, 0.01);

    const mirrorCapGeo = new THREE.ExtrudeGeometry(capShape, { depth: 0.022, bevelEnabled: false });
    const mirrorCap = new THREE.Mesh(mirrorCapGeo, this.mirrorMat);
    mirrorCap.position.set(0, 1.35, 0.012);
    sub.add(glowCap, mirrorCap);

    g.add(sub);

    // Matching tall suspended side column cabinet (Colonna Pensile 32 x 135 x 26 cm) on right
    const colGroup = new THREE.Group();
    colGroup.position.set(0.62, 1.25, 0);
    const colBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.32, 0.25), this.cabinetMaterial);
    colBody.position.set(0, 0, 0.125);
    const colDoor = new THREE.Mesh(new THREE.BoxGeometry(0.315, 1.31, 0.018), this.cabinetMaterial);
    colDoor.position.set(0, 0, 0.258);
    const colHandle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.24, 0.022), this.metalMat);
    colHandle.position.set(-0.125, -0.1, 0.274);
    colGroup.add(colBody, colDoor, colHandle);
    g.add(colGroup);
  }

  // 6. IPERCERAMICA AVIVO CANNETTATO (60 / 75 / 90 / 120 cm · 1/2 Ante o 1/2 Cassetti)
  buildAvivo(g, item) {
    const W = Math.max(0.58, (item.widthCm || 90) / 100);
    const D = 0.46;
    const isSingleDrawer = item.openingKind === '1-drawer';
    const isTwoDrawers = item.openingKind === '2-drawers';
    const isTwoDoors = item.openingKind === '2-doors';
    const H = isSingleDrawer ? 0.35 : 0.54;
    const yTop = 0.85;
    const yBot = yTop - H;
    const yMid = (yTop + yBot) * 0.5;

    // Main suspended cabinet carcass
    const carcass = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.008, H - 0.01, D - 0.022),
      this.cabinetMaterial
    );
    carcass.position.set(0, yMid, (D - 0.022) * 0.5);
    g.add(carcass);

    // Front panel(s) + optional 3D vertical fluted slats (Cannettato for Iperceramica Avivo & fluted Deghi models)
    const isFluted = item.brand !== 'deghi' || Boolean(item.fluted);
    const slatCount = Math.max(16, Math.round(W * 32));
    const slatPitch = (W - 0.024) / slatCount;

    if (isTwoDrawers) {
      const hHalf = (H - 0.024) * 0.5;
      const yUpper = yTop - hHalf * 0.5 - 0.004;
      const yLower = yBot + hHalf * 0.5 + 0.004;

      for (const yBand of [yLower, yUpper]) {
        const front = new THREE.Mesh(
          new THREE.BoxGeometry(W - 0.004, hHalf, 0.016),
          this.cabinetMaterial
        );
        front.position.set(0, yBand, D - 0.014);
        g.add(front);

        if (isFluted) {
          for (let i = 0; i < slatCount; i++) {
            const sx = -W * 0.5 + 0.012 + (i + 0.5) * slatPitch;
            const rib = new THREE.Mesh(
              new THREE.BoxGeometry(slatPitch * 0.58, hHalf - 0.006, 0.012),
              this.cabinetMaterial
            );
            rib.position.set(sx, yBand, D - 0.003);
            g.add(rib);
          }
        }
      }

      const groove = new THREE.Mesh(
        new THREE.BoxGeometry(W - 0.01, 0.022, 0.024),
        this.darkGrooveMat
      );
      groove.position.set(0, yMid, D - 0.016);
      g.add(groove);
    } else {
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(W - 0.004, H - 0.008, 0.016),
        this.cabinetMaterial
      );
      front.position.set(0, yMid, D - 0.014);
      g.add(front);

      if (isFluted) {
        for (let i = 0; i < slatCount; i++) {
          const sx = -W * 0.5 + 0.012 + (i + 0.5) * slatPitch;
          if (isTwoDoors && Math.abs(sx) < 0.007) continue; // center door seam
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(slatPitch * 0.58, H - 0.016, 0.012),
            this.cabinetMaterial
          );
          rib.position.set(sx, yMid, D - 0.003);
          g.add(rib);
        }
      }

      if (isTwoDoors) {
        const doorSeam = new THREE.Mesh(
          new THREE.BoxGeometry(0.008, H - 0.01, 0.02),
          this.darkGrooveMat
        );
        doorSeam.position.set(0, yMid, D - 0.01);
        g.add(doorSeam);
      }
    }

    // Basin / Top configuration (Toppino, 2 Vasche, Vasca Sinistra/Destra, HIDE, SMILE, SMART)
    if (item.basinType === 'toppino') {
      // Matching cabinet wood/lacquer counter top + oval ceramic vessel sink
      const topSlab = new THREE.Mesh(
        new THREE.BoxGeometry(W + 0.012, 0.028, D + 0.012),
        this.cabinetMaterial
      );
      topSlab.position.set(0, yTop + 0.014, (D + 0.012) * 0.5);
      g.add(topSlab);

      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.145, 0.13, 28),
        this.ceramicMat
      );
      bowl.scale.set(1.24, 1, 0.92);
      bowl.position.set(0, yTop + 0.09, D * 0.52);
      g.add(bowl);
      this.addFaucet(g, 0, yTop + 0.028, 0.08, true);
    } else if (item.doubleBasin) {
      // 120 cm double-basin ceramic top (2 vasche SMART)
      const halfW = W * 0.5;
      for (const side of [-1, 1]) {
        const sub = new THREE.Group();
        sub.position.set(side * (halfW * 0.5), 0, 0);
        this.buildIntegratedBasinTop(sub, halfW + 0.006, D + 0.01, yTop + 0.025);
        this.addFaucet(sub, 0, yTop + 0.025, 0.085, false);
        g.add(sub);
      }
    } else if (item.offsetBasin && Math.abs(item.offsetBasin) > 0.05) {
      // 120 cm asymmetric left or right basin + counter space
      const bShift = item.offsetBasin;
      const basinSpan = 0.68;
      const sub = new THREE.Group();
      sub.position.set(bShift, 0, 0);
      this.buildIntegratedBasinTop(sub, basinSpan, D + 0.01, yTop + 0.025);
      this.addFaucet(sub, 0, yTop + 0.025, 0.085, false);
      g.add(sub);

      // Solid ceramic counter wing on the opposite side
      const wingW = W + 0.01 - basinSpan;
      const wingX = bShift < 0 ? W * 0.5 - wingW * 0.5 + 0.003 : -W * 0.5 + wingW * 0.5 - 0.003;
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(wingW, 0.035, D + 0.01),
        this.ceramicMat
      );
      wing.position.set(wingX, yTop + 0.025 - 0.0175, (D + 0.01) * 0.5);
      g.add(wing);
    } else {
      this.buildIntegratedBasinTop(g, W + 0.01, D + 0.01, yTop + 0.025);
      this.addFaucet(g, 0, yTop + 0.025, 0.085, false);
    }

    if (W >= 0.72) {
      const decorX = item.offsetBasin < 0 ? W * 0.32 : -W * 0.34;
      this.addCounterDecor(g, decorX, yTop + 0.025, 0.16);
    }

    // Matching backlit LED mirror proportional to cabinet width
    if (W <= 0.8) {
      const r = Math.min(0.42, W * 0.48);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(r + 0.02, 44), this.ledGlowMat);
      halo.position.set(0, 1.52, 0.012);
      const mirror = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.02, 44),
        this.mirrorMat
      );
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(0, 1.52, 0.024);
      g.add(halo, mirror);
    } else {
      const mW = W - 0.04;
      const mH = 0.72;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(mW + 0.04, mH + 0.04), this.ledGlowMat);
      halo.position.set(0, 1.52, 0.012);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(mW, mH, 0.022), this.mirrorMat);
      mirror.position.set(0, 1.52, 0.024);
      g.add(halo, mirror);
    }

    // Optional matching tall suspended side column cabinet when Deghi model includes "+ Colonna"
    if (item.hasColumn && W <= 1.05) {
      const colGroup = new THREE.Group();
      colGroup.position.set(W * 0.5 + 0.22, 1.24, 0);
      const colBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.28, 0.24), this.cabinetMaterial);
      colBody.position.set(0, 0, 0.12);
      const colDoor = new THREE.Mesh(new THREE.BoxGeometry(0.295, 1.27, 0.016), this.cabinetMaterial);
      colDoor.position.set(0, 0, 0.248);
      const colHandle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.22, 0.02), this.metalMat);
      colHandle.position.set(-0.115, -0.08, 0.264);
      colGroup.add(colBody, colDoor, colHandle);
      g.add(colGroup);
    }
  }
}
