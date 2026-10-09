/* ==========================================================================
   Live Demo ("View on My Wall") — small 3D maths.
   Loaded only when the Live Demo opens (services/live-demo.js loads this folder).

   Matrices are 4 × 4, column-major Float32Array(16), the layout WebGL and
   WebXR use: m[12], m[13], m[14] is the translation. Vectors are [x, y, z].
   Angles are radians unless a name says "deg".
   ========================================================================== */
(function (FrameX) {
  const EPS = 1e-9;

  /* ---------------------------------------------------------------- vectors */
  const vec = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    length: (a) => Math.hypot(a[0], a[1], a[2]),
    normalize(a) {
      const l = Math.hypot(a[0], a[1], a[2]);
      return l > EPS ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
    },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };

  /* ---------------------------------------------------------------- matrices */
  const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return out;
  }

  /** General inverse. Returns null for a matrix that can't be inverted. */
  function invert(m) {
    const inv = new Float32Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) return null;
    det = 1 / det;
    inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return inv;
  }

  /** Perspective projection (camera looks down −z), fovY across the full height. */
  function perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  /** A pose from three axes (already unit length, at right angles) and a position. */
  function fromBasis(x, y, z, origin = [0, 0, 0]) {
    return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1]);
  }

  const translation = (v) => fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1], v);
  const scaling = (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  function rotationZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  const axis = (m, i) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
  const position = (m) => [m[12], m[13], m[14]];

  /** A point through a matrix (w = 1), with the perspective divide. */
  function transformPoint(m, p) {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return Math.abs(w) > EPS ? [x / w, y / w, z / w, w] : [x, y, z, w];
  }

  /** A direction through a matrix (w = 0: rotation and scale only). */
  const transformDirection = (m, d) => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];

  /** Inverse of a pose made only of a rotation and a translation (cheaper and exact). */
  function invertRigid(m) {
    const x = axis(m, 0);
    const y = axis(m, 1);
    const z = axis(m, 2);
    const t = position(m);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -vec.dot(x, t), -vec.dot(y, t), -vec.dot(z, t), 1]);
  }

  /* ---------------------------------------------------------------- rays and planes */
  /**
   * The ray through a point of the screen. nx, ny are in −1..1 (x to the right, y UP).
   * viewMatrix takes world -> camera, projection camera -> clip. Returns { origin, dir } in world space.
   */
  function screenRay(nx, ny, viewMatrix, projection) {
    const inverse = invert(multiply(projection, viewMatrix));
    if (!inverse) return null;
    const near = transformPoint(inverse, [nx, ny, -1]);
    const far = transformPoint(inverse, [nx, ny, 1]);
    return { origin: near.slice(0, 3), dir: vec.normalize(vec.sub(far, near)) };
  }

  /** Where a ray meets a plane (a point on it + its normal). null when it runs alongside or points away. */
  function rayPlane(ray, point, normal) {
    const denom = vec.dot(ray.dir, normal);
    if (Math.abs(denom) < 1e-5) return null;
    const t = vec.dot(vec.sub(point, ray.origin), normal) / denom;
    return t > 0 ? vec.add(ray.origin, vec.scale(ray.dir, t)) : null;
  }

  /**
   * A wall's own axes from the direction it faces: x runs to the right along the
   * wall (as someone facing it sees it), y is up, z comes out of the wall.
   * `up` is the world's up direction. null when the surface is not upright enough to be a wall.
   */
  function wallPose(point, normal, up, maxLean = 0.5) {
    const n = vec.normalize(normal);
    if (Math.abs(vec.dot(n, up)) > maxLean) return null;
    const z = vec.normalize(vec.sub(n, vec.scale(up, vec.dot(n, up)))); // the normal, made exactly level
    const x = vec.normalize(vec.cross(up, z));
    const y = vec.cross(z, x);
    return fromBasis(x, y, z, point);
  }

  /* ---------------------------------------------------------------- quaternions (for smoothing the motion sensor) */
  function quatFromMatrix(m) {
    // m: rotation as 3 × 3 rows [[r00, r01, r02], …]
    const t = m[0][0] + m[1][1] + m[2][2];
    let q;
    if (t > 0) {
      const s = 0.5 / Math.sqrt(t + 1);
      q = [(m[2][1] - m[1][2]) * s, (m[0][2] - m[2][0]) * s, (m[1][0] - m[0][1]) * s, 0.25 / s];
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
      const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
      q = [0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
    } else if (m[1][1] > m[2][2]) {
      const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
      q = [(m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
    } else {
      const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
      q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s, (m[1][0] - m[0][1]) / s];
    }
    return q;
  }

  function quatSlerp(a, b, t) {
    let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const to = cos < 0 ? b.map((v) => -v) : b;
    cos = Math.abs(cos);
    let ka = 1 - t;
    let kb = t;
    if (cos < 0.9995) {
      const angle = Math.acos(cos);
      const sin = Math.sin(angle);
      ka = Math.sin((1 - t) * angle) / sin;
      kb = Math.sin(t * angle) / sin;
    }
    const q = [a[0] * ka + to[0] * kb, a[1] * ka + to[1] * kb, a[2] * ka + to[2] * kb, a[3] * ka + to[3] * kb];
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return q.map((v) => v / l);
  }

  /** Quaternion -> rotation as three axes (columns): what x, y and z turn into. */
  function quatAxes(q) {
    const [x, y, z, w] = q;
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
      [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
      [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
    ];
  }

  /* ---------------------------------------------------------------- the phone's motion sensor
     deviceorientation gives three angles (W3C: Z-X'-Y'' Euler angles) that turn
     the DEVICE's axes (x right, y to the top of the screen, z out of the screen)
     into the EARTH's (x east, y north, z up). The back camera looks along the
     device's −z, with the screen's "up" as its up, which is exactly a camera's
     own frame when the screen is upright. When the page is turned (landscape),
     the picture's up is another device axis: that is the screenAngle term.

     Returns the camera's rotation as a quaternion (camera -> earth). */
  function cameraQuatFromOrientation(alphaDeg, betaDeg, gammaDeg, screenAngleDeg = 0) {
    const rad = Math.PI / 180;
    const a = (alphaDeg || 0) * rad;
    const b = (betaDeg || 0) * rad;
    const g = (gammaDeg || 0) * rad;
    const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
    // device -> earth (rows)
    const R = [
      [cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG],
      [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
      [-cB * sG, sB, cB * cG],
    ];
    // camera -> device: the screen's right and up, as device directions
    const t = (screenAngleDeg || 0) * rad;
    const cT = Math.cos(t), sT = Math.sin(t);
    const C = [
      [cT, sT, 0],
      [-sT, cT, 0],
      [0, 0, 1],
    ];
    const M = [0, 1, 2].map((r) => [0, 1, 2].map((c) => R[r][0] * C[0][c] + R[r][1] * C[1][c] + R[r][2] * C[2][c]));
    return quatFromMatrix(M);
  }

  FrameX.ldMath = {
    vec,
    identity,
    multiply,
    invert,
    invertRigid,
    perspective,
    fromBasis,
    translation,
    scaling,
    rotationZ,
    axis,
    position,
    transformPoint,
    transformDirection,
    screenRay,
    rayPlane,
    wallPose,
    quatFromMatrix,
    quatSlerp,
    quatAxes,
    cameraQuatFromOrientation,
  };
})((window.FrameX = window.FrameX || {}));
