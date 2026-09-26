/**
 * Expanded 4TX / 4RX teaching layout after ISSCC 2025 Paper 10.2 (Fig. 10.2.1).
 * Every functional block is drawn as a chip whose lid carries its schematic
 * symbol, and the 35 GHz network is an explicit 1→2→4→8 tree. Geometry is
 * enlarged for explanation; it is not a dimensioned die or LTCC layout.
 * `flows` lists the signal paths (world space) that the scene animates.
 * WebGL keeps repeated pads instanced; the Canvas2D fallback needs plain meshes.
 */
export function buildHardware(THREE, { expandInstances = true } = {}) {
  const group = new THREE.Group(), modules = {}, packages = [], flows = [];
  group.name = '4TX / 4RX physical array · supplied architecture layout';
  const material = (color, metalness = .25, roughness = .55) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const glow = (color, strength = .5) => { const m = material(color, .3, .45); m.emissive = new THREE.Color(color); m.emissiveIntensity = strength; return m; };
  const M = {
    gold: material(0xd8b665, .72, .3), copper: material(0xc68c45, .72, .35),
    solder: material(0xb8c2ce, .8, .35), dark: material(0x172028, .15, .55),
    body: material(0x1c242d, .25, .5), board: material(0x113d32, .1, .82), strip: material(0x15303c, .1, .8),
    silver: material(0xc5d0da, .8, .35),
    f35: glow(0x2d9fd6), f70: glow(0x8cc84b), f140: glow(0xe0584f), fif: glow(0x4fc4b4, .4),
    fref: glow(0xd9a94f, .4), fdata: glow(0x9d86e6, .4),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const round = new THREE.CylinderGeometry(1, 1, 1, 10);
  const pair = new THREE.Matrix4(), vec = new THREE.Vector3(), quat = new THREE.Quaternion();
  function mesh(parent, geometry, mat, x, y, z, w = 1, h = 1, d = 1) {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z); m.scale.set(w, h, d);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, mat, x, y, z, w, h, d) {
    // Split large planes for the software renderer's triangle depth sorting.
    const g = w > .8 && d > .45
      ? new THREE.BoxGeometry(1, 1, 1, Math.ceil(w / .85), 1, Math.ceil(d / .85)) : cube;
    return mesh(parent, g, mat, x, y, z, w, h, d);
  }
  function cylinder(parent, mat, x, y, z, r, h) { return mesh(parent, round, mat, x, y, z, r, h, r); }
  function batch(parent, geometry, mat, placements) {
    const m = new THREE.InstancedMesh(geometry, mat, placements.length);
    placements.forEach(([x, y, z, w, h, d], i) => {
      pair.compose(vec.set(x, y, z), quat, new THREE.Vector3(w, h, d)); m.setMatrixAt(i, pair);
    }); parent.add(m); return m;
  }
  // Flat Manhattan copper on the board surface; points are [x, z].
  function trace(parent, mat, points, width = .07, y = .012) {
    for (let i = 1; i < points.length; i++) {
      const [x1, z1] = points[i - 1], [x2, z2] = points[i];
      box(parent, mat, (x1 + x2) / 2, y, (z1 + z2) / 2, Math.abs(x2 - x1) + width, .02, Math.abs(z2 - z1) + width);
    }
  }
  // A drawn trace that is also an animated signal path.
  function route(parent, mat, kind, stage, from, to, ch, points, width) {
    trace(parent, mat, points, width);
    flows.push({ kind, stage, from, to, ch, points: points.map(([x, z]) => [x, .07, z]) });
  }
  function cable(parent, mat, kind, stage, from, to, ch, points, radius = .04) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    mesh(parent, new THREE.TubeGeometry(curve, 36, radius, 6, false), mat, 0, 0, 0);
    flows.push({ kind, stage, from, to, ch, points: curve.getPoints(28).map(p => [p.x, p.y + radius * .6, p.z]) });
  }

  // ---- Lid artwork: schematic symbol + abbreviation, drawn once per kind.
  const canDraw = typeof document !== 'undefined';
  const textures = new Map(), FONT = '"Inter","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const shade = (c, target, t) => '#' + new THREE.Color(c).lerp(new THREE.Color(target), t).getHexString();
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function fit(ctx, text, weight, size, maxWidth) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const w = ctx.measureText(text).width;
    if (w > maxWidth) ctx.font = `${weight} ${Math.floor(size * maxWidth / w)}px ${FONT}`;
  }
  function glyph(ctx, kind, cx, cy, s, stroke, factor) {
    const P = (x, y) => [cx + x * s, cy + y * s];
    const path = (...pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(...P(x, y)) : ctx.moveTo(...P(x, y))); ctx.stroke(); };
    const frame = () => { roundRect(ctx, cx - s * .46, cy - s * .46, s * .92, s * .92, s * .13); ctx.stroke(); };
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = stroke; ctx.lineWidth = Math.max(3, s * .07); ctx.lineJoin = ctx.lineCap = 'round';
    const amplifier = () => { path([-.36, -.44], [.44, 0], [-.36, .44], [-.36, -.44]); path([-.56, 0], [-.36, 0]); path([.44, 0], [.58, 0]); };
    const arrow = (x1, y1, x2, y2) => {
      path([x1, y1], [x2, y2]); const a = Math.atan2(y2 - y1, x2 - x1), h = .16;
      path([x2 - h * Math.cos(a - .5), y2 - h * Math.sin(a - .5)], [x2, y2], [x2 - h * Math.cos(a + .5), y2 - h * Math.sin(a + .5)]);
    };
    switch (kind) {
      case 'amp': amplifier(); break;
      case 'vga': amplifier(); arrow(-.34, .5, .26, -.52); break;
      case 'mixer':
        ctx.beginPath(); ctx.arc(cx, cy, s * .4, 0, Math.PI * 2); ctx.stroke();
        path([-.28, -.28], [.28, .28]); path([-.28, .28], [.28, -.28]); path([-.58, 0], [-.4, 0]); path([.4, 0], [.58, 0]); path([0, .4], [0, .58]); break;
      case 'phase':
        ctx.beginPath(); ctx.arc(cx, cy, s * .42, 0, Math.PI * 2); ctx.stroke();
        ctx.font = `italic 600 ${Math.round(s * .62)}px Georgia,"Times New Roman",serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('φ', cx, cy + s * .03); break;
      case 'mult':
        frame(); ctx.font = `700 ${Math.round(s * .4)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('×' + factor, cx, cy + s * .02); break;
      case 'hpf': frame(); path([-.3, .24], [-.12, .24]); ctx.beginPath(); ctx.moveTo(...P(-.12, .24)); ctx.quadraticCurveTo(...P(0, -.24), ...P(.14, -.2)); ctx.lineTo(...P(.3, -.2)); ctx.stroke(); break;
      case 'lpf': frame(); path([-.3, -.2], [-.14, -.2]); ctx.beginPath(); ctx.moveTo(...P(-.14, -.2)); ctx.quadraticCurveTo(...P(0, -.24), ...P(.12, .24)); ctx.lineTo(...P(.3, .24)); ctx.stroke(); break;
      case 'split': {
        // Three binary levels: one input, eight outputs.
        const xs = [-.46, -.2, .06, .3, .48];
        const branch = (level, y, spread) => {
          if (level === 3) { path([xs[3], y], [xs[4], y]); return; }
          path([xs[level], y], [xs[level + 1], y]); path([xs[level + 1], y - spread], [xs[level + 1], y + spread]);
          branch(level + 1, y - spread, spread / 2); branch(level + 1, y + spread, spread / 2);
        };
        ctx.lineWidth = Math.max(2, s * .045); branch(0, 0, .24); break;
      }
      case 'pll': path([-.46, .28], [-.16, -.28], [-.16, .28], [.14, -.28], [.14, .28], [.44, -.28]); break;
      case 'sine': ctx.beginPath(); for (let i = 0; i <= 40; i++) { const x = -.44 + i * .022; i ? ctx.lineTo(...P(x, -.26 * Math.sin(i / 40 * Math.PI * 4))) : ctx.moveTo(...P(x, 0)); } ctx.stroke(); break;
      case 'square': path([-.46, .22], [-.3, .22], [-.3, -.22], [-.08, -.22], [-.08, .22], [.14, .22], [.14, -.22], [.36, -.22], [.36, .22], [.46, .22]); break;
      case 'adc': path([-.42, .36], [-.42, .2], [-.22, .2], [-.22, .02], [-.02, .02], [-.02, -.16], [.18, -.16], [.18, -.34], [.4, -.34]); break;
      case 'dsp': {
        ctx.lineWidth = Math.max(4, s * .09);
        [.1, .16, .3, .74, .34, .18, .12, .08].forEach((h, i) => path([-.42 + i * .12, .38], [-.42 + i * .12, .38 - h * .76]));
        break;
      }
      case 'reg': frame(); for (const y of [-.2, 0, .2]) { path([-.62, y], [-.46, y]); path([.46, y], [.62, y]); } break;
    }
    ctx.restore();
  }
  function lidTexture(spec, color, w, d) {
    if (!canDraw) return null;
    const key = [spec.glyph, spec.text, spec.sub, spec.factor, color, (w / d).toFixed(2)].join('|');
    if (textures.has(key)) return textures.get(key);
    const W = 512, H = Math.round(W * d / w), c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), accent = shade(color, 0xffffff, .3);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, shade(color, 0x091017, .6)); bg.addColorStop(1, shade(color, 0x091017, .8));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = shade(color, 0x091017, .2); ctx.lineWidth = 9; roundRect(ctx, 10, 10, W - 20, H - 20, 24); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(34, 34, 7, 0, Math.PI * 2); ctx.fill(); // pin-1 mark
    const wide = W / H > 1.25;
    const s = wide ? H * .6 : Math.min(W * .56, H * .46), gx = wide ? H * .52 : W / 2, gy = wide ? H / 2 : H * .35;
    glyph(ctx, spec.glyph, gx, gy, s, accent, spec.factor);
    const tx = wide ? H * .98 : W / 2, maxWidth = wide ? W - tx - 26 : W - 50;
    ctx.textAlign = wide ? 'left' : 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f3f8fc';
    const size = wide ? Math.min(H * .3, 120) : H * .2;
    fit(ctx, spec.text, 700, size, maxWidth); ctx.fillText(spec.text, tx, wide ? (spec.sub ? H * .5 : H * .6) : H * .77);
    if (spec.sub) {
      ctx.fillStyle = shade(color, 0xffffff, .5);
      fit(ctx, spec.sub, 500, size * .5, maxWidth); ctx.fillText(spec.sub, tx, wide ? H * .74 : H * .91);
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    textures.set(key, map); return map;
  }
  function decal(parent, map, x, y, z, w, d, transparent = false) {
    if (!map) return null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent, depthWrite: !transparent }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    m.userData.webglOnly = true; // The Canvas2D fallback keeps the plain lid colour.
    parent.add(m); return m;
  }
  // A package body, coloured lid, printed artwork and gold pads on both long sides.
  function chip(parent, x, z, w, d, spec, color, h = .2) {
    box(parent, M.body, x, h / 2, z, w, h, d);
    box(parent, material(new THREE.Color(color).lerp(new THREE.Color(0x091017), .55), .35, .45), x, h + .012, z, w - .06, .024, d - .06);
    decal(parent, lidTexture(spec, color, w - .1, d - .1), x, h + .026, z, w - .1, d - .1);
    const n = Math.max(2, Math.round((w - .16) / .2)), pads = [], pitch = (w - .26) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) for (const side of [-1, 1]) pads.push([x - (w - .26) / 2 + i * pitch, .018, z + side * (d / 2 + .04), .075, .036, .09]);
    batch(parent, cube, M.gold, pads);
  }

  function module(id, parent, anchor, color, short) {
    const g = new THREE.Group(); g.name = short; g.userData.module = id; parent.add(g);
    modules[id] = { id, group: g, anchor: new THREE.Vector3(...anchor), color, short, channels: [] };
    return g;
  }
  function channel(id, index, x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.userData.channel = index + 1; g.userData.module = id; g.userData.baseY = 0; g.baseY = 0; packages.push(g);
    modules[id].group.add(g);
    modules[id].channels.push(new THREE.Vector3(x, .55, z));
    return g;
  }

  const pkg = module('package', group, [0, -.12, 1.05], 0x397d65, 'Physical array carrier');
  box(pkg, M.board, 0, -.17, 1.05, 22, .34, 14.9);
  for (const x of [-10.55, 10.55]) for (const z of [-5.95, 8.05]) {
    cylinder(pkg, M.gold, x, .015, z, .22, .045); cylinder(pkg, M.dark, x, .045, z, .115, .025);
    cylinder(pkg, M.solder, x, -.60, z, .13, .50);
  }
  const dieGroup = group; // Expanded teaching components, not a miniature die.

  // Silkscreen: zone names printed on the carrier so the layout reads without clicking.
  if (canDraw) {
    const W = 1760, H = Math.round(W * 14.9 / 22), c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), u = x => (x + 11) / 22 * W, v = z => (z + 6.4) / 14.9 * H, k = W / 22;
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 3; roundRect(ctx, 14, 14, W - 28, H - 28, 22); ctx.stroke();
    const print = (text, x, z, size, color = '#e8f2ee', align = 'left') => {
      ctx.font = `600 ${size * k}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, u(x), v(z));
    };
    print('RX 接收链 ×4  ▸  天线 → LNA → 混频 → IF', -10.1, -5.98, .3, '#9fe6d6');
    print('TX 发射链 ×4  ▸  VGA → 相移 → ×4 → PA → 天线', 1.75, -5.98, .3, '#f4c49a');
    print('35 GHz 1 : 8 分配', 0, -.78, .2, '#9fd4f2', 'center');
    print('LTCC 封装 · 4TX-4RX 收发阵列（功能放大示意）', -10.1, 8.15, .26, '#ffffff66');
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    decal(pkg, map, 0, .004, 1.05, 22, 14.9, true);
  }

  // Placement follows Fig. 10.2.1: RX column left, central 35 GHz tree,
  // four TX rows right, synthesizer below.
  const rows = [-4.8, -1.6, 1.6, 4.8];
  const X = { lna: -7.745, mixer: -5.995, if: -3.585, vga: 2.45, vmps: 4.2, mult: 5.95, pa: 7.8 };
  const TXW = 1.35, TXD = 1.2, PAW = 1.5, LNAW = 1.4, MIXW = 1.3, IFW = .62, IFP = .7;
  const LO = 1.45; // RX LO doubler sits below its mixer, as in the paper diagram.
  const addDieModule = (id, x, z, color, title) => {
    const g = module(id, dieGroup, [x, .65, z], color, title);
    modules[id].onDie = true;
    return g;
  };
  const pll = addDieModule('pll', 2.8, 7.0, 0xaa92df, '35 GHz FMCW synthesizer');
  chip(pll, 2.8, 7.0, 3.5, 1.6, { glyph: 'pll', text: 'FMCW 合成器', sub: 'PLL · 线性扫频 chirp' }, 0xaa92df, .26);
  pll.userData.baseY = 0; pll.baseY = 0; packages.push(pll);

  const splitter = addDieModule('splitter', 0, 0, 0x76b6d4, '35 GHz DA + 1:8 distribution');
  chip(splitter, 0, 5.6, .8, .7, { glyph: 'amp', text: 'DA', sub: '驱动放大' }, 0x76b6d4);
  chip(splitter, 0, 0, .9, .9, { glyph: 'split', text: '1 : 8', sub: '功率分配' }, 0x76b6d4);
  route(splitter, M.f35, 'lo35', 2, 'pll', 'splitter', null, [[1.05, 7], [0, 7], [0, 5.95]], .085);
  route(splitter, M.f35, 'lo35', 2, 'splitter', 'splitter', null, [[0, 5.25], [0, .45]], .085);
  const node = (x, z) => { cylinder(splitter, M.gold, x, .03, z, .085, .05); };
  for (const s of [-1, 1]) {
    node(.9, 3.2 * s); node(1.4, 3.2 * s);
    node(-.9, s < 0 ? -1.75 : 4.65); node(-1.6, s < 0 ? -1.75 : 4.65);
  }
  node(.9, 0); node(-.9, 0);

  addDieModule('vga', X.vga, 0, 0x74afd2, '35 GHz VGA');
  addDieModule('vmps', X.vmps, 0, 0xa991d4, '35 GHz 90° VMPS');
  addDieModule('mult', X.mult, 0, 0xc394cf, '35 → 70 → 140 GHz ×4');
  addDieModule('pa', X.pa, 0, 0xe49b61, '140 GHz 2-way 3-stage PA');
  addDieModule('lna', X.lna, 0, 0x65b7a6, '140 GHz 4-stage LNA');
  addDieModule('mixer', X.mixer, 0, 0x77bdad, 'Passive differential SHM');
  addDieModule('doubler', X.mixer, LO, 0xa695ce, 'RX 35 → 70 GHz doubler');
  addDieModule('if', X.if, 0, 0x71b8ac, 'TIA · HPF · PGA · 6th-order LPF');
  rows.forEach((z, ch) => {
    const up = z < 0 ? -1 : 1;
    // 35 GHz tree: TX half on the right, RX LO half on the left.
    const txNode = 3.2 * up, rxNode = z < 0 ? -1.75 : 4.65;
    route(splitter, M.f35, 'lo35', 2, 'splitter', 'vga', ch, [[.45, 0], [.9, 0], [.9, txNode], [1.4, txNode], [1.4, z], [X.vga - TXW / 2, z]], .07);
    route(splitter, M.f35, 'lo35', 2, 'splitter', 'doubler', ch, [[-.45, 0], [-.9, 0], [-.9, rxNode], [-1.6, rxNode], [-1.6, z + LO], [X.mixer + .55, z + LO]], .07);

    chip(channel('lna', ch, X.lna, z), 0, 0, LNAW, TXD, { glyph: 'amp', text: 'LNA', sub: '低噪声放大' }, 0x65b7a6);
    chip(channel('mixer', ch, X.mixer, z), 0, 0, MIXW, TXD, { glyph: 'mixer', text: 'SHM', sub: '次谐波混频' }, 0x77bdad);
    chip(channel('doubler', ch, X.mixer, z + LO), 0, 0, 1.1, .8, { glyph: 'mult', factor: 2, text: 'LO', sub: '二倍频' }, 0xa695ce);
    const iff = channel('if', ch, X.if, z);
    [['amp', 'TIA', '跨阻放大'], ['hpf', 'HPF', '高通'], ['vga', 'PGA', '程控增益'], ['lpf', 'LPF', '6 阶低通']]
      .forEach(([g, text, sub], i) => chip(iff, (i - 1.5) * IFP, 0, IFW, .9, { glyph: g, text, sub }, 0x71b8ac));
    chip(channel('vga', ch, X.vga, z), 0, 0, TXW, TXD, { glyph: 'vga', text: 'VGA', sub: '幅度控制' }, 0x74afd2);
    chip(channel('vmps', ch, X.vmps, z), 0, 0, TXW, TXD, { glyph: 'phase', text: 'VMPS', sub: '矢量相移' }, 0xa991d4);
    chip(channel('mult', ch, X.mult, z), 0, 0, TXW, TXD, { glyph: 'mult', factor: 4, text: '倍频', sub: '四倍频' }, 0xc394cf);
    chip(channel('pa', ch, X.pa, z), 0, 0, PAW, 1.25, { glyph: 'amp', text: 'PA', sub: '功率放大' }, 0xe49b61, .24);

    // Board traces coloured by frequency: blue 35 GHz, green 70 GHz, red 140 GHz.
    route(pkg, M.f35, 'lo35', 3, 'vga', 'vmps', ch, [[X.vga + TXW / 2, z], [X.vmps - TXW / 2, z]]);
    route(pkg, M.f35, 'lo35', 3, 'vmps', 'mult', ch, [[X.vmps + TXW / 2, z], [X.mult - TXW / 2, z]]);
    route(pkg, M.f140, 'rf', 4, 'mult', 'pa', ch, [[X.mult + TXW / 2, z], [X.pa - PAW / 2, z]]);
    route(pkg, M.f140, 'rf', 6, 'lna', 'mixer', ch, [[X.lna + LNAW / 2, z], [X.mixer - MIXW / 2, z]]);
    route(pkg, M.f70, 'lo70', 7, 'doubler', 'mixer', ch, [[X.mixer, z + LO - .4], [X.mixer, z + TXD / 2]]);
    route(pkg, M.fif, 'if', 8, 'mixer', 'if', ch, [[X.mixer + MIXW / 2, z], [X.if - 1.5 * IFP - IFW / 2, z]]);
    for (let i = 0; i < 3; i++) trace(pkg, M.fif, [[X.if + (i - 1.5) * IFP + IFW / 2, z], [X.if + (i - .5) * IFP - IFW / 2, z]]);
    flows.push({ kind: 'if', stage: 8, from: 'if', to: 'if', ch, points: [[X.if - 1.3, .27, z], [X.if + 1.3, .27, z]] });
  });

  // 4 RX units left + 4 TX units right, each SIW cavity with THREE patches.
  const labelTexture = (text, color) => {
    if (!canDraw) return null;
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0c141b'; ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = shade(color, 0xffffff, .2); ctx.fillRect(0, 0, 10, 96);
    ctx.font = `700 58px ${FONT}`; ctx.fillStyle = '#f3f8fc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 136, 50);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; return map;
  };
  function antenna(id, side, color) {
    const antX = side > 0 ? 9.8 : -9.7, tag = side > 0 ? 'TX' : 'RX';
    const g = module(id, group, [antX, .28, 0], color, `${tag} 1×4 cavity-backed AiP`);
    rows.forEach((z, ch) => {
      const unit = new THREE.Group(); unit.position.set(antX, 0, z); unit.userData.channel = ch + 1; g.add(unit);
      modules[id].channels.push(new THREE.Vector3(antX, .10, z));
      const bed = box(unit, M.dark, 0, .013, 0, 1.61, .025, 2.00);
      bed.geometry = new THREE.BoxGeometry(1, 1, 1, 5, 1, 6);
      // Conductive cavity rim and top-three-patch loading.
      for (const zz of [-.97, .97]) box(unit, M.gold, 0, .039, zz, 1.63, .026, .055);
      for (const xx of [-.79, .79]) box(unit, M.gold, xx, .039, 0, .055, .026, 1.95);
      for (const pz of [-.49, 0, .49]) box(unit, M.gold, 0, .06, pz, 1.22, .032, .23);
      const fence = [];
      for (const xx of [-.85, .85]) for (const zz of [-.90, -.45, 0, .45, .90]) fence.push([xx, -.03, zz, .046, .21, .046]);
      batch(unit, round, M.copper, fence);
      box(unit, M.dark, 0, .03, 1.2, .9, .03, .34);
      decal(unit, labelTexture(`${tag}${ch + 1}`, color), 0, .047, 1.2, .86, .3);
      // GSG launch between the PA / LNA and the antenna feed.
      const [start, end] = side > 0 ? [X.pa + PAW / 2, antX - .805] : [antX + .805, X.lna - LNAW / 2];
      for (const off of [-.12, .12]) trace(g, M.copper, [[start, z + off], [end, z + off]], .03);
      if (side > 0) route(g, M.f140, 'rf', 4, 'pa', 'txant', ch, [[start, z], [end, z]], .06);
      else route(g, M.f140, 'rf', 6, 'rxant', 'lna', ch, [[start, z], [end, z]], .06);
    });
    return g;
  }
  const rxAntenna = antenna('rxant', -1, 0x75c4b2);
  const txAntenna = antenna('txant', 1, 0xeeb36c);

  // Shared SPI / LDO / ESD live along the top edge, as in the supplied drawing.
  const power = module('power', group, [-3.4, .60, -5.98], 0xbca270, 'SPI · LDO · ESD');
  [[-4.3, 'SPI', '配置'], [-2.8, 'LDO', '稳压'], [.8, 'ESD', '保护']]
    .forEach(([x, text, sub]) => chip(power, x, -5.95, 1.2, .56, { glyph: 'reg', text, sub }, 0xbca270));

  // External reference and acquisition strip, deliberately apart from the RF array.
  box(pkg, M.strip, -.4, -.14, 10.75, 16.8, .25, 2.35);
  const ref = module('ref', group, [-6.7, .62, 10.7], 0xcbd5dc, 'External reference');
  chip(ref, -6.7, 10.7, 1.4, .98, { glyph: 'sine', text: 'REF', sub: '外部参考' }, 0xb9c4cc, .3);
  const sample = module('sample', group, [-4.15, .64, 10.7], 0x9c8dca, 'ADC sampling clock');
  chip(sample, -4.15, 10.7, 1.35, .93, { glyph: 'square', text: 'CLK', sub: '采样时钟' }, 0x9c8dca, .3);
  const adc = module('adc', group, [-1.30, .64, 10.7], 0xd1b777, 'External ADC');
  chip(adc, -1.3, 10.7, 2.35, 1.34, { glyph: 'adc', text: 'ADC ×4', sub: '差分 IF 采样' }, 0xd1b777, .34);
  const dsp = module('dsp', group, [3.0, .78, 10.7], 0x7aa6c8, 'External FPGA / DSP');
  chip(dsp, 3, 10.7, 2.3, 1.62, { glyph: 'dsp', text: 'FPGA / DSP', sub: '距离 · 速度 FFT' }, 0x7aa6c8, .42);
  route(pkg, M.fref, 'ref', 9, 'ref', 'sample', null, [[-6.0, 10.7], [-4.825, 10.7]], .06);
  route(pkg, M.fref, 'ref', 9, 'sample', 'adc', null, [[-3.475, 10.7], [-2.475, 10.7]], .06);
  route(pkg, M.fdata, 'data', 9, 'adc', 'dsp', null, [[-.125, 10.55], [1.85, 10.55]], .09);
  // Cables between the boards: reference in, four differential IF outputs, chirp trigger.
  cable(pkg, M.fref, 'ref', 1, 'ref', 'pll', null, [[-6.7, .32, 10.2], [-6.2, 1.1, 9.4], [-2, 1.5, 8.6], [1.6, .9, 8.1], [2.0, .3, 7.82]]);
  cable(pkg, M.fdata, 'data', 9, 'dsp', 'pll', null, [[3.6, .44, 9.9], [3.6, .95, 8.9], [3.6, .3, 7.82]], .035);
  rows.forEach((z, ch) => cable(pkg, M.fif, 'if', 9, 'if', 'adc', ch, [
    [X.if + 1.37, .12, z], [X.if + 1.65, .55, z], [-2.05 + ch * .14, 1.0 + ch * .1, (z + 10) / 2 + 1.5], [-2.15 + ch * .28, .9, 9.55], [-2.15 + ch * .28, .36, 10.1],
  ], .032));

  const target = module('target', group, [12.8, 5, -1], 0xdce4eb, 'Corner reflector target');
  target.position.set(12.8, 5, -1);
  const reflector = new THREE.Group(); target.add(reflector);
  // Open octant points down toward the coplanar antenna surface (+Y boresight).
  reflector.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 1, 1).normalize(), new THREE.Vector3(-12.8, -5, 1).normalize());
  const rmat = material(0xcbd5de, .78, .38); rmat.side = THREE.DoubleSide;
  box(reflector, rmat, -.72, .72, 0, 1.44, 1.44, .035);
  box(reflector, rmat, 0, .72, .72, .035, 1.44, 1.44);
  box(reflector, rmat, -.72, 0, .72, 1.44, .035, 1.44);
  const edge = [[-1.44, 0, 0], [-1.44, 1.44, 0], [0, 1.44, 0], [0, 1.44, 1.44], [0, 0, 1.44], [-1.44, 0, 1.44], [-1.44, 0, 0]];
  for (let i = 1; i < edge.length; i++) {
    const a = new THREE.Vector3(...edge[i - 1]), b = new THREE.Vector3(...edge[i]), delta = b.clone().sub(a), c = a.clone().add(b).multiplyScalar(.5);
    const m = box(reflector, M.silver, c.x, c.y, c.z, .035, .035, delta.length());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
  }

  // Isolate highlight materials by module; preserve per-channel pick metadata.
  for (const [id, data] of Object.entries(modules)) {
    // Public world-space path endpoints for each of the four physical channels.
    data.anchors = data.channels;
    const local = new Map();
    data.group.traverse(obj => {
      obj.userData.module = id;
      if (obj.userData.channel == null) {
        let p = obj.parent;
        while (p && p !== data.group) { if (p.userData.channel != null) { obj.userData.channel = p.userData.channel; break; } p = p.parent; }
      }
      if (obj.isMesh) {
        if (!local.has(obj.material)) local.set(obj.material, obj.material.clone());
        obj.material = local.get(obj.material);
      }
    });
  }
  // Software painter and raycaster support: expand instances into simple meshes.
  const instanced = []; if (expandInstances) group.traverse(o => { if (o.isInstancedMesh) instanced.push(o); });
  for (const original of instanced) {
    const container = new THREE.Group(); container.position.copy(original.position);
    container.quaternion.copy(original.quaternion); container.scale.copy(original.scale);
    container.userData = { ...original.userData };
    for (let i = 0; i < original.count; i++) {
      const m = new THREE.Mesh(original.geometry, original.material), local = new THREE.Matrix4();
      original.getMatrixAt(i, local); m.applyMatrix4(local); m.userData = { ...original.userData };
      m.castShadow = m.receiveShadow = true; container.add(m);
    }
    original.parent.add(container); original.parent.remove(original);
  }
  modules.splitter.onDie = false; // The shared distribution tree stays on the carrier.
  group.updateMatrixWorld(true);
  group.userData.description = 'Expanded physical teaching arrangement follows the supplied 4TX/4RX architecture. No exact package dimensions implied.';
  group.userData.packageBounds = { x: [-11, 11], z: [-6.4, 8.5] };
  group.userData.view = { camera: [0, 34, 24], target: [.7, 0, 2.2] };
  group.userData.externalBoard = 'Separate illustrative acquisition/control strip; ADC and DSP are outside the RF array.';
  group.userData.targetOffset = [12.8, 5, -1];
  return { group, modules, packages, flows, txAntenna, rxAntenna, target, dieGroup };
}
