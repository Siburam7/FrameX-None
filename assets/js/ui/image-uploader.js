/* ==========================================================================
   ImageUploader: reusable upload widget for shop product images.

     FrameX.imageUploader.mount(el, { items, onChange, productName })
       items: [{ id, type, url, thumb, alt, sortOrder, isMain }]   (product views)
       Each image: preview, view type, alt text, set as main, reorder
       (buttons or drag), delete. Files are checked by the media service
       (type, size, minimum resolution) with plain-language errors.

     FrameX.imageUploader.single(el, { value, kind, label, onChange })
       one optional image (print-material photo, video thumbnail).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const M = () => FrameX.productModel;
  const media = () => FrameX.mediaService;
  const GUESS = [
    [/back|rear/i, "BACK"],
    [/side|profile|edge/i, "SIDE"],
    [/corner/i, "CORNER"],
    [/close|detail|macro/i, "DETAIL"],
    [/material|texture|grain/i, "MATERIAL"],
    [/wall/i, "WALL_PREVIEW"],
    [/room|life|interior/i, "LIFESTYLE"],
    [/pack|box/i, "PACKAGING"],
    [/front/i, "FRONT"]
  ];

  function guessType(name, used) {
    const hit = GUESS.find(([re]) => re.test(name));
    if (hit) return hit[1];
    return ["FRONT", "SIDE", "BACK", "CORNER", "DETAIL"].find((t) => !used.includes(t)) || "DETAIL";
  }

  function mount(el, { items = [], onChange = () => {}, productName = () => "" } = {}) {
    let list = items.map((v, i) => Object.assign({}, v, { sortOrder: i }));
    const pending = new Map(); // temp id -> { name, progress }
    let errors = [];
    let dragId = null;

    const emit = () => {
      list.forEach((v, i) => (v.sortOrder = i));
      if (list.length && !list.some((v) => v.isMain)) list[0].isMain = true;
      onChange(list.map((v) => Object.assign({}, v)));
    };

    function render() {
      const types = M().VIEW_TYPES.filter((t) => t.id !== "PHOTO");
      el.innerHTML = `<div class="iu">
        <label class="iu-drop" data-drop>
          ${icon("upload")}
          <strong>Add product photos</strong>
          <span>Drop images here or choose files · JPG, PNG or WebP · up to ${media().RULES.view.maxMB} MB · at least ${media().RULES.view.minEdge} px</span>
          <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-file>
        </label>
        ${errors.length ? `<ul class="iu-errors" role="alert">${errors.map((e) => `<li>${icon("alert")} ${esc(e)}</li>`).join("")}</ul>` : ""}
        <ol class="iu-grid" aria-label="Product images">
          ${list
            .map(
              (v, i) => `<li class="iu-card${v.isMain ? " is-main" : ""}" draggable="true" data-id="${esc(v.id)}">
              <div class="iu-card__media"><img data-src="${esc(v.thumb || v.url)}" alt=""><span class="iu-card__pos">${i + 1}</span>${v.isMain ? `<span class="iu-card__main">Main image</span>` : ""}</div>
              <div class="iu-card__fields">
                <label class="iu-field"><span>View</span><select class="select" data-field="type">
                  ${types.concat(v.type === "PHOTO" ? [M().viewType("PHOTO")] : []).map((t) => `<option value="${t.id}"${t.id === v.type ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
                <label class="iu-field"><span>Alt text <em>(describes the photo)</em></span><input class="input" data-field="alt" maxlength="140" value="${esc(v.alt || "")}" placeholder="e.g. Walnut frame, front view"></label>
              </div>
              <div class="iu-card__actions">
                <button class="iu-btn" type="button" data-act="main" ${v.isMain ? "disabled" : ""}>${icon("star")} ${v.isMain ? "Main" : "Set as main"}</button>
                <button class="iu-btn iu-btn--icon" type="button" data-act="up" aria-label="Move earlier" ${i === 0 ? "disabled" : ""}>${icon("chev-left")}</button>
                <button class="iu-btn iu-btn--icon" type="button" data-act="down" aria-label="Move later" ${i === list.length - 1 ? "disabled" : ""}>${icon("chev-right")}</button>
                <button class="iu-btn iu-btn--danger" type="button" data-act="delete" aria-label="Delete this image">${icon("close")} Delete</button>
              </div>
            </li>`
            )
            .join("")}
          ${[...pending.entries()].map(([id, p]) => `<li class="iu-card iu-card--pending" data-pending="${esc(id)}"><div class="iu-card__media"><span class="iu-progress"><i style="width:${p.progress}%"></i></span></div><p class="iu-card__name">${esc(p.name)}</p></li>`).join("")}
        </ol>
        ${list.length ? `<p class="iu-hint">The main image is shown first and on product cards. Drag cards or use the arrows to change the order customers see.</p>` : ""}
      </div>`;
      $$("[data-src]", el).forEach((img) => media().resolve(img.dataset.src, { thumb: true }).then((u) => (img.src = u)));
    }

    async function addFiles(files) {
      errors = [];
      const arr = Array.from(files || []);
      const jobs = arr.map(async (file) => {
        const tmp = "tmp-" + Math.random().toString(36).slice(2);
        pending.set(tmp, { name: file.name, progress: 4 });
        render();
        try {
          const out = await media().prepare(file, "view", (n) => {
            const p = pending.get(tmp);
            if (p) p.progress = n;
            const bar = el.querySelector(`[data-pending="${tmp}"] .iu-progress i`);
            if (bar) bar.style.width = n + "%";
          });
          const type = guessType(file.name, list.map((v) => v.type));
          const name = productName() || "Product";
          list.push({ id: out.id, type, url: out.url, thumb: out.thumb, alt: `${name}, ${M().viewType(type).label.toLowerCase()}`, sortOrder: list.length, isMain: !list.length, width: out.width, height: out.height });
        } catch (error) {
          errors.push(error instanceof media().MediaError ? error.message : `“${file.name}” couldn't be added. Please try again.`);
          if (!(error instanceof media().MediaError)) console.error("Image upload failed", error);
        } finally {
          pending.delete(tmp);
        }
      });
      await Promise.all(jobs);
      render();
      emit();
    }

    function move(id, delta) {
      const i = list.findIndex((v) => v.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      render();
      emit();
      const btn = el.querySelector(`[data-id="${CSS.escape(id)}"] [data-act="${delta < 0 ? "up" : "down"}"]`);
      if (btn && !btn.disabled) btn.focus();
    }

    el.addEventListener("change", (e) => {
      if (e.target.matches("[data-file]")) return addFiles(e.target.files);
      const card = e.target.closest("[data-id]");
      if (card && e.target.dataset.field === "type") {
        const v = list.find((x) => x.id === card.dataset.id);
        v.type = e.target.value;
        emit();
      }
    });
    el.addEventListener("input", (e) => {
      const card = e.target.closest("[data-id]");
      if (card && e.target.dataset.field === "alt") {
        list.find((x) => x.id === card.dataset.id).alt = e.target.value;
        emit();
      }
    });
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.closest("[data-id]").dataset.id;
      const act = btn.dataset.act;
      if (act === "up") move(id, -1);
      if (act === "down") move(id, 1);
      if (act === "main") {
        list.forEach((v) => (v.isMain = v.id === id));
        list = list.filter((v) => v.id === id).concat(list.filter((v) => v.id !== id));
        render();
        emit();
      }
      if (act === "delete") {
        if (!btn.classList.contains("is-confirming")) {
          btn.classList.add("is-confirming");
          btn.innerHTML = `${icon("close")} Tap again to delete`;
          setTimeout(() => btn.isConnected && (btn.classList.remove("is-confirming"), (btn.innerHTML = `${icon("close")} Delete`)), 3500);
          return;
        }
        list = list.filter((v) => v.id !== id);
        render();
        emit();
      }
    });

    // Drop files on the zone; drag cards to reorder.
    el.addEventListener("dragover", (e) => {
      const zone = e.target.closest("[data-drop]");
      if (zone || dragId) e.preventDefault();
      if (zone) zone.classList.add("is-over");
    });
    el.addEventListener("dragleave", (e) => {
      const zone = e.target.closest("[data-drop]");
      if (zone) zone.classList.remove("is-over");
    });
    el.addEventListener("dragstart", (e) => {
      const card = e.target.closest("[data-id]");
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      $$(".is-dragging", el).forEach((c) => c.classList.remove("is-dragging"));
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const zone = e.target.closest("[data-drop]");
      if (zone && e.dataTransfer.files.length) return addFiles(e.dataTransfer.files);
      const target = e.target.closest("[data-id]");
      if (dragId && target && target.dataset.id !== dragId) {
        const from = list.findIndex((v) => v.id === dragId);
        const to = list.findIndex((v) => v.id === target.dataset.id);
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved); // dragging down lands after the target, up lands before it
        render();
        emit();
      }
    });

    render();
    return { get: () => list.slice(), add: addFiles };
  }

  /** One optional image. */
  function single(el, { value = "", kind = "material", label = "Image", onChange = () => {} } = {}) {
    let current = value;
    let error = "";
    function render(progress) {
      el.innerHTML = `<div class="iu-single">
        ${current ? `<img data-src="${esc(current)}" alt="">` : `<span class="iu-single__empty">${icon("image")}</span>`}
        <div class="iu-single__body">
          <span class="iu-single__label">${esc(label)}</span>
          ${progress != null ? `<span class="iu-progress"><i style="width:${progress}%"></i></span>` : ""}
          <div class="iu-single__actions">
            <label class="iu-btn">${icon("upload")} ${current ? "Replace" : "Upload"}<input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" data-single></label>
            ${current ? `<button class="iu-btn iu-btn--danger" type="button" data-clear>${icon("close")} Remove</button>` : ""}
          </div>
          ${error ? `<p class="iu-errors" role="alert">${icon("alert")} ${esc(error)}</p>` : ""}
        </div></div>`;
      const img = el.querySelector("[data-src]");
      if (img) media().resolve(img.dataset.src, { thumb: true }).then((u) => (img.src = u));
    }
    el.addEventListener("change", async (e) => {
      if (!e.target.matches("[data-single]")) return;
      const file = e.target.files[0];
      error = "";
      try {
        render(5);
        const out = await media().prepare(file, kind, (n) => {
          const bar = el.querySelector(".iu-progress i");
          if (bar) bar.style.width = n + "%";
        });
        current = out.url;
        onChange(current, out);
      } catch (err) {
        error = err instanceof media().MediaError ? err.message : "That image couldn't be added. Please try again.";
      }
      render();
    });
    el.addEventListener("click", (e) => {
      if (!e.target.closest("[data-clear]")) return;
      current = "";
      onChange("");
      render();
    });
    render();
  }

  FrameX.imageUploader = { mount, single, guessType };
})((window.FrameX = window.FrameX || {}));
