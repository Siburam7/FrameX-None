/* ==========================================================================
   PhotoUploader: one tile per photo the customer has to add ("Photo 1",
   "Photo 2", …). Used wherever a product is made from the customer's own
   photos: the product page, FrameX Studio (one photo, or a template's
   several photo spaces).

     const up = FrameX.photoUploader.mount(el, {
       slots: ["photo1", "photo2"],
       getPhoto(slot)   -> { id, url } | null     the photo now in that space
       onPhoto(slot, photo)                       a photo was chosen (see uploadService.prepare)
       onRemove(slot)
       label(slot, i)   -> "Photo 1"              optional
     });
     up.open(slot)  up.refresh()  up.showMissing(slots, message)  up.destroy()

   Each tile shows the file's own facts (name, pixel size, file size) and
   whether the original is already with FrameX. Checking the file, keeping the
   original and uploading it are the upload service's job
   (services/upload-service.js); this is only the tile.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const svc = () => FrameX.uploadService;

  function mount(root, { slots, getPhoto = null, getPhotoUrl = null, onPhoto, onRemove, label = (slot, i) => `Photo ${i + 1}` }) {
    const uid = "up-" + Math.random().toString(36).slice(2, 7);
    const photoOf = (slot) => (getPhoto ? getPhoto(slot) : getPhotoUrl && getPhotoUrl(slot) ? { id: null, url: getPhotoUrl(slot) } : null);
    const busy = new Set(); // slots whose file is being read

    root.innerHTML = `<ol class="uploader${slots.length === 1 ? " uploader--single" : ""}">${slots
      .map(
        (slot, i) => `<li class="uploader__tile" data-slot="${esc(slot)}">
          <input class="visually-hidden uploader__input" id="${uid}-${i}" type="file" accept="${svc().ACCEPT}" aria-describedby="${uid}-${i}-msg">
          <label class="uploader__drop" for="${uid}-${i}">
            <span class="uploader__thumb"><img alt="" hidden>${icon("image")}</span>
            <span class="uploader__text">
              <strong>${esc(label(slot, i))}</strong>
              <span class="uploader__hint">${icon("upload")} Tap to choose or drop a photo</span>
              <span class="uploader__facts" hidden></span>
            </span>
          </label>
          <div class="uploader__progress" hidden><span></span></div>
          <p class="uploader__msg" id="${uid}-${i}-msg" role="status" aria-live="polite"></p>
          <div class="uploader__actions" hidden>
            <label class="uploader__action" for="${uid}-${i}">Replace</label>
            <button class="uploader__action" type="button" data-remove>Remove</button>
          </div>
        </li>`,
      )
      .join("")}</ol>`;

    const tileOf = (slot) => $(`.uploader__tile[data-slot="${CSS.escape(slot)}"]`, root);
    const slotOfPhoto = (id) => slots.find((slot) => (photoOf(slot) || {}).id === id);

    function message(slot, text, kind = "") {
      const msg = $(".uploader__msg", tileOf(slot));
      msg.textContent = text;
      msg.className = "uploader__msg" + (kind ? " uploader__msg--" + kind : "");
    }

    function bar(slot, percent) {
      const box = $(".uploader__progress", tileOf(slot));
      box.hidden = percent === null;
      $("span", box).style.width = (percent || 0) + "%";
    }

    /** Thumbnail, facts and whether the original has been uploaded. */
    async function paint(slot) {
      const tile = tileOf(slot);
      if (!tile) return;
      const photo = photoOf(slot);
      const img = $(".uploader__thumb img", tile);
      img.hidden = !photo;
      if (photo && photo.url) img.src = photo.url;
      tile.classList.toggle("has-photo", Boolean(photo));
      $(".uploader__actions", tile).hidden = !photo;
      const hint = $(".uploader__hint", tile);
      const facts = $(".uploader__facts", tile);
      if (!photo) {
        hint.innerHTML = `${icon("upload")} Tap to choose or drop a photo`;
        facts.hidden = true;
        return;
      }
      hint.innerHTML = `${icon("check")} Added`;
      if (!photo.id) return;
      const known = await svc().info(photo.id);
      if ((photoOf(slot) || {}).id !== photo.id) return; // replaced while we were asking
      facts.hidden = !known;
      if (known) {
        facts.textContent = svc().facts(known);
        if (known.uploadId && !busy.has(slot)) hint.innerHTML = `${icon("check")} Uploaded`;
      }
    }

    async function handle(slot, file) {
      const tile = tileOf(slot);
      tile.classList.remove("is-missing");
      message(slot, "Reading your photo…");
      busy.add(slot);
      bar(slot, 4);
      try {
        const photo = await svc().prepare(file, (p) => bar(slot, p));
        message(slot, "");
        onPhoto(slot, photo);
      } catch (error) {
        if (!(error instanceof svc().UploadError)) console.error("Photo couldn't be added", error);
        message(slot, error instanceof svc().UploadError ? error.message : "That photo couldn't be added. Please try another one.", "error");
      } finally {
        busy.delete(slot);
        bar(slot, null);
        paint(slot);
      }
    }

    slots.forEach((slot) => {
      const tile = tileOf(slot);
      const input = $(".uploader__input", tile);
      const drop = $(".uploader__drop", tile);
      input.addEventListener("change", () => {
        if (input.files[0]) handle(slot, input.files[0]);
        input.value = "";
      });
      ["dragenter", "dragover"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          tile.classList.add("is-dragover");
        }),
      );
      ["dragleave", "drop"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          tile.classList.remove("is-dragover");
          if (evt === "drop" && e.dataTransfer.files[0]) handle(slot, e.dataTransfer.files[0]);
        }),
      );
      $("[data-remove]", tile).addEventListener("click", () => {
        onRemove(slot);
        message(slot, "");
        bar(slot, null);
        paint(slot);
      });
      paint(slot);
    });

    /* The original on its way to FrameX (it starts by itself for a logged-in customer). */
    function onUpload(event) {
      const { id, state, percent, message: text } = event.detail;
      const slot = slotOfPhoto(id);
      if (!slot || !tileOf(slot)) return;
      if (state === "uploading") {
        bar(slot, percent);
        $(".uploader__hint", tileOf(slot)).innerHTML = `${icon("upload")} Uploading… ${percent}%`;
        return;
      }
      bar(slot, null);
      if (state === "failed") message(slot, text || "The upload didn't finish. It will be tried again when you order.", "error");
      else message(slot, "");
      paint(slot);
    }
    document.addEventListener("framex:upload", onUpload);

    return {
      open: (slot) => $(".uploader__input", tileOf(slot)).click(),
      refresh: () => slots.forEach(paint),
      /** Mark the spaces that still need a photo. */
      showMissing(missing, text = "Please add this photo.") {
        missing.forEach((slot) => {
          tileOf(slot).classList.add("is-missing");
          message(slot, text, "error");
        });
        if (missing[0]) {
          const input = $(".uploader__input", tileOf(missing[0]));
          input.focus();
          tileOf(missing[0]).scrollIntoView({ block: "center", behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth" });
        }
      },
      destroy: () => document.removeEventListener("framex:upload", onUpload),
    };
  }

  FrameX.photoUploader = { mount };
})((window.FrameX = window.FrameX || {}));
