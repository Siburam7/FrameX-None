/* ==========================================================================
   Customer gallery & reviews page.
   Shows customer reviews (with their framed photo when they sent one) and a
   form to share a new one.

   There is NO backend yet, so nothing is uploaded: a submission is stored in
   this browser only (localStorage) and shown back with a "this device only"
   label. Published reviews come from the reviews data (GET /reviews) — add
   real ones in assets/data/reviews.seed.js, with an optional `photo`.
   To go live: replace saveLocal() with a request to your API and moderate
   submissions before they appear for other visitors.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;

  const KEY = "framex.submissions.v1";
  const MAX_LOCAL = 12; // keeps localStorage well under its size limit
  const MAX_UPLOAD_MB = 10;
  const TYPES = ["image/jpeg", "image/png", "image/webp"];
  const PHOTO_EDGE = 1000; // px, longest side of the stored copy

  let published = [];
  let photoData = "";

  const loadLocal = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (error) {
      return [];
    }
  };
  const saveLocal = (list) => localStorage.setItem(KEY, JSON.stringify(list));

  const stars = (n) =>
    `<div class="review-card__stars" role="img" aria-label="${n} out of 5 stars">${Array.from({ length: 5 }, (_, i) => icon("star", i < n ? "icon--fill" : "")).join("")}</div>`;

  const card = (
    r,
  ) => `<article class="cg-card${r.photo ? "" : " cg-card--text"}">
      ${r.photo ? `<div class="cg-card__media"><img src="${esc(r.photo)}" alt="Framed photo shared by ${esc(r.name)}" width="800" height="1000" loading="lazy" decoding="async"></div>` : ""}
      <div class="cg-card__body">
        ${stars(r.rating)}
        <p class="cg-card__text">${esc(r.text)}</p>
        <p class="cg-card__who"><strong>${esc(r.name)}</strong>${r.productName ? `<span>${esc(r.productName)}</span>` : ""}</p>
        <p class="cg-card__meta">
          ${r.isLocal ? `<span class="badge badge--muted">On this device only</span>` : r.isVerified ? `<span class="review-card__verified">${icon("badge-check")} Verified buyer</span>` : ""}
          <span>${esc(r.dateLabel || "")}</span>
          ${r.isLocal ? `<button class="cart-line__remove" type="button" data-remove="${esc(r.id)}">Remove</button>` : ""}
        </p>
      </div>
    </article>`;

  function render() {
    const grid = $("#cg-grid");
    const all = loadLocal()
      .map((r) => Object.assign({ isLocal: true }, r))
      .concat(published);
    grid.classList.toggle("cg-grid--empty", !all.length);
    grid.innerHTML = all.length
      ? all.map(card).join("")
      : `<div class="state-message"><strong>No customer photos yet</strong>
          <span>Photos and reviews from people who have framed their memories with FrameX will appear here.</span>
          <a class="btn btn--dark btn--sm" href="#share">Be the first to share</a></div>`;
  }

  /** Downscale the chosen photo in the browser so the stored copy stays small. */
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(
          1,
          PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("unreadable"));
      };
      img.src = url;
    });
  }

  const RULES = {
    name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
    rating: (v) => (v ? "" : "Please choose a star rating."),
    text: (v) =>
      v.trim().length >= 10 ? "" : "Please write at least 10 characters.",
    consent: (v) =>
      v
        ? ""
        : "Please confirm you have the right to share this photo and review.",
  };

  function setError(form, name, message) {
    const wrap = $(`[data-field="${name}"]`, form);
    wrap.dataset.invalid = message ? "true" : "false";
    $(".form-field__error span", wrap).textContent = message;
  }

  function status(form, kind, text) {
    const box = $("#cg-status", form);
    box.className = `form-status form-status--${kind} is-visible`;
    box.innerHTML = `${icon(kind === "error" ? "close" : "check")}<span>${esc(text)}</span>`;
  }

  function wireForm(form) {
    const file = $("#cg-photo", form);
    const preview = $("#cg-photo-preview", form);
    const zone = $("#cg-photo-zone", form);

    const clearPhoto = () => {
      photoData = "";
      file.value = "";
      preview.hidden = true;
      zone.hidden = false;
    };

    async function handleFile(picked) {
      setError(form, "photo", "");
      if (!picked) return;
      if (!TYPES.includes(picked.type))
        return setError(
          form,
          "photo",
          "Please choose a JPG, PNG or WebP image.",
        );
      if (picked.size > MAX_UPLOAD_MB * 1024 * 1024)
        return setError(
          form,
          "photo",
          `That file is larger than ${MAX_UPLOAD_MB} MB.`,
        );
      try {
        photoData = await readPhoto(picked);
        $("img", preview).src = photoData;
        preview.hidden = false;
        zone.hidden = true;
      } catch (error) {
        setError(
          form,
          "photo",
          "That image couldn't be read. Please try another one.",
        );
      }
    }

    file.addEventListener("change", () => handleFile(file.files[0]));
    ["dragover", "dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (event) => {
        event.preventDefault();
        zone.classList.toggle("is-dragover", evt === "dragover");
        if (evt === "drop") handleFile(event.dataTransfer.files[0]);
      }),
    );
    $("#cg-photo-remove", form).addEventListener("click", clearPhoto);

    // Clear a field's error as soon as its value becomes valid.
    ["input", "change"].forEach((evt) =>
      form.addEventListener(evt, (event) => {
        const wrap = event.target.closest("[data-field]");
        const name = wrap && wrap.dataset.field;
        if (!RULES[name] || wrap.dataset.invalid !== "true") return;
        const field = event.target;
        const value =
          field.type === "checkbox"
            ? field.checked
              ? "yes"
              : ""
            : field.value;
        if (!RULES[name](value)) setError(form, name, "");
      }),
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const values = {
        name: data.get("name") || "",
        rating: data.get("rating") || "",
        text: data.get("text") || "",
        consent: data.get("consent") || "",
      };
      let firstBad = null;
      Object.keys(RULES).forEach((name) => {
        const message = RULES[name](values[name]);
        setError(form, name, message);
        if (message && !firstBad) firstBad = name;
      });
      if (firstBad) {
        status(form, "error", "Please fix the highlighted fields.");
        const field = $(
          `[data-field="${firstBad}"] input, [data-field="${firstBad}"] textarea`,
          form,
        );
        return field && field.focus();
      }

      const entry = {
        id: "local-" + Date.now(),
        name: values.name.trim(),
        rating: Number(values.rating),
        text: values.text.trim(),
        productName: data.get("product") || "",
        photo: photoData,
        dateLabel: new Date().toLocaleDateString(FrameX.config.locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      };
      try {
        saveLocal([entry].concat(loadLocal()).slice(0, MAX_LOCAL));
      } catch (error) {
        return status(
          form,
          "error",
          "This browser couldn't save your review (its storage is full or blocked). Nothing was saved.",
        );
      }
      form.reset();
      clearPhoto();
      render();
      status(
        form,
        "info",
        "Saved on this device, so you can see how it looks above. Publishing reviews on the site is coming soon, so it hasn't been sent to FrameX.",
      );
      $("#cg-grid").scrollIntoView({
        behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  async function init() {
    const grid = $("#cg-grid");
    const form = $("#cg-form");
    if (!grid || !form) return;

    try {
      const [reviews, products] = await Promise.all([
        FrameX.api.getReviews(),
        FrameX.api.getProducts({ limit: 1000 }),
      ]);
      published = reviews;
      $("#cg-product", form).insertAdjacentHTML(
        "beforeend",
        products.items.map((p) => `<option>${esc(p.name)}</option>`).join(""),
      );
    } catch (error) {
      console.error("Customer gallery failed to load", error);
    }

    render();
    grid.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove]");
      if (!remove) return;
      saveLocal(loadLocal().filter((r) => r.id !== remove.dataset.remove));
      render();
    });
    wireForm(form);
  }

  FrameX.customerGalleryPage = { init };
})((window.FrameX = window.FrameX || {}));
