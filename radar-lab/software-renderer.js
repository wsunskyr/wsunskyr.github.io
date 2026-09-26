import * as THREE from './vendor/three.module.js';

/** Canvas2D fallback with a real per-pixel depth buffer.
 * collect() retains the previous screen-command interface. rasterize() and
 * renderToBuffer() also work in Node without a canvas or ImageData global.
 */
export class SoftwareRenderer {
  constructor(canvas) {
    this.domElement = canvas;
    this.ctx = canvas?.getContext('2d');
    this.width = 900; this.height = 560; this.pixelRatio = 1; this.calls = 0;
    this.pixels = null; this.depthBuffer = null; this.imageData = null;
  }
  setPixelRatio() { this.pixelRatio = 1; }
  setSize(w, h) {
    this.width = Math.max(1, Math.round(w)); this.height = Math.max(1, Math.round(h));
    if (this.domElement) {
      this.domElement.width = this.width; this.domElement.height = this.height;
      if (this.domElement.style) {
        this.domElement.style.width = this.width + 'px';
        this.domElement.style.height = this.height + 'px';
      }
    }
    this.imageData = null;
  }
  collect(scene, camera) {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const commands = [], vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normal = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), center = new THREE.Vector3();
    const eye = camera.getWorldPosition(new THREE.Vector3()), light = new THREE.Vector3(-.25, 1, .5).normalize();
    const fallback = new THREE.Color('#dddddd');
    const screen = p => [(p.x * .5 + .5) * this.width, (-p.y * .5 + .5) * this.height, p.z];
    scene.traverseVisible(obj => {
      if (obj.type === 'GridHelper' || obj.userData.webglOnly || !obj.geometry || (!obj.isMesh && !obj.isLine)) return;
      const geo = obj.geometry, attr = geo.attributes.position;
      if (!attr) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat || !mat.visible || mat.opacity < .035) return;
      const color = (mat.color || fallback).clone().convertLinearToSRGB();
      const rgb = shade => [Math.min(255, Math.round(color.r * 255 * shade)),
        Math.min(255, Math.round(color.g * 255 * shade)), Math.min(255, Math.round(color.b * 255 * shade))];
      const append = (kind, points, shade, depth) => {
        const value = rgb(shade);
        commands.push({ kind, points, depth, rgb: value, color: `rgb(${value.join(',')})`,
          alpha: mat.opacity, width: mat.linewidth || 1.4,
          depthTest: mat.depthTest !== false, depthWrite: mat.depthWrite !== false });
      };
      if (obj.isLine) {
        const step = obj.isLineSegments ? 2 : 1;
        for (let i = 0; i < attr.count - 1; i += step) {
          a.fromBufferAttribute(attr, i).applyMatrix4(obj.matrixWorld).applyMatrix4(vp);
          b.fromBufferAttribute(attr, i + 1).applyMatrix4(obj.matrixWorld).applyMatrix4(vp);
          if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) continue;
          append('line', [screen(a), screen(b)], 1, (a.z + b.z) / 2);
        }
        return;
      }
      const idx = geo.index, count = idx ? idx.count : attr.count;
      for (let i = 0; i < count; i += 3) {
        a.fromBufferAttribute(attr, idx ? idx.getX(i) : i).applyMatrix4(obj.matrixWorld);
        b.fromBufferAttribute(attr, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(obj.matrixWorld);
        c.fromBufferAttribute(attr, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(obj.matrixWorld);
        ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac).normalize();
        center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
        const front = normal.dot(ac.subVectors(eye, center));
        if (front <= 0 && mat.side !== THREE.DoubleSide) continue;
        if (front < 0) normal.negate();
        let shade = mat.isMeshBasicMaterial ? 1 : .43 + .57 * Math.max(0, normal.dot(light));
        if (mat.emissive) shade += Math.min(.28, mat.emissiveIntensity * .2);
        a.applyMatrix4(vp); b.applyMatrix4(vp); c.applyMatrix4(vp);
        if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1 || c.z < -1 || c.z > 1) continue;
        append('tri', [screen(a), screen(b), screen(c)], shade, (a.z + b.z + c.z) / 3);
      }
    });
    // Only transparency needs ordering; opaque visibility is decided per pixel.
    commands.sort((a, b) => b.depth - a.depth);
    return commands;
  }
  _ensureBuffers() {
    const count = this.width * this.height;
    if (!this.pixels || this.pixels.length !== count * 4) {
      this.pixels = new Uint8ClampedArray(count * 4);
      // Float64 retains precision where thin metal lies close to a large plane.
      this.depthBuffer = new Float64Array(count);
      this.imageData = null;
    }
  }
  _color(command) {
    if (command.rgb) return command.rgb;
    const match = String(command.color || '').match(/[\d.]+/g);
    return match && match.length >= 3 ? match.slice(0, 3).map(Number) : [220, 220, 220];
  }
  _blend(index, r, g, b, alpha) {
    const data = this.pixels, p = index * 4;
    if (alpha >= .999) { data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255; return; }
    const oldAlpha = data[p + 3] / 255, remaining = oldAlpha * (1 - alpha), outAlpha = alpha + remaining;
    if (outAlpha <= 0) return;
    data[p] = (r * alpha + data[p] * remaining) / outAlpha;
    data[p + 1] = (g * alpha + data[p + 1] * remaining) / outAlpha;
    data[p + 2] = (b * alpha + data[p + 2] * remaining) / outAlpha;
    data[p + 3] = outAlpha * 255;
  }
  _triangle(cmd, writeDepth) {
    const [a, b, c] = cmd.points, w = this.width, h = this.height;
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return;
    const x0 = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) - .5));
    const x1 = Math.min(w - 1, Math.floor(Math.max(a[0], b[0], c[0]) - .5));
    const y0 = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) - .5));
    const y1 = Math.min(h - 1, Math.floor(Math.max(a[1], b[1], c[1]) - .5));
    if (x1 < x0 || y1 < y0) return;
    const inv = 1 / denominator, ax = (b[1] - c[1]) * inv, ay = (c[0] - b[0]) * inv;
    const bx = (c[1] - a[1]) * inv, by = (a[0] - c[0]) * inv;
    const px = x0 + .5, py = y0 + .5;
    let ar = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) * inv;
    let br = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) * inv;
    const az = a[2] - c[2], bz = b[2] - c[2];
    const dzx = az * ax + bz * bx, dzy = az * ay + bz * by;
    let zr = c[2] + ar * az + br * bz;
    const [red, green, blue] = this._color(cmd), alpha = Math.max(0, Math.min(1, cmd.alpha ?? 1));
    const depthTest = cmd.depthTest !== false, depth = this.depthBuffer, data = this.pixels;
    const opaque = alpha >= .999;
    for (let y = y0; y <= y1; y++, ar += ay, br += by, zr += dzy) {
      let u = ar, v = br, z = zr, index = y * w + x0;
      for (let x = x0; x <= x1; x++, u += ax, v += bx, z += dzx, index++) {
        if (u < -1e-8 || v < -1e-8 || u + v > 1.00000001 || z < -1 || z > 1) continue;
        if (depthTest && z > depth[index] + 1e-10) continue;
        if (opaque) {
          const p = index * 4; data[p] = red; data[p + 1] = green; data[p + 2] = blue; data[p + 3] = 255;
        } else this._blend(index, red, green, blue, alpha);
        if (writeDepth) depth[index] = z;
      }
    }
  }
  _line(cmd) {
    const [a, b] = cmd.points, dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    const radius = Math.max(.45, (cmd.width || 1.4) / 2), margin = radius + .5;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - margin));
    const x1 = Math.min(this.width - 1, Math.ceil(Math.max(a[0], b[0]) + margin));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - margin));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(a[1], b[1]) + margin));
    const [red, green, blue] = this._color(cmd), alpha = Math.max(0, Math.min(1, cmd.alpha ?? 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = length2 > 1e-12 ? Math.max(0, Math.min(1, ((x + .5 - a[0]) * dx + (y + .5 - a[1]) * dy) / length2)) : 0;
      const sx = a[0] + t * dx, sy = a[1] + t * dy;
      const distance = Math.hypot(x + .5 - sx, y + .5 - sy);
      const coverage = Math.max(0, Math.min(1, margin - distance));
      if (!coverage) continue;
      const z = a[2] + t * (b[2] - a[2]), index = y * this.width + x;
      if (z < -1 || z > 1 || (cmd.depthTest !== false && z > this.depthBuffer[index] + 2e-8)) continue;
      this._blend(index, red, green, blue, alpha * coverage);
    }
  }
  rasterize(commands, options = {}) {
    this._ensureBuffers(); this.pixels.fill(0); this.depthBuffer.fill(Infinity);
    const background = options.background;
    if (background) {
      for (let p = 0; p < this.pixels.length; p += 4) {
        this.pixels[p] = background[0]; this.pixels[p + 1] = background[1];
        this.pixels[p + 2] = background[2]; this.pixels[p + 3] = background[3] ?? 255;
      }
    }
    // Solid geometry first. Its z buffer clips both rear wires and particles.
    for (const cmd of commands) if (cmd.kind === 'tri' && (cmd.alpha ?? 1) >= .999 && cmd.depthTest !== false)
      this._triangle(cmd, cmd.depthWrite !== false);
    // Transparent physical surfaces retain the collect() back-to-front order.
    for (const cmd of commands) if (cmd.kind === 'tri' && (cmd.alpha ?? 1) < .999 && cmd.depthTest !== false)
      this._triangle(cmd, false);
    for (const cmd of commands) if (cmd.kind === 'line' && cmd.depthTest !== false) this._line(cmd);
    // Explicit overlays, such as the selection cage, intentionally ignore z.
    for (const cmd of commands) if (cmd.depthTest === false) {
      if (cmd.kind === 'line') this._line(cmd); else this._triangle(cmd, false);
    }
    this.calls = commands.length;
    return { width: this.width, height: this.height, data: this.pixels, depth: this.depthBuffer };
  }
  renderToBuffer(scene, camera, options = {}) { return this.rasterize(this.collect(scene, camera), options); }
  render(scene, camera) {
    const frame = this.renderToBuffer(scene, camera);
    if (!this.ctx) return frame;
    if (!this.imageData || this.imageData.width !== this.width || this.imageData.height !== this.height)
      this.imageData = this.ctx.createImageData(this.width, this.height);
    this.imageData.data.set(frame.data);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.putImageData(this.imageData, 0, 0);
    return frame;
  }
  dispose() { this.pixels = this.depthBuffer = this.imageData = null; }
}
