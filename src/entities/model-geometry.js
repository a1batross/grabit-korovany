import * as THREE from 'three';

// An eight-sided cross-section loft. Dimensions stay explicit so decorative models
// can retain the game's existing collision envelope and articulation pivots.
export function loft(rings, bevel = 0.2) {
  const points = rings.map(([y, w, d, z = 0]) => {
    const x = w / 2, h = d / 2, b = Math.min(w, d) * bevel;
    return [[-x + b, y, z - h], [x - b, y, z - h], [x, y, z - h + b],
      [x, y, z + h - b], [x - b, y, z + h], [-x + b, y, z + h],
      [-x, y, z + h - b], [-x, y, z - h + b]];
  });
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let j = 1; j < points.length; j++) for (let i = 0; i < 8; i++) {
    const k = (i + 1) % 8, a = points[j - 1], b = points[j];
    tri(a[i], b[i], b[k]); tri(a[i], b[k], a[k]);
  }
  for (let i = 0; i < 8; i++) {
    const k = (i + 1) % 8, first = rings[0], last = rings[rings.length - 1];
    tri([0, first[0], first[3] ?? 0], points[0][i], points[0][k]);
    tri([0, last[0], last[3] ?? 0], points.at(-1)[k], points.at(-1)[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// Closed polygon in XY, centered on Z; bevels are real geometry, not textures.
export function plate(points, depth = 0.025, bevel = 0.008) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
