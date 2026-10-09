/* ==========================================================================
   Art & Artists: the public pages.

     art.html       the artist directory and approved artworks, with search;
                    "Join as an artist" (an application, reviewed by FrameX)
     artist.html    one artist: profile, artworks, the custom painting price
                    list and the form to send a custom painting request
     artwork.html   one approved artwork: pictures, details, Buy artwork

   Everything shown here comes from the backend, and only what FrameX has
   approved is ever sent to this page. Buying an artwork uses the same cart
   and checkout as every other product. A custom painting request takes no
   payment: the artist accepts or declines it first (painting.html then
   shows what is due).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, debounce } = FrameX.dom;
  const http = () => FrameX.http;
  const qs = () => FrameX.qs;
  const forms = () => FrameX.forms;

  const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const img = (path) => (path ? http().asset(path) : "");
  const initials = (name) => String(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
  const place = (loc) => [loc.area, loc.city, loc.state].filter(Boolean).join(", ");

  /** ★ 4.5 (12) or "No ratings yet" (never an invented rating). */
  function stars(rating) {
    if (!rating || !rating.count) return `<span class="stars">No ratings yet</span>`;
    return `<span class="stars" aria-label="Rated ${rating.average} out of 5 by ${rating.count} ${rating.count === 1 ? "customer" : "customers"}">${icon("star")}<strong>${rating.average}</strong> (${rating.count})</span>`;
  }

  const photo = (artist, large = false) =>
    `<span class="artist-photo${large ? " artist-photo--lg" : ""}">${artist.photo ? `<img src="${esc(img(artist.photo))}" alt="" loading="lazy">` : esc(initials(artist.name))}</span>`;

  function artistCard(a) {
    const tags = [...a.styles, ...a.mediums].slice(0, 4);
    return `<a class="artist-card" href="${esc(qs().artistUrl(a))}">
      <div class="artist-card__top">${photo(a)}<div><div class="artist-card__name">${esc(a.name)}</div><div class="artist-card__user">@${esc(a.username)}</div></div></div>
      <div class="artist-card__place">${icon("pin")}<span>${esc(place(a.location))}</span></div>
      ${stars(a.rating)}
      ${tags.length ? `<div class="art-tags">${tags.map((t) => `<span class="art-tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="artist-card__foot"><span>${a.startingPrice ? `Custom paintings from <strong>${rupees(a.startingPrice)}</strong>` : a.artworkCount ? `${a.artworkCount} ${a.artworkCount === 1 ? "artwork" : "artworks"}` : "New on FrameX"}</span><span class="btn btn--dark btn--sm">View Profile</span></div>
    </a>`;
  }

  function artworkCard(w) {
    return `<a class="artwork-card" href="${esc(qs().artworkUrl(w))}">
      <div class="artwork-card__media">${w.image ? `<img src="${esc(img(w.image))}" alt="${esc(w.title)}" loading="lazy" decoding="async">` : ""}${w.available ? "" : `<span class="artwork-card__flag">Sold</span>`}</div>
      <div class="artwork-card__body">
        <span class="artwork-card__label">${esc(w.kind === "PRINT" ? "Print" : "Original")} · ${esc(w.artTypeName)}</span>
        <span class="artwork-card__title">${esc(w.title)}</span>
        <span class="artwork-card__meta">by ${esc(w.artist.name)} · ${esc(w.medium)} · ${esc(w.size)}</span>
        <span class="artwork-card__price">${rupees(w.price)}</span>
      </div>
    </a>`;
  }

  const empty = (title, text) => `<div class="state-message"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;
  const offline = (root) => (root.innerHTML = empty("Art & Artists isn't available right now", "This part of FrameX needs the FrameX server. Please try again in a little while."));

  function reviewList(items) {
    if (!items.length) return `<p class="pp-muted">No reviews yet. Reviews come from customers whose order or painting was delivered.</p>`;
    return `<div class="rev-list">${items
      .map((r) => `<article class="rev"><div class="rev__head"><span class="stars">${icon("star")}<strong>${r.rating}</strong> / 5</span><span class="rev__by">${esc(r.author)} · ${esc(r.source)} · ${new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></div>${r.body ? `<p>${esc(r.body)}</p>` : ""}</article>`)
      .join("")}</div>`;
  }

  /* ====================================================================== art.html */

  async function artPage() {
    const root = $("#art-root");
    if (!root) return;
    if (!http().enabled()) return offline(root);
    const state = { view: qs().param("view") === "artworks" ? "artworks" : "artists", q: qs().param("q") || "", style: qs().param("style") || "", city: qs().param("city") || "", artType: "", page: 1 };
    let facets = { styles: [], mediums: [], cities: [] };
    let artTypes = [];
    try {
      facets = await http().get("/artists/facets");
    } catch (error) {
      return offline(root);
    }

    root.innerHTML = `<div class="art-toolbar">
        <div class="art-toolbar__row">
          <label class="art-search"><span class="visually-hidden">Search artists and artworks</span>${icon("search")}<input class="input" type="search" id="art-q" placeholder="Search by artist, username, style or city" value="${esc(state.q)}" autocomplete="off"></label>
          <div class="segmented" role="group" aria-label="Show">
            <button class="chip" type="button" data-view="artists" aria-pressed="${state.view === "artists"}">Artists</button>
            <button class="chip" type="button" data-view="artworks" aria-pressed="${state.view === "artworks"}">Artworks</button>
          </div>
        </div>
        <div class="chip-scroll" id="art-chips" role="group" aria-label="Filter"></div>
        <p class="art-count" id="art-count" role="status" aria-live="polite"></p>
      </div>
      <div id="art-list"></div>
      <div class="section-more" id="art-more" hidden><button class="btn btn--outline" type="button">Load more</button></div>`;

    const list = $("#art-list", root);
    const more = $("#art-more", root);
    const count = $("#art-count", root);
    const chipsBox = $("#art-chips", root);
    let shown = [];

    function chips() {
      const chip = (kind, value, label, on) => `<button class="chip" type="button" data-${kind}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
      if (state.view === "artists") {
        chipsBox.innerHTML = chip("style", "", "All styles", !state.style) + facets.styles.concat(facets.mediums).slice(0, 14).map((s) => chip("style", s.name, s.name, state.style === s.name)).join("") + facets.cities.slice(0, 8).map((c) => chip("city", c.name, c.name, state.city === c.name)).join("");
      } else {
        chipsBox.innerHTML = chip("type", "", "All artworks", !state.artType) + artTypes.map((t) => chip("type", t.id, t.name, state.artType === t.id)).join("");
      }
    }

    async function load(reset = true) {
      if (reset) {
        state.page = 1;
        shown = [];
        list.innerHTML = `<div class="skeleton" style="height:280px"></div>`;
      }
      try {
        if (state.view === "artists") {
          const r = await http().get("/artists", { q: state.q, style: state.style, city: state.city, page: state.page, limit: 12 });
          shown = shown.concat(r.items);
          count.textContent = r.total ? `${r.total} ${r.total === 1 ? "artist" : "artists"}` : "";
          list.innerHTML = shown.length ? `<div class="artist-grid">${shown.map(artistCard).join("")}</div>` : empty(state.q || state.style || state.city ? "No artist matches that" : "No artists are listed yet", state.q || state.style || state.city ? "Try another name, style or city." : "Artists appear here once FrameX has approved them. Are you an artist? Apply below.");
          more.hidden = shown.length >= r.total;
        } else {
          const r = await http().get("/artworks", { q: state.q, artType: state.artType, page: state.page, limit: 12 });
          artTypes = r.artTypes || artTypes;
          shown = shown.concat(r.items);
          count.textContent = r.total ? `${r.total} ${r.total === 1 ? "artwork" : "artworks"}` : "";
          list.innerHTML = shown.length ? `<div class="product-grid">${shown.map(artworkCard).join("")}</div>` : empty(state.q || state.artType ? "No artwork matches that" : "No artworks are on show yet", state.q || state.artType ? "Try another word, or look at all artworks." : "Artworks appear here once an artist has added them and FrameX has approved them.");
          more.hidden = shown.length >= r.total;
        }
        chips();
      } catch (error) {
        FrameX.templates.showError(list, "This couldn't be loaded.", () => load(true));
      }
    }

    $("#art-q", root).addEventListener("input", debounce((e) => ((state.q = e.target.value.trim()), load()), 300));
    root.addEventListener("click", (e) => {
      const view = e.target.closest("[data-view]");
      if (view) {
        state.view = view.dataset.view;
        $$("[data-view]", root).forEach((b) => b.setAttribute("aria-pressed", String(b === view)));
        return load();
      }
      const chip = e.target.closest("#art-chips .chip");
      if (chip) {
        if (chip.dataset.style !== undefined) state.style = chip.dataset.style;
        if (chip.dataset.city !== undefined) state.city = state.city === chip.dataset.city ? "" : chip.dataset.city;
        if (chip.dataset.type !== undefined) state.artType = chip.dataset.type;
        return load();
      }
      if (e.target.closest("#art-more button")) {
        state.page += 1;
        load(false);
      }
    });
    await load();
    joinForm();
  }

  /** "Join as an artist": an application FrameX reviews. It creates no login. */
  function joinForm() {
    const box = $("#join-form");
    if (!box) return;
    const f = forms().field;
    box.innerHTML = `<form class="form-grid" novalidate>
        <div class="form-grid form-grid--2">${f("name", "Your name", { required: true, autocomplete: "name", maxlength: 80, prefix: "ja" })}${f("email", "Email", { required: true, type: "email", autocomplete: "email", prefix: "ja" })}</div>
        <div class="form-grid form-grid--2">${f("phone", "Phone", { required: true, type: "tel", autocomplete: "tel", inputmode: "tel", prefix: "ja" })}${f("city", "City", { required: true, maxlength: 80, prefix: "ja" })}</div>
        <div class="form-grid form-grid--2">${f("state", "State", { required: true, maxlength: 80, prefix: "ja" })}${f("experience", "Experience", { placeholder: "e.g. 6 years, self-taught", maxlength: 300, prefix: "ja" })}</div>
        <div class="form-grid form-grid--2">${f("artStyles", "Art styles", { placeholder: "e.g. Portraits, Landscapes", maxlength: 300, prefix: "ja" })}${f("mediums", "Mediums", { placeholder: "e.g. Oil, Pencil, Watercolour", maxlength: 300, prefix: "ja" })}</div>
        ${f("portfolioUrl", "Link to your work", { placeholder: "https://…", maxlength: 300, prefix: "ja", hint: "Instagram, a website or an online album." })}
        ${f("message", "Anything else we should know", { rows: 3, maxlength: 1000, prefix: "ja" })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--primary" type="submit">Send application</button></div>
      </form>`;
    const form = $("form", box);
    forms().handle(form, {
      busyLabel: "Sending…",
      send: (v) => http().post("/artists/applications", v),
      onSuccess() {
        box.innerHTML = `<div class="state-message"><strong>Thank you. We received your application.</strong><span>The FrameX team will look at it and contact you. You don't have a login yet: if you are approved, we'll send a link to set your password.</span></div>`;
      },
    });
  }

  /* ====================================================================== artist.html */

  async function artistPage() {
    const root = $("#artist-root");
    if (!root) return;
    if (!http().enabled()) return offline(root);
    const ref = qs().param("artist") || qs().param("id") || "";
    let data;
    try {
      data = await http().get(`/artists/${encodeURIComponent(ref)}`);
    } catch (error) {
      root.innerHTML = `<div class="not-found">${icon("users")}<h1 class="section-title">We couldn't find that artist</h1><p class="section-lead">The profile may have been removed, or the link is incomplete.</p><a class="btn btn--dark" href="art.html">See all artists</a></div>`;
      return;
    }
    const a = data.artist;
    document.title = `${a.name} — Art & Artists — FrameX`;
    if (FrameX.analytics) FrameX.analytics.track("view_artist", { itemType: "artist", itemId: a.artistCode || a.username, itemName: a.name });
    const crumb = $("#artist-crumb");
    if (crumb) crumb.textContent = a.name;
    const custom = a.customEnabled && data.services.length;

    root.innerHTML = `<header class="artist-head">
        ${photo(a, true)}
        <div>
          <h1 class="artist-head__name">${esc(a.name)}</h1>
          <div class="artist-head__meta"><span>@${esc(a.username)}</span><span>${icon("pin")}${esc(place(a.location))}</span>${stars(a.rating)}${a.experience ? `<span>${icon("clock")}${esc(a.experience)}</span>` : ""}</div>
          ${a.styles.length ? `<div class="art-tags" style="margin-top:12px">${a.styles.map((t) => `<span class="art-tag">${esc(t)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="artist-head__actions">${custom ? `<a class="btn btn--primary" href="#custom">Request Custom Painting</a>` : ""}${data.artworks.length ? `<a class="btn btn--outline" href="#artworks">See artworks</a>` : ""}</div>
      </header>

      <div class="artist-about">
        <section class="art-panel" aria-labelledby="ab-title"><h2 id="ab-title">About ${esc(a.name.split(/\s+/)[0])}</h2>${a.bio ? a.bio.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("") : `<p class="pp-muted">This artist hasn't written about themselves yet.</p>`}</section>
        <section class="art-panel" aria-labelledby="ad-title"><h2 id="ad-title">Details</h2>
          <dl class="art-facts">
            ${a.specialties.length ? `<div><dt>Specialties</dt><dd>${esc(a.specialties.join(", "))}</dd></div>` : ""}
            ${a.mediums.length ? `<div><dt>Mediums</dt><dd>${esc(a.mediums.join(", "))}</dd></div>` : ""}
            ${a.styles.length ? `<div><dt>Art styles</dt><dd>${esc(a.styles.join(", "))}</dd></div>` : ""}
            ${a.experience ? `<div><dt>Experience</dt><dd>${esc(a.experience)}</dd></div>` : ""}
            <div><dt>Location</dt><dd>${esc(place(a.location))}</dd></div>
            <div><dt>Custom paintings</dt><dd>${custom ? "Taking requests" : "Not taking requests right now"}</dd></div>
          </dl>
        </section>
      </div>

      <section class="art-section" id="artworks" aria-labelledby="aw-title">
        <div class="section-head"><h2 class="section-title section-title--sm" id="aw-title">Artwork gallery</h2></div>
        ${data.artworks.length ? `<div class="product-grid">${data.artworks.map(artworkCard).join("")}</div>` : empty("No artworks on show yet", "Finished artworks appear here once FrameX has approved them.")}
      </section>

      <section class="art-section" id="custom" aria-labelledby="cp-title">
        <div class="section-head"><div><h2 class="section-title section-title--sm" id="cp-title">Custom painting services</h2><p class="section-lead">Choose a size and type at a fixed price, add your reference photo, and send the request. You pay nothing until ${esc(a.name.split(/\s+/)[0])} accepts.</p></div></div>
        <div id="cp-root"></div>
      </section>

      <section class="art-section" aria-labelledby="rv-title">
        <div class="section-head"><h2 class="section-title section-title--sm" id="rv-title">Ratings &amp; reviews</h2>${stars(a.rating)}</div>
        ${reviewList(data.reviews)}
      </section>`;

    if (custom) requestForm($("#cp-root", root), a, data.services);
    else $("#cp-root", root).innerHTML = empty("Not taking custom requests right now", "You can still look at this artist's finished artworks above.");
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  /* ---------------------------------------------------------------- The custom painting request form */

  async function requestForm(box, artist, services) {
    const cfg = (await http().serverConfig().catch(() => null)) || {};
    const percent = (cfg.paintings && cfg.paintings.advancePercent) || 40;
    const maxPhotos = (cfg.paintings && cfg.paintings.maxReferencePhotos) || 5;
    const maxBytes = (cfg.uploads && cfg.uploads.maxBytes) || 50 * 1024 * 1024;
    const QUALITY = (FrameX.productModel && FrameX.productModel.PHOTO_TEXT && FrameX.productModel.PHOTO_TEXT.quality) || "Your uploaded image is kept in the same original quality you provide. We do not artificially enhance or improve the image quality. For the best result, please upload a high-quality image.";
    const state = { serviceId: services.length === 1 ? services[0].id : "", photos: [], addressId: "", addresses: [], states: [], key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, "") };
    const auth = await FrameX.auth.ready;
    const loggedIn = auth.authenticated;

    const split = (price) => {
      const advance = Math.min(price - 1, Math.max(1, Math.round((price * percent) / 100)));
      return { advance, balance: price - advance };
    };

    function render() {
      const service = services.find((s) => s.id === state.serviceId);
      const parts = service ? split(service.price) : null;
      box.innerHTML = `<div class="cp-layout">
          <div class="art-panel cp-form">
            <div class="cp-step"><h3><span>1</span>Choose the size and type</h3>
              <div class="svc-list" role="radiogroup" aria-label="Custom painting services">${services
                .map((s) => `<label class="svc"><input type="radio" name="cp-service" value="${esc(s.id)}"${s.id === state.serviceId ? " checked" : ""}><span><span class="svc__title">${esc(s.size)} ${esc(s.artType)}</span><span class="svc__meta">${esc([s.title, s.medium, s.estDays ? `about ${s.estDays} days` : ""].filter(Boolean).join(" · "))}</span>${s.description ? `<span class="svc__meta">${esc(s.description)}</span>` : ""}</span><span class="svc__price">${rupees(s.price)}</span></label>`)
                .join("")}</div>
            </div>
            <div class="cp-step"><h3><span>2</span>Upload your reference photo</h3>
              <p class="cp-note">${icon("image")}<span>${esc(QUALITY)}</span></p>
              <div class="ref-list" id="cp-photos">${state.photos
                .map((p, i) => `<div class="ref-tile">${p.url ? `<img src="${esc(p.url)}" alt="Reference photo ${i + 1}">` : ""}${p.id ? `<span class="ref-tile__facts">${p.width} × ${p.height} px</span>` : `<span class="ref-tile__bar" style="transform:scaleX(${p.progress || 0.03})"></span>`}<button class="ref-tile__remove" type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}">${icon("close")}</button></div>`)
                .join("")}${state.photos.length < maxPhotos ? `<label class="ref-tile ref-tile--add"><input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" id="cp-file"><span>${icon("upload")}${state.photos.length ? "Add another" : "Add photo"}</span></label>` : ""}</div>
              <p class="form-field__hint">JPG, PNG or WebP, up to ${Math.round(maxBytes / 1048576)} MB each. Up to ${maxPhotos} photos. Only you, the artist and FrameX can see them.</p>
              <p class="form-field__error" id="cp-photo-error" hidden>${icon("alert")}<span></span></p>
            </div>
            <div class="cp-step"><h3><span>3</span>Instructions <span class="hint">(optional)</span></h3>
              <textarea class="input" id="cp-notes" rows="4" maxlength="1500" placeholder="Anything the artist should know: who is in the photo, the background you want, colours, a date you need it by.">${esc(state.notes || "")}</textarea>
            </div>
            <div class="cp-step"><h3><span>4</span>Where should it be delivered?</h3>
              <div id="cp-address">${loggedIn ? `<div class="skeleton" style="height:60px"></div>` : `<p class="pp-muted">Log in to choose your delivery address.</p>`}</div>
            </div>
          </div>

          <aside class="art-panel" aria-label="Price">
            <h3>Price</h3>
            ${service
              ? `<div class="cp-split">
                  <div class="is-total"><span>${esc(service.size)} ${esc(service.artType)}</span><strong>${rupees(service.price)}</strong></div>
                  <div><span>Advance when the artist accepts (${percent}%)</span><strong>${rupees(parts.advance)}</strong></div>
                  <div><span>When the painting is finished (${100 - percent}%)</span><strong>${rupees(parts.balance)}</strong></div>
                  <div><span>To pay now</span><strong>${rupees(0)}</strong></div>
                </div>`
              : `<p class="pp-muted">Choose a size and type to see the price.</p>`}
            <p class="cp-note" style="margin-top:12px">${icon("shield")}<span>Sending a request is free. ${esc(artist.name.split(/\s+/)[0])} accepts or declines it. If it is accepted, you pay the ${percent}% advance and the painting starts; the rest is paid when it is finished, before it is sent to you.</span></p>
            <div class="form-status" id="cp-status" role="status" aria-live="polite"></div>
            ${loggedIn ? `<button class="btn btn--primary btn--block" type="button" id="cp-send" style="margin-top:12px">Send Custom Painting Request</button>` : `<a class="btn btn--primary btn--block" href="${esc(FrameX.auth.loginUrl())}" style="margin-top:12px">Log in to send a request</a>`}
          </aside>
        </div>`;
      if (loggedIn) renderAddresses();
    }

    function renderAddresses() {
      const holder = $("#cp-address", box);
      if (!holder) return;
      const line = (a) => [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", ");
      holder.innerHTML = `${state.addresses.length ? `<div class="cp-addresses" role="radiogroup" aria-label="Delivery address">${state.addresses.map((a) => `<label class="svc"><input type="radio" name="cp-addr" value="${esc(a.id)}"${a.id === state.addressId ? " checked" : ""}><span><span class="svc__title">${esc(a.fullName)}</span><span class="svc__meta">${esc(line(a))} · ${esc(a.phone)}</span></span><span></span></label>`).join("")}</div>` : ""}
        <details class="account-edit"${state.addresses.length ? "" : " open"}><summary>${state.addresses.length ? "Add another address" : "Add your delivery address"}</summary>
          <form class="form-grid" id="cp-new-address" novalidate>
            <div class="form-grid form-grid--2">${forms().field("fullName", "Full name", { required: true, autocomplete: "name", maxlength: 80, prefix: "ca" })}${forms().field("phone", "Phone", { required: true, type: "tel", autocomplete: "tel", inputmode: "tel", prefix: "ca" })}</div>
            ${forms().field("line1", "House, flat, street", { required: true, autocomplete: "address-line1", maxlength: 160, prefix: "ca" })}
            <div class="form-grid form-grid--2">${forms().field("line2", "Area", { autocomplete: "address-line2", maxlength: 120, prefix: "ca" })}${forms().field("city", "City", { required: true, autocomplete: "address-level2", maxlength: 80, prefix: "ca" })}</div>
            <div class="form-grid form-grid--2"><div class="form-field" data-invalid="false"><label for="ca-state">State</label><select class="select" id="ca-state" name="state" required aria-describedby="ca-state-err"><option value="">Choose a state</option>${(state.states || []).map((s) => `<option>${esc(s)}</option>`).join("")}</select><p class="form-field__error" id="ca-state-err">${icon("alert")}<span></span></p></div>${forms().field("postalCode", "PIN code", { required: true, autocomplete: "postal-code", inputmode: "numeric", maxlength: 6, prefix: "ca" })}</div>
            <div class="form-status" role="status" aria-live="polite"></div>
            <div><button class="btn btn--dark btn--sm" type="submit">Save address</button></div>
          </form>
        </details>`;
      forms().handle($("#cp-new-address", holder), {
        busyLabel: "Saving…",
        send: (v) => http().post("/addresses", v),
        onSuccess(r) {
          state.addresses.unshift(r.address);
          state.addressId = r.address.id;
          renderAddresses();
        },
      });
    }

    const photoError = (text) => {
      const el = $("#cp-photo-error", box);
      if (!el) return;
      el.hidden = !text;
      $("span", el).textContent = text || "";
    };
    const remember = () => {
      const notes = $("#cp-notes", box);
      if (notes) state.notes = notes.value;
    };

    async function addPhoto(file) {
      photoError("");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return photoError("Please upload a supported image format (JPG, PNG or WebP).");
      if (file.size > maxBytes) return photoError(`That photo is larger than ${Math.round(maxBytes / 1048576)} MB. Please choose a smaller file.`);
      const entry = { url: URL.createObjectURL(file), progress: 0.03 };
      state.photos.push(entry);
      remember();
      render();
      try {
        // The file's own bytes go to the server exactly as they are: nothing is resized or re-encoded here.
        const r = await http().upload("/uploads", file, {
          name: file.name,
          onProgress: (percent) => {
            entry.progress = percent / 100;
            const bars = $$("#cp-photos .ref-tile__bar", box);
            const bar = bars[state.photos.filter((p) => !p.id).indexOf(entry)];
            if (bar) bar.style.transform = `scaleX(${Math.max(0.03, entry.progress)})`;
          },
        });
        Object.assign(entry, { id: r.upload.id, width: r.upload.width, height: r.upload.height });
      } catch (error) {
        state.photos.splice(state.photos.indexOf(entry), 1);
        photoError(error.message || "We couldn't upload your image. Please try again.");
      }
      remember();
      render();
    }

    box.addEventListener("change", (e) => {
      if (e.target.name === "cp-service") {
        remember();
        state.serviceId = e.target.value;
        render();
      } else if (e.target.name === "cp-addr") state.addressId = e.target.value;
      else if (e.target.id === "cp-file" && e.target.files[0]) {
        if (!loggedIn) return (window.location.href = FrameX.auth.loginUrl());
        addPhoto(e.target.files[0]);
      }
    });
    box.addEventListener("click", async (e) => {
      const remove = e.target.closest("[data-remove]");
      if (remove) {
        remember();
        const [gone] = state.photos.splice(Number(remove.dataset.remove), 1);
        if (gone && gone.id) http().delete(`/uploads/${gone.id}`).catch(() => {});
        return render();
      }
      const send = e.target.closest("#cp-send");
      if (!send) return;
      remember();
      const status = $("#cp-status", box);
      const say = (text) => forms().status(status, "error", esc(text));
      if (!state.serviceId) return say("Choose a size and type from the price list.");
      if (state.photos.some((p) => !p.id)) return say("Your photo is still uploading. Please wait a moment.");
      if (!state.photos.length) {
        photoError("Please upload your reference photo to continue. The artist needs it to paint from.");
        return say("Please upload your reference photo to continue.");
      }
      if (!state.addressId) return say("Choose or add the address the painting should be delivered to.");
      forms().busy(send, true, "Sending…");
      try {
        const r = await http().post("/paintings", { artist: artist.artistCode, serviceId: state.serviceId, uploadIds: state.photos.map((p) => p.id), instructions: state.notes || "", addressId: state.addressId, idempotencyKey: state.key });
        window.location.href = qs().paintingUrl(r.request.requestNumber) + "&sent=1";
      } catch (error) {
        forms().busy(send, false);
        const fields = error.fields || {};
        if (fields.photos) photoError(fields.photos);
        say(fields.serviceId || fields.photos || fields.addressId || error.message);
      }
    });

    render();
    if (loggedIn) {
      try {
        const saved = await http().get("/addresses");
        state.addresses = saved.items || [];
        state.states = saved.states || [];
        const def = state.addresses.find((a) => a.isDefault) || state.addresses[0];
        state.addressId = def ? def.id : "";
      } catch (error) {
        state.addresses = [];
      }
      renderAddresses();
    }
  }

  /* ====================================================================== artwork.html */

  async function artworkPage() {
    const root = $("#artwork-root");
    if (!root) return;
    if (!http().enabled()) return offline(root);
    let data;
    try {
      data = await http().get(`/artworks/${encodeURIComponent(qs().param("id") || qs().param("slug") || "")}`);
    } catch (error) {
      root.innerHTML = `<div class="not-found">${icon("image")}<h1 class="section-title">We couldn't find that artwork</h1><p class="section-lead">It may have been sold or withdrawn by the artist.</p><a class="btn btn--dark" href="art.html?view=artworks">See all artworks</a></div>`;
      return;
    }
    const w = data.artwork;
    document.title = `${w.title} by ${w.artist.name} — FrameX`;
    if (FrameX.analytics) FrameX.analytics.track("view_artwork", { itemType: "artwork", itemId: w.id, itemName: w.title, category: w.artTypeName, value: w.price });
    const crumb = $("#artwork-crumb");
    if (crumb) crumb.textContent = w.title;
    const fact = (label, value) => (value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : "");

    root.innerHTML = `<div class="aw">
        <div class="aw-gallery">
          <div class="aw-gallery__main"><img id="aw-main" src="${esc(img(w.images[0] || ""))}" alt="${esc(w.title)} by ${esc(w.artist.name)}"></div>
          ${w.images.length > 1 ? `<div class="aw-thumbs" role="group" aria-label="Artwork pictures">${w.images.map((src, i) => `<button type="button" data-pic="${esc(img(src))}" aria-pressed="${i === 0}" aria-label="Picture ${i + 1}"><img src="${esc(img(src))}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
        </div>
        <div class="aw-info">
          <div>
            <p class="artwork-card__label">${esc(w.kind === "PRINT" ? "Print" : "Original artwork")} · ${esc(w.artTypeName)}</p>
            <h1 class="pp-title">${esc(w.title)}</h1>
            <div class="artist-head__meta">${stars(w.rating)}</div>
          </div>
          <div class="aw-price">${rupees(w.price)}</div>
          <p class="pp-muted">${w.available ? (w.kind === "ORIGINAL" ? "One original. Once it is bought, it is gone." : `${w.stock} ${w.stock === 1 ? "print" : "prints"} available.`) : "This artwork has been sold."}</p>
          <div class="aw-buy">
            ${w.available ? `<button class="btn btn--primary" type="button" id="aw-buy">Buy Artwork</button><button class="btn btn--outline" type="button" id="aw-cart">${icon("bag")} Add to cart</button>` : `<button class="btn btn--outline" type="button" disabled>Sold</button>`}
            ${w.artist.customEnabled ? `<a class="btn btn--light" href="${esc(qs().artistUrl(w.artist))}#custom">Request Custom Painting</a>` : ""}
          </div>
          <a class="aw-by" href="${esc(qs().artistUrl(w.artist))}">${photo(w.artist)}<span><strong>${esc(w.artist.name)}</strong><br><span class="pp-muted">@${esc(w.artist.username)} · ${esc([w.artist.city, w.artist.state].filter(Boolean).join(", "))}</span></span></a>
          ${w.description ? `<section class="art-panel"><h2>About this artwork</h2>${w.description.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("")}</section>` : ""}
          <section class="art-panel"><h2>Details</h2>
            <dl class="art-facts">
              ${fact("Artist", w.artist.name)}${fact("Medium", w.medium)}${fact("Size", w.size)}${fact("Original or print", w.kind === "PRINT" ? "Print" : "Original")}
              ${fact("Handmade", w.handmade ? "Yes, made by hand" : "No")}${fact("Frame", w.frameIncluded ? `Included${w.frameDetails ? `: ${w.frameDetails}` : ""}` : "Not included")}
              ${fact("Canvas", w.canvasDetails)}${fact("Year", w.year ? String(w.year) : "")}${fact("Availability", w.available ? "Available" : "Sold")}
              ${fact("Delivery", w.shipping || "Packed and sent by the artist. Delivery is added at checkout.")}
              ${fact("Payment", "Paid online at checkout. Cash on Delivery is not offered for artworks.")}
            </dl>
          </section>
          ${w.care.length ? `<section class="art-panel"><h2>Care</h2><ul class="check-list">${w.care.map((c) => `<li>${icon("check")}<span>${esc(c)}</span></li>`).join("")}</ul></section>` : ""}
          <section class="art-panel"><h2>Ratings &amp; reviews</h2>${reviewList(data.reviews)}</section>
        </div>
      </div>`;

    root.addEventListener("click", async (e) => {
      const pic = e.target.closest("[data-pic]");
      if (pic) {
        $("#aw-main", root).src = pic.dataset.pic;
        $$("[data-pic]", root).forEach((b) => b.setAttribute("aria-pressed", String(b === pic)));
        return;
      }
      const item = { productId: w.id, quantity: 1 };
      if (e.target.closest("#aw-buy")) return FrameX.buyNow.start({ name: w.title, item });
      if (e.target.closest("#aw-cart")) FrameX.cart.add({ productId: w.id, name: w.title, quantity: 1 });
    });
  }

  /** Home page: up to four listed artists under the Art & Artists banners. Nothing is shown when there are none. */
  async function homeArt() {
    const row = $("#home-artists");
    if (!row || !http().enabled()) return;
    try {
      const r = await http().get("/artists", { limit: 4 });
      if (!r.items.length) return;
      row.innerHTML = r.items.map(artistCard).join("");
      row.hidden = false;
    } catch (error) {
      /* the banners above stand on their own */
    }
  }

  FrameX.homeArt = { init: homeArt };
  FrameX.artPage = { init: artPage };
  FrameX.artistPage = { init: artistPage };
  FrameX.artworkPage = { init: artworkPage };
  FrameX.artView = { rupees, img, stars, photo, artistCard, artworkCard, reviewList, empty, place };
})((window.FrameX = window.FrameX || {}));
