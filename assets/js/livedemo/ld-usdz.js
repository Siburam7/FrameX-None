/* ==========================================================================
   Live Demo ("View on My Wall") — iPhone and iPad: Apple's AR Quick Look.

   Safari on an iPhone has no WebXR, but it has AR Quick Look (ARKit): the
   phone finds the wall itself (a LiDAR iPhone even a plain white one) and
   hangs a 3D model on it at its real size. This file makes that model ON THE
   PHONE from the subject (ld-subject.js), as a USDZ file (Pixar's USD, zipped):

     - every framed piece is a thin box: its painted front is the picture, its
       sides and back are the frame's colour (a frame's own cut-out picture is
       only that picture, see-through where it is, like ld-render.js draws it)
     - sizes are the real ones, in metres
     - it asks to hang on a wall (vertical plane anchoring)

   The file becomes a blob: address only this page can read. Nothing is
   uploaded, the customer's photo never leaves the phone.

     FrameX.ldUSDZ.build(subject) -> Promise<Blob>
     FrameX.ldUSDZ.open(url)       opens Quick Look on a blob: address (call it straight from a tap)

   Whether Quick Look is there at all is FrameX.liveDemo.device().quickLook.
   ========================================================================== */
(function (FrameX) {
  /* Quick Look turns content anchored to a wall so that the content's "floor" lies on the wall (model-viewer and
     three.js found the same). The piece is drawn upright, facing +Z with its back on z = 0, and turned back by this
     much so it hangs upright facing out of the wall. If a newer iOS changes that, this is the one number to change. */
  const WALL_TURN_X = -90;
  const ROUGHNESS = { picture: 0.55, side: 0.5 };

  const num = (n) => String(Math.round(n * 1e5) / 1e5);
  const vec = (v) => `(${v.map(num).join(", ")})`;
  const list = (items) => `[${items.join(", ")}]`;

  /** "#3a2f27" -> the colour in linear light, as USD's colours are */
  function linear(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "")) || [0, "1c", "1c", "1c"];
    return [1, 2, 3].map((i) => {
      const c = parseInt(m[i], 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
  }

  /** A piece's painted front as a file: JPEG, or PNG where it has see-through parts */
  function picture(canvas, cutout) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be made."))), cutout ? "image/png" : "image/jpeg", 0.9);
      } catch (error) {
        reject(error); // a picture from another site the browser won't let us read
      }
    });
  }

  /* ---------------------------------------------------------------- the shape: one mesh, a material per face group */
  function shape(subject) {
    const points = [];
    const normals = [];
    const st = [];
    const counts = [];
    const indices = [];
    const groups = new Map(); // material name -> face numbers
    const sides = new Map(); // side colour -> material name
    let faces = 0;
    const quad = (corners, normal, uv, material) => {
      const first = points.length;
      corners.forEach((c, i) => {
        points.push(c);
        normals.push(normal);
        st.push(uv ? uv[i] : [0, 0]);
      });
      counts.push(4);
      indices.push(first, first + 1, first + 2, first + 3);
      if (!groups.has(material)) groups.set(material, []);
      groups.get(material).push(faces++);
    };

    // The whole piece is centred on its middle, as Quick Look hangs it by that point.
    const ps = subject.pieces;
    const cx = (Math.min(...ps.map((p) => p.x - p.w / 2)) + Math.max(...ps.map((p) => p.x + p.w / 2))) / 2;
    const cy = (Math.min(...ps.map((p) => p.y - p.h / 2)) + Math.max(...ps.map((p) => p.y + p.h / 2))) / 2;
    const d = Math.max(0.004, Number(subject.depth) || 0.02);
    ps.forEach((p, i) => {
      const l = p.x - cx - p.w / 2;
      const r = p.x - cx + p.w / 2;
      const b = p.y - cy - p.h / 2;
      const t = p.y - cy + p.h / 2;
      // The front: the picture, st (0,0) at its bottom left as USD has it
      quad([[l, b, d], [r, b, d], [r, t, d], [l, t, d]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], `Art${i}`);
      if (p.cutout) return;
      const hex = String(p.side || subject.side || "#1c1c1c").toLowerCase();
      if (!sides.has(hex)) sides.set(hex, `Side${sides.size}`);
      const side = sides.get(hex);
      quad([[l, t, d], [r, t, d], [r, t, 0], [l, t, 0]], [0, 1, 0], null, side); // top
      quad([[l, b, 0], [r, b, 0], [r, b, d], [l, b, d]], [0, -1, 0], null, side); // bottom
      quad([[r, b, d], [r, b, 0], [r, t, 0], [r, t, d]], [1, 0, 0], null, side); // right
      quad([[l, b, 0], [l, b, d], [l, t, d], [l, t, 0]], [-1, 0, 0], null, side); // left
      quad([[l, b, 0], [l, t, 0], [r, t, 0], [r, b, 0]], [0, 0, -1], null, side); // back, on the wall
    });
    const axis = (k) => points.map((p) => p[k]);
    const extent = [[0, 1, 2].map((k) => Math.min(...axis(k))), [0, 1, 2].map((k) => Math.max(...axis(k)))];
    return { points, normals, st, counts, indices, groups, sides, extent };
  }

  /* ---------------------------------------------------------------- the scene, as USD text */
  function usda(subject, geo, files) {
    const M = "/Root/Materials";
    const art = subject.pieces.map((p, i) => {
      const name = `Art${i}`;
      const cut = Boolean(p.cutout);
      return `
        def Material "${name}"
        {
            token outputs:surface.connect = <${M}/${name}/Surface.outputs:surface>

            def Shader "Surface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = <${M}/${name}/Picture.outputs:rgb>
                float inputs:metallic = 0
                float inputs:roughness = ${ROUGHNESS.picture}${
                  cut
                    ? `
                float inputs:opacity.connect = <${M}/${name}/Picture.outputs:a>
                float inputs:opacityThreshold = 0.5`
                    : ""
                }
                token outputs:surface
            }

            def Shader "Picture"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${files[i]}@
                float2 inputs:st.connect = <${M}/${name}/Reader.outputs:result>
                token inputs:sourceColorSpace = "sRGB"
                token inputs:wrapS = "clamp"
                token inputs:wrapT = "clamp"
                float3 outputs:rgb${cut ? "\n                float outputs:a" : ""}
            }

            def Shader "Reader"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                string inputs:varname = "st"
                float2 inputs:fallback = (0, 0)
                float2 outputs:result
            }
        }`;
    });
    const side = [...geo.sides].map(
      ([hex, name]) => `
        def Material "${name}"
        {
            token outputs:surface.connect = <${M}/${name}/Surface.outputs:surface>

            def Shader "Surface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = ${vec(linear(hex))}
                float inputs:metallic = 0
                float inputs:roughness = ${ROUGHNESS.side}
                token outputs:surface
            }
        }`,
    );
    const subsets = [...geo.groups].map(
      ([name, faces]) => `
                    def GeomSubset "${name}" (
                        prepend apiSchemas = ["MaterialBindingAPI"]
                    )
                    {
                        uniform token elementType = "face"
                        uniform token familyName = "materialBind"
                        int[] indices = ${list(faces)}
                        rel material:binding = <${M}/${name}>
                    }`,
    );
    return `#usda 1.0
(
    customLayerData = {
        string creator = "FrameX View on My Wall"
    }
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        string name = "FrameX"
    }
    kind = "component"
)
{
    def Scope "Scenes" (
        kind = "sceneLibrary"
    )
    {
        def Xform "Scene" (
            customData = {
                bool preliminary_collidesWithEnvironment = 0
                string sceneName = "Scene"
            }
            sceneName = "Scene"
        )
        {
            token preliminary:anchoring:type = "plane"
            token preliminary:planeAnchoring:alignment = "vertical"

            def Xform "OnTheWall"
            {
                float xformOp:rotateX = ${WALL_TURN_X}
                uniform token[] xformOpOrder = ["xformOp:rotateX"]

                def Mesh "Piece"
                {
                    float3[] extent = ${list(geo.extent.map(vec))}
                    int[] faceVertexCounts = ${list(geo.counts)}
                    int[] faceVertexIndices = ${list(geo.indices)}
                    normal3f[] normals = ${list(geo.normals.map(vec))} (
                        interpolation = "vertex"
                    )
                    point3f[] points = ${list(geo.points.map(vec))}
                    texCoord2f[] primvars:st = ${list(geo.st.map(vec))} (
                        interpolation = "vertex"
                    )
                    uniform token subdivisionScheme = "none"
                    uniform token subsetFamily:materialBind:familyType = "nonOverlapping"
${subsets.join("\n")}
                }
            }
        }
    }

    def Scope "Materials"
    {${art.join("\n")}${side.join("\n")}
    }
}
`;
  }

  /* ---------------------------------------------------------------- the zip a USDZ is: stored, each file's data on a 64-byte boundary */
  const CRC = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** [{ name, data: Uint8Array }] -> the parts of a zip with nothing compressed (the scene first, as USDZ wants) */
  function zip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const encoder = new TextEncoder();
    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const crc = crc32(file.data);
      // The padding sits in the header's "extra" field, which needs at least its own 4 bytes
      let pad = (64 - ((offset + 30 + name.length) % 64)) % 64;
      if (pad > 0 && pad < 4) pad += 64;
      const head = new Uint8Array(30 + name.length + pad);
      const h = new DataView(head.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true); // version needed
      h.setUint16(8, 0, true); // stored
      h.setUint16(12, 0x21, true); // 1 January 1980
      h.setUint32(14, crc, true);
      h.setUint32(18, file.data.length, true);
      h.setUint32(22, file.data.length, true);
      h.setUint16(26, name.length, true);
      h.setUint16(28, pad, true);
      head.set(name, 30);
      if (pad) {
        h.setUint16(30 + name.length, 0x3039, true); // an unused extra-field id
        h.setUint16(32 + name.length, pad - 4, true);
      }
      const entry = new Uint8Array(46 + name.length);
      const e = new DataView(entry.buffer);
      e.setUint32(0, 0x02014b50, true);
      e.setUint16(4, 20, true);
      e.setUint16(6, 20, true);
      e.setUint16(14, 0x21, true);
      e.setUint32(16, crc, true);
      e.setUint32(20, file.data.length, true);
      e.setUint32(24, file.data.length, true);
      e.setUint16(28, name.length, true);
      e.setUint32(42, offset, true);
      entry.set(name, 46);
      parts.push(head, file.data);
      central.push(entry);
      offset += head.length + file.data.length;
    });
    const size = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const z = new DataView(end.buffer);
    z.setUint32(0, 0x06054b50, true);
    z.setUint16(8, files.length, true);
    z.setUint16(10, files.length, true);
    z.setUint32(12, size, true);
    z.setUint32(16, offset, true);
    return [...parts, ...central, end];
  }

  /* ---------------------------------------------------------------- build and open */
  async function build(subject) {
    if (!subject || !subject.pieces || !subject.pieces.length) throw Object.assign(new Error("Nothing to show."), { code: "DATA" });
    const pictures = await Promise.all(subject.pieces.map((p) => picture(p.canvas, p.cutout)));
    const files = subject.pieces.map((p, i) => `textures/art${i}.${p.cutout ? "png" : "jpg"}`);
    const scene = usda(subject, shape(subject), files);
    const data = await Promise.all(pictures.map((b) => b.arrayBuffer()));
    const parts = zip([{ name: "framex.usda", data: new TextEncoder().encode(scene) }, ...files.map((name, i) => ({ name, data: new Uint8Array(data[i]) }))]);
    return new Blob(parts, { type: "model/vnd.usdz+zip" });
  }

  /** Quick Look opens from a link marked rel="ar" with a picture inside it. The size stays the real one (no pinching). */
  function open(url) {
    const a = document.createElement("a");
    a.setAttribute("rel", "ar");
    a.setAttribute("href", `${url}#allowsContentScaling=0`);
    a.setAttribute("download", "framex-on-my-wall.usdz");
    a.appendChild(document.createElement("img"));
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  FrameX.ldUSDZ = { build, open, usda, shape, zip };
})((window.FrameX = window.FrameX || {}));
