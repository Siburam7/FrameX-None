/* ==========================================================================
   A frame's own pictures (owner, 2026-10-27): the customer's photo shown
   INSIDE the real frame, from the frame's "front" picture (the empty frame
   straight from the front, background and photo space removed; see
   productModel.frameArt and backend lib/frame-cutout.js).

     FrameX.frameArt.art(product, { wall })  -> { img, W, H, box, mask } | null   (loaded once per picture)
     FrameX.frameArt.draw(ctx, art, photoImg, placement, scale)   draw it (the frame at scale)
     FrameX.frameArt.compose(product, photoUrl, placement, { width, wall, background }) -> canvas | null
     FrameX.frameArt.thumbnail(product, photoUrl, placement) -> "data:image/jpeg;base64,…" | ""   (cart / order line)

   placement = { x, y, zoom }: the point of the photo at the centre of the
   photo space (0..1) and the zoom (1..3), as on the product page.
   A photo space of any shape (a heart, an arch) keeps the photo inside it:
   the transparent area joined to the middle of the space is its shape.
   Only a picture: the customer's original photo is what gets printed.
   ========================================================================== */
(function (FrameX) {
  const cache = new Map();

  function loadImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      try {
        // A picture from the FrameX server may be drawn (it allows the website); a blob / data address is local
        if (new URL(url, location.href).origin !== location.origin && !/^(blob|data):/.test(url)) img.crossOrigin = "anonymous";
      } catch (error) {
        /* a relative address */
      }
      img.onload = () => resolve(img.naturalWidth ? img : null);
      img.onerror = () => resolve(null);
      // Its own address for drawing: a copy the page showed as a plain <img> (cached without CORS) can't be drawn
      img.src = img.crossOrigin ? url + (url.includes("?") ? "&" : "?") + "draw=1" : url;
    });
  }
  const address = (ref) => (FrameX.http && FrameX.http.asset ? FrameX.http.asset(ref) : ref);

  /** The shape of the photo space: transparent pixels joined to its middle. null = a plain rectangle. */
  function shapeOf(img, box) {
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    let data;
    try {
      data = x.getImageData(0, 0, W, H).data;
    } catch (error) {
      return null; // the server didn't allow drawing it here: the rectangle is used
    }
    const start = Math.round(box.y + box.h / 2) * W + Math.round(box.x + box.w / 2);
    if (data[start * 4 + 3] >= 16) return null; // the middle isn't transparent: a rectangle, drawn on top
    const seen = new Uint8Array(W * H);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const px = p % W;
      const py = (p - px) / W;
      for (const q of [px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1, py > 0 ? p - W : -1, py < H - 1 ? p + W : -1])
        if (q >= 0 && !seen[q] && data[q * 4 + 3] < 16) (seen[q] = 1), stack.push(q);
    }
    const m = x.createImageData(W, H);
    for (let p = 0; p < W * H; p++) if (seen[p]) m.data[p * 4 + 3] = 255;
    x.clearRect(0, 0, W, H);
    x.putImageData(m, 0, 0);
    return c;
  }

  /** The frame picture, its photo space in pixels and that space's shape. wall: the full PNG for View on My Wall. */
  async function art(p, { wall = false } = {}) {
    const a = p && p.frameArt;
    if (!a || !a.front || !a.opening || a.modelOnly) return null;
    const useWall = wall && a.wall && a.wallOpening;
    const ref = useWall ? a.wall : a.front;
    const opening = useWall ? a.wallOpening : a.opening;
    const key = ref + JSON.stringify(opening);
    if (!cache.has(key))
      cache.set(
        key,
        loadImage(address(ref)).then((img) => {
          if (!img) return null;
          const W = img.naturalWidth;
          const H = img.naturalHeight;
          const box = { x: opening.x * W, y: opening.y * H, w: opening.w * W, h: opening.h * H };
          return { img, W, H, box, mask: shapeOf(img, box) };
        }),
      );
    return cache.get(key);
  }

  /** The photo covering the photo space (x / y / zoom like the product page's "How it fits"). */
  function placePhoto(ctx, photo, box, { x = 0.5, y = 0.5, zoom = 1 } = {}) {
    const pw = photo.naturalWidth || photo.width;
    const ph = photo.naturalHeight || photo.height;
    const scale = Math.max(box.w / pw, box.h / ph) * Math.min(3, Math.max(1, Number(zoom) || 1));
    const dw = pw * scale;
    const dh = ph * scale;
    const left = Math.min(0, Math.max(box.w - dw, box.w / 2 - (Number(x) || 0.5) * dw));
    const top = Math.min(0, Math.max(box.h - dh, box.h / 2 - (Number(y) || 0.5) * dh));
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.drawImage(photo, box.x + left, box.y + top, dw, dh);
    ctx.restore();
  }

  /** Draw the frame with the photo in it onto ctx, the frame `scale` times its picture's size. */
  function draw(ctx, a, photo, placement, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    if (photo && a.mask) {
      // A shaped space: the photo only inside the shape, the frame on top
      const layer = document.createElement("canvas");
      layer.width = a.W;
      layer.height = a.H;
      const l = layer.getContext("2d");
      placePhoto(l, photo, a.box, placement);
      l.globalCompositeOperation = "destination-in";
      l.drawImage(a.mask, 0, 0);
      ctx.drawImage(layer, 0, 0);
      ctx.drawImage(a.img, 0, 0);
    } else {
      // The space is part of the picture (not cut out): the frame first, the photo on top of its space
      ctx.drawImage(a.img, 0, 0);
      if (photo) placePhoto(ctx, photo, a.box, placement);
    }
    ctx.restore();
  }

  async function compose(p, photoUrl, placement, { width = 900, wall = false, background = "" } = {}) {
    const [a, photo] = await Promise.all([art(p, { wall }), loadImage(photoUrl)]);
    if (!a) return null;
    const scale = width / a.W;
    const c = document.createElement("canvas");
    c.width = Math.round(a.W * scale);
    c.height = Math.round(a.H * scale);
    const x = c.getContext("2d");
    if (background) {
      x.fillStyle = background;
      x.fillRect(0, 0, c.width, c.height);
    }
    x.imageSmoothingQuality = "high";
    draw(x, a, photo, placement, scale);
    return c;
  }

  /** The small picture of a cart / order line: the frame with the customer's photo, on a light wall colour. */
  async function thumbnail(p, photoUrl, placement) {
    try {
      const framed = await compose(p, photoUrl, placement, { width: 240 });
      if (!framed) return "";
      const S = 300;
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const x = c.getContext("2d");
      x.fillStyle = "#ece8e1";
      x.fillRect(0, 0, S, S);
      const k = Math.min((S * 0.86) / framed.width, (S * 0.86) / framed.height);
      const w = framed.width * k;
      const h = framed.height * k;
      x.shadowColor = "rgba(0,0,0,.28)";
      x.shadowBlur = 10;
      x.shadowOffsetY = 4;
      x.drawImage(framed, (S - w) / 2, (S - h) / 2, w, h);
      for (const q of [0.82, 0.7, 0.55]) {
        const url = c.toDataURL("image/jpeg", q);
        if (url.length <= 46000) return url; // the cart keeps small pictures only
      }
      return "";
    } catch (error) {
      return ""; // the picture couldn't be drawn here: the cart shows the photo instead
    }
  }

  FrameX.frameArt = { art, draw, compose, thumbnail, loadImage };
})((window.FrameX = window.FrameX || {}));
