/* ==========================================================================
   Live Demo ("View on My Wall") — the renderer.

   Draws the piece as it hangs on a wall: for every part of it (one frame, or
   each panel of a set) a thin box with the painted picture on its front, the
   frame's colour on its four sides, and a soft shadow on the wall behind it.

   Units are metres. The piece's own space is the wall's: x to the right, y up,
   z out of the wall. The back of the box touches the wall (z = 0), its front
   is `depth` in front of it. Whoever calls draw() supplies the camera:
     model       piece space -> world        (where on the wall, turned, resized)
     view        world -> camera
     projection  camera -> screen
   The same code draws into the page (camera mode) and into a WebXR session
   (AR mode); only the matrices and the target differ.

   A 3D model (.glb) per product can replace the box later: everything that
   places and lights the piece stays the same (see subject.model in ld-subject.js).

   create(canvas, { xr })  -> renderer | null when the device has no WebGL
   flat(canvas)            -> a plain 2D renderer for such devices (no perspective)
   ========================================================================== */
(function (FrameX) {
  const M = () => FrameX.ldMath;

  const VERT = `
    attribute vec3 aPos;
    attribute vec2 aUv;
    attribute vec3 aNormal;
    uniform mat4 uMvp;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = aUv;
      vNormal = aNormal;
      gl_Position = uMvp * vec4(aPos, 1.0);
    }`;

  // Front: the painted picture. Sides: the frame's colour, lighter on top and darker underneath (light comes from above).
  const FRAG_BOX = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform vec3 uSide;
    uniform float uLight;
    uniform float uAlpha;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vec3 color;
      if (vNormal.z > 0.5) {
        color = texture2D(uTex, vUv).rgb;
      } else {
        float shade = 0.60 + 0.30 * vNormal.y + 0.05 * vNormal.x;
        color = uSide * shade;
      }
      gl_FragColor = vec4(color * uLight, 1.0) * uAlpha;
    }`;

  // A soft shadow on the wall: how far each point is from the piece's outline, faded out over uBlur metres.
  const FRAG_SHADOW = `
    precision mediump float;
    uniform vec2 uSize;
    uniform vec2 uHalf;
    uniform float uBlur;
    uniform float uStrength;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vec2 d = abs(vNormal.xy * uSize) - uHalf;
      float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      float a = uStrength * (1.0 - smoothstep(-uBlur * 0.3, uBlur, dist));
      gl_FragColor = vec4(0.0, 0.0, 0.0, a);
    }`;

  // The aiming mark in AR, before the piece is placed: a ring lying on the surface the phone found.
  const FRAG_RING = `
    precision mediump float;
    uniform vec3 uSide;
    uniform float uAlpha;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      float ring = smoothstep(0.70, 0.76, r) * (1.0 - smoothstep(0.94, 1.0, r));
      float dot = 1.0 - smoothstep(0.08, 0.12, r);
      float a = max(ring, dot) * uAlpha;
      gl_FragColor = vec4(uSide * a, a);
    }`;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(shader));
    return shader;
  }

  function program(gl, frag, names) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
    ["aPos", "aUv", "aNormal"].forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("program: " + gl.getProgramInfoLog(p));
    const uniforms = {};
    names.forEach((n) => (uniforms[n] = gl.getUniformLocation(p, n)));
    return { p, uniforms };
  }

  /* A box 1 × 1 across, centred on x and y, from z = 0 (the wall) to z = 1 (the front).
     Five faces (no back). Each vertex: position, picture coordinate, the way its face looks. */
  function boxMesh() {
    const v = [];
    const quad = (corners, normal, uvs) => {
      [0, 1, 2, 0, 2, 3].forEach((i) => v.push(...corners[i], ...(uvs ? uvs[i] : [0, 0]), ...normal));
    };
    const h = 0.5;
    quad([[-h, -h, 1], [h, -h, 1], [h, h, 1], [-h, h, 1]], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]); // front
    quad([[-h, h, 0], [-h, h, 1], [h, h, 1], [h, h, 0]], [0, 1, 0]); // top
    quad([[-h, -h, 0], [h, -h, 0], [h, -h, 1], [-h, -h, 1]], [0, -1, 0]); // bottom
    quad([[-h, -h, 0], [-h, -h, 1], [-h, h, 1], [-h, h, 0]], [-1, 0, 0]); // left
    quad([[h, -h, 0], [h, h, 0], [h, h, 1], [h, -h, 1]], [1, 0, 0]); // right
    return new Float32Array(v);
  }

  /* One flat square on the wall, −0.5 … 0.5. Its "normal" slot carries the point's own
     place in the square (−0.5 … 0.5), which the shadow shader turns into metres. */
  function squareMesh() {
    const v = [];
    [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([x, y]) => v.push(x, y, 0, x + 0.5, 0.5 - y, x, y, 0));
    return new Float32Array(v);
  }

  const hexRgb = (hex) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.11, 0.11, 0.11];
  };

  function create(canvas, { xr = false } = {}) {
    const options = { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: !xr, depth: true, xrCompatible: xr };
    let gl = null;
    try {
      gl = canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);
    } catch (error) {
      gl = null;
    }
    if (!gl) return null;

    let box, shadow, ring, boxBuffer, squareBuffer;
    try {
      box = program(gl, FRAG_BOX, ["uMvp", "uTex", "uSide", "uLight", "uAlpha"]);
      shadow = program(gl, FRAG_SHADOW, ["uMvp", "uSize", "uHalf", "uBlur", "uStrength"]);
      ring = program(gl, FRAG_RING, ["uMvp", "uSide", "uAlpha"]);
      boxBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, boxBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, boxMesh(), gl.STATIC_DRAW);
      squareBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, squareBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, squareMesh(), gl.STATIC_DRAW);
    } catch (error) {
      console.error("Live Demo renderer could not start", error);
      return null;
    }
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    let subject = null;
    let textures = [];
    let lost = false;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      lost = true;
    });

    function bind(buffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const stride = 8 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 20);
    }

    /** The painted pictures become textures. Sizes are powers of two so they can be smoothed when seen small. */
    function setSubject(next) {
      textures.forEach((t) => gl.deleteTexture(t));
      textures = [];
      subject = next;
      const edge = Math.min(maxTexture, subject.pieces.length > 1 ? 1024 : 2048);
      subject.pieces.forEach((piece) => {
        const source = piece.canvas;
        const long = Math.max(source.width, source.height);
        const size = Math.min(edge, Math.pow(2, Math.ceil(Math.log2(Math.max(64, long)))));
        const pot = document.createElement("canvas");
        pot.width = pot.height = size;
        const c = pot.getContext("2d");
        c.imageSmoothingQuality = "high";
        c.drawImage(source, 0, 0, size, size);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pot);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
        textures.push(texture);
      });
    }

    /**
     * Start a frame. target: { framebuffer, viewport: [x, y, w, h] }.
     * The picture is see-through wherever nothing is drawn: the camera shows there.
     */
    function begin({ framebuffer = null, viewport, clear = true }) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      if (clear) {
        gl.clearColor(0, 0, 0, 0);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
    }

    /**
     * The piece on the wall.
     *   model, view, projection   see the top of this file
     *   alpha    1 = solid; lower while it is only being aimed (AR, before it is placed)
     *   light    brightness of the room, 1 = unchanged
     *   shadow   false to leave the wall shadow out;  shadowDir  where it falls on the wall, [x, y] (unit length)
     */
    function drawSubject({ model, view, projection, alpha = 1, light = 1, shadow: withShadow = true, shadowDir = [0.24, -0.97] }) {
      if (!subject || lost) return;
      const m = M();
      const vp = m.multiply(projection, view);
      const cfg = subject.shadow || {};
      const depth = subject.depth;

      if (withShadow && cfg.strength !== 0) {
        gl.useProgram(shadow.p);
        bind(squareBuffer);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        // Two layers: a tight dark line where the frame meets the wall, and a wide soft one further off.
        const layers = [
          { blur: Math.max(0.004, depth * 0.35), offset: depth * 0.25, strength: (cfg.strength || 0.34) * 0.9 },
          { blur: Math.max(0.02, depth * 2.4), offset: depth * 0.95, strength: (cfg.strength || 0.34) * 0.75 },
        ];
        subject.pieces.forEach((piece) => {
          layers.forEach((layer) => {
            const pad = layer.blur * 2.2;
            const w = piece.w + pad * 2;
            const h = piece.h + pad * 2;
            const local = m.multiply(m.translation([piece.x + shadowDir[0] * layer.offset, piece.y + shadowDir[1] * layer.offset, 0.0005]), m.scaling(w, h, 1));
            gl.uniformMatrix4fv(shadow.uniforms.uMvp, false, m.multiply(vp, m.multiply(model, local)));
            // The shader works in metres: the square's size, the piece's half size, and how far the shadow fades.
            gl.uniform2f(shadow.uniforms.uSize, w, h);
            gl.uniform2f(shadow.uniforms.uHalf, piece.w / 2, piece.h / 2);
            gl.uniform1f(shadow.uniforms.uBlur, layer.blur);
            gl.uniform1f(shadow.uniforms.uStrength, layer.strength * alpha);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
        });
        gl.depthMask(true);
      }

      gl.useProgram(box.p);
      bind(boxBuffer);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(box.uniforms.uTex, 0);
      gl.uniform1f(box.uniforms.uLight, light);
      gl.uniform1f(box.uniforms.uAlpha, alpha);
      subject.pieces.forEach((piece, i) => {
        const local = m.multiply(m.translation([piece.x, piece.y, 0]), m.scaling(piece.w, piece.h, depth));
        gl.uniformMatrix4fv(box.uniforms.uMvp, false, m.multiply(vp, m.multiply(model, local)));
        gl.uniform3fv(box.uniforms.uSide, hexRgb(piece.side || subject.side));
        gl.bindTexture(gl.TEXTURE_2D, textures[i]);
        gl.drawArrays(gl.TRIANGLES, 0, 30);
      });
      gl.disable(gl.DEPTH_TEST);
    }

    /** The aiming ring (AR): `pose` puts a 1 × 1 square on the found surface; size in metres. */
    function drawRing({ pose, view, projection, size = 0.16, color = [1, 1, 1], alpha = 0.9 }) {
      if (lost) return;
      const m = M();
      gl.useProgram(ring.p);
      bind(squareBuffer);
      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(ring.uniforms.uMvp, false, m.multiply(m.multiply(projection, view), m.multiply(pose, m.scaling(size, size, 1))));
      gl.uniform3fv(ring.uniforms.uSide, color);
      gl.uniform1f(ring.uniforms.uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function dispose() {
      textures.forEach((t) => gl.deleteTexture(t));
      textures = [];
      [boxBuffer, squareBuffer].forEach((b) => gl.deleteBuffer(b));
      [box, shadow, ring].forEach((p) => gl.deleteProgram(p.p));
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose && !xr) lose.loseContext();
    }

    return { kind: "webgl", gl, setSubject, begin, drawSubject, drawRing, dispose, isLost: () => lost };
  }

  /* ---------------------------------------------------------------- No WebGL: a plain picture
     Very old or very low-powered devices. The piece is drawn flat (no perspective,
     no depth), with a soft shadow: still positioned, resized and turned by the same
     matrices, so everything else in the Live Demo works the same. */
  function flat(canvas) {
    const c = canvas.getContext("2d");
    if (!c) return null;
    let subject = null;
    let port = [0, 0, canvas.width, canvas.height];
    return {
      kind: "flat",
      setSubject(next) {
        subject = next;
      },
      begin({ viewport, clear = true }) {
        port = viewport;
        if (clear) c.clearRect(0, 0, canvas.width, canvas.height);
      },
      drawSubject({ model, view, projection, alpha = 1, shadow: withShadow = true }) {
        if (!subject) return;
        const m = M();
        const mvp = m.multiply(m.multiply(projection, view), model);
        const px = (p) => {
          const q = m.transformPoint(mvp, p);
          return [port[0] + ((q[0] + 1) / 2) * port[2], port[1] + ((1 - q[1]) / 2) * port[3]];
        };
        subject.pieces.forEach((piece) => {
          const centre = px([piece.x, piece.y, 0]);
          const right = px([piece.x + piece.w / 2, piece.y, 0]);
          const up = px([piece.x, piece.y + piece.h / 2, 0]);
          const halfW = Math.hypot(right[0] - centre[0], right[1] - centre[1]);
          const halfH = Math.hypot(up[0] - centre[0], up[1] - centre[1]);
          c.save();
          c.globalAlpha = alpha;
          c.translate(centre[0], centre[1]);
          c.rotate(Math.atan2(right[1] - centre[1], right[0] - centre[0]));
          if (withShadow) {
            c.shadowColor = "rgba(0,0,0,0.4)";
            c.shadowBlur = Math.max(6, halfW * 0.12);
            c.shadowOffsetY = Math.max(3, halfW * 0.06);
          }
          c.drawImage(piece.canvas, -halfW, -halfH, halfW * 2, halfH * 2);
          c.restore();
        });
      },
      drawRing() {},
      dispose() {},
      isLost: () => false,
    };
  }

  FrameX.ldRender = { create, flat };
})((window.FrameX = window.FrameX || {}));
