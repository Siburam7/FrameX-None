/* ==========================================================================
   "Add artwork" in 4 easy steps (owner, 2026-10-27) — for an artist's own
   dashboard and for the FrameX admin acting for any artist. The same idea
   as "Add a frame" (ui/frame-editor.js):

     1. Photos          the photo of the artwork (the main one), the original
                        photo it was drawn from (buyers compare the two:
                        Before / After, ui/before-after.js) and more photos
     2. Sizes & price   title, art type, medium, original or prints, sizes
                        with their prices (an original has one), copies
     3. Delivery        days to send it, days on the way, packing, from where
     4. Check & submit  how buyers see it; submit (FrameX reviews it), or as
                        the admin publish at once

   FrameX.artworkEditor.open(root, { base, artworkId, admin, onExit })
     base  "/artist" (the artist) or "/admin/artists/<artist id>" (the admin)
   The server rebuilds and checks the record again (services/artwork-service.js).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc } = FrameX.dom;
  const http = () => FrameX.http;

  const STEPS = ["Photos", "Sizes & price", "Delivery", "Check & submit"];
  const TYPES = [["painting", "Painting"], ["drawing", "Drawing / sketch"], ["canvas-art", "Canvas art"], ["portrait", "Portrait"], ["digital-art", "Digital art"], ["handmade", "Handmade"], ["print", "Print"], ["other", "Other"]];
  const PACKING = [["tube", "Rolled in a tube"], ["flat", "Flat, bubble-wrapped"], ["crate", "Wooden crate"]];
  const money = (n) => (n > 0 ? "₹" + Math.round(n).toLocaleString("en-IN") : "—");
  const newId = () => "aw-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const MAX_PICS = 8;
  const asset = (path) => (path && FrameX.http && FrameX.http.asset ? FrameX.http.asset(path) : path || "");

  async function open(root, { base, artworkId = null, admin = false, onExit = () => {} } = {}) {
    root.innerHTML = FrameX.templates ? FrameX.templates.skeletonPage("dash") : "";
    const found = artworkId ? (await http().get(`${base}/artworks/${encodeURIComponent(artworkId)}`)).artwork : null;
    // What the form edits. Everything the server keeps (year, care, tags…) is carried along unchanged.
    const w = found
      ? Object.assign({}, found, { pics: found.imageRefs.map((ref, i) => ({ ref, url: found.images[i] })), refRef: found.referenceRef || "", refUrl: found.reference || "", refConsent: Boolean(found.referenceRef), imagination: Boolean(found.imagination) })
      : { id: newId(), title: "", artType: "painting", medium: "", kind: "ORIGINAL", stock: 1, description: "", handmade: true, frameIncluded: false, frameDetails: "", canvasDetails: "", year: "", shipping: "", care: [], tags: [], pics: [], refRef: "", refUrl: "", refConsent: false, imagination: false };
    w.rows = (found ? found.sizes : [{ width: "", height: "", price: "" }]).map((s) => ({ width: s.width || "", height: s.height || "", price: s.price || "" }));
    w.del = Object.assign({ readyDays: 2, transitMin: 3, transitMax: 6, packing: "tube", shipsFrom: "" }, (found && found.delivery) || {});
    let step = 1;
    let problems = [];
    let dirty = false;

    const prices = () => w.rows.map((r) => Number(r.price) || 0).filter((n) => n > 0);
    const total = () => [Number(w.del.readyDays) + Number(w.del.transitMin), Number(w.del.readyDays) + Number(w.del.transitMax)];
    /* Before / After: the original photo and the artwork */
    const compare = (at) => (w.refUrl && w.pics[0] ? FrameX.beforeAfter.html(asset(w.refUrl), asset(w.pics[0].url), { at }) : "");
    const fileInput = (kind, multiple = false) => `<input type="file" accept="image/jpeg,image/png,image/webp"${multiple ? " multiple" : ""} data-up="${kind}" hidden>`;

    function chips(name, value, list) {
      return `<div class="af-chips">${list.map(([id, label]) => `<button type="button" class="${String(value) === String(id) ? "on" : ""}" data-chip="${name}" data-v="${esc(String(id))}">${esc(label)}</button>`).join("")}</div>`;
    }

    function stepPhotos() {
      const main = w.pics[0];
      const more = w.pics.slice(1);
      return `<div class="af-two">
        <div class="af-card"><h3>1. Photo of your artwork <span class="af-tag">Required</span></h3>
          <p>The finished drawing or painting, straight from the front, in good light. This is the main photo buyers see first.</p>
          <div class="aa-slot">${main ? `<img src="${esc(asset(main.url))}" alt=""><em>Main</em>` : ""}
            <div class="af-row"><label class="af-btn af-btn--sm${main ? "" : " af-btn--pri"}">${fileInput("main")}${main ? "Change photo" : "＋ Add the photo"}</label></div></div>
          <p class="af-status" data-status="main"></p></div>
        <div class="af-card"><h3>2. Original photo <span class="af-tag af-tag--opt">Recommended</span></h3>
          <p>The photo you drew or painted from. Buyers slide between the two and see how close your artwork is.</p>
          <div class="aa-slot">${w.refUrl ? `<img src="${esc(asset(w.refUrl))}" alt=""><em>Original</em>` : ""}
            <div class="af-row"><label class="af-btn af-btn--sm">${fileInput("ref")}${w.refUrl ? "Change photo" : "＋ Add the original photo"}</label>${w.refUrl ? `<button type="button" class="af-btn af-btn--sm" data-act="drop-ref">Remove</button>` : ""}</div></div>
          <p class="af-status" data-status="ref"></p>
          ${
            w.refUrl
              ? `<label class="af-check" style="margin-top:12px"><input type="checkbox" data-f="refConsent"${w.refConsent ? " checked" : ""}> I may show this photo (it is mine, or the people in it agreed)</label>`
              : `<label class="af-check" style="margin-top:12px"><input type="checkbox" data-f="imagination"${w.imagination ? " checked" : ""}> No photo: drawn from imagination</label>`
          }</div>
      </div>
      ${w.refUrl && main ? `<div class="af-card"><h3>How buyers see it: Before / After</h3><p>On the artwork page buyers drag the middle line left and right. Try it.</p><div class="aa-compare">${compare(50)}</div>${w.refConsent ? `<p class="af-ok">✓ Before / After ready</p>` : `<p class="af-sub">Tick “I may show this photo” above to show it to buyers.</p>`}</div>` : ""}
      <div class="af-card"><h3>3. More photos <span class="af-tag af-tag--opt">Optional</span></h3>
        <p>Close-ups of the detail, the artwork in a room, the frame. Up to ${MAX_PICS - 1}.</p>
        <div class="af-pics">${more.map((p, k) => `<div class="af-pic"><img src="${esc(asset(p.url))}" alt=""><button type="button" class="af-mini" data-act="main" data-i="${k + 1}">Make main</button><button type="button" class="af-x" data-act="drop-pic" data-i="${k + 1}" aria-label="Remove photo">✕</button></div>`).join("")}
          ${main && w.pics.length < MAX_PICS ? `<label class="af-add">${fileInput("more", true)}＋<br>Add photo</label>` : main ? "" : `<p class="af-sub">Add the photo of your artwork first.</p>`}</div>
        <p class="af-status" data-status="more"></p></div>`;
    }

    function stepSizes() {
      const original = w.kind !== "PRINT";
      return `<div class="af-card"><h3>Details</h3><div class="af-two" style="margin-top:12px">
          <div class="af-f"><label for="aw-title">Title</label><input class="af-in" id="aw-title" data-f="title" maxlength="140" value="${esc(w.title)}" placeholder="e.g. Alpine Morning"></div>
          <div class="af-f"><label>Art type</label>${chips("artType", w.artType, TYPES)}</div>
          <div class="af-f"><label for="aw-medium">Medium</label><input class="af-in" id="aw-medium" data-f="medium" maxlength="80" value="${esc(w.medium)}" placeholder="e.g. Acrylic on canvas"></div>
          <div class="af-f"><label>Original or prints</label>${chips("kind", w.kind, [["ORIGINAL", "Original (one piece)"], ["PRINT", "Prints (copies)"]])}</div>
          <div class="af-f af-span"><label for="aw-desc">Short description</label><textarea class="af-in" id="aw-desc" rows="3" data-f="description" maxlength="3000" placeholder="What it shows, and what makes it special.">${esc(w.description)}</textarea></div>
        </div></div>
      <div class="af-card"><h3>${original ? "Size and price" : "Sizes and prices"}</h3><p>${original ? "The size of the original, in inches, and its price." : "Every print size you offer, in inches, each with its price."}</p>
        <table class="af-tbl"><thead><tr><th>Width (in)</th><th>Height (in)</th><th>Price (₹)</th><th></th></tr></thead><tbody>
        ${w.rows.map((r, i) => `<tr><td><input class="af-in" type="number" min="1" step="0.1" data-row="${i}" data-k="width" value="${esc(r.width)}"></td><td><input class="af-in" type="number" min="1" step="0.1" data-row="${i}" data-k="height" value="${esc(r.height)}"></td><td><input class="af-in" type="number" min="1" step="1" data-row="${i}" data-k="price" value="${esc(r.price)}" placeholder="e.g. 4999"></td><td>${w.rows.length > 1 ? `<button class="af-ic" type="button" data-act="drop-row" data-i="${i}" aria-label="Remove size">✕</button>` : ""}</td></tr>`).join("")}
        </tbody></table>
        <div class="af-row" style="margin-top:10px">${original ? "" : `<button class="af-btn" type="button" data-act="add-row">＋ Add size</button>`}
          ${original ? "" : `<label class="af-f" style="margin:0"><span>Copies available (all sizes)</span><input class="af-in" type="number" min="1" max="500" data-f="stock" value="${esc(w.stock || 10)}" style="width:110px"></label>`}
          <label class="af-check"><input type="checkbox" data-f="frameIncluded"${w.frameIncluded ? " checked" : ""}> A frame is included</label></div>
        ${w.frameIncluded ? `<div class="af-f" style="margin-top:10px"><label for="aw-fd">Frame details</label><input class="af-in" id="aw-fd" data-f="frameDetails" maxlength="200" value="${esc(w.frameDetails)}" placeholder="e.g. Teak wood frame, ready to hang"></div>` : ""}</div>`;
    }

    function stepDelivery() {
      const [a, b] = total();
      return `<div class="af-card"><h3>Delivery time</h3><p>Count the days you need to pack and hand it over, and the usual days on the way. Buyers see this before they pay.</p>
        <div class="af-two">
          <div class="af-f"><label>Ready to send in</label><div class="aa-days"><input class="af-in" type="number" min="0" max="60" data-d="readyDays" value="${esc(w.del.readyDays)}"> days</div></div>
          <div class="af-f"><label>On the way</label><div class="aa-days"><input class="af-in" type="number" min="1" max="60" data-d="transitMin" value="${esc(w.del.transitMin)}"> to <input class="af-in" type="number" min="1" max="60" data-d="transitMax" value="${esc(w.del.transitMax)}"> days</div></div>
          <div class="af-f"><label>How it is packed</label>${chips("packing", w.del.packing, PACKING)}</div>
          <div class="af-f"><label for="aw-from">Ships from</label><input class="af-in" id="aw-from" data-d="shipsFrom" maxlength="80" value="${esc(w.del.shipsFrom)}" placeholder="e.g. Dhenkanal, Odisha"></div></div>
        <p style="margin:6px 0 4px;font-weight:800">Buyers see:</p>
        <div class="aa-time" data-time><div><b>${esc(w.del.readyDays)} ${Number(w.del.readyDays) === 1 ? "day" : "days"}</b><span>Ready to send</span></div><div><b>${esc(w.del.transitMin)}–${esc(w.del.transitMax)} days</b><span>On the way</span></div><div><b>${a}–${b} days</b><span>Total, usually</span></div></div></div>`;
    }

    function stepCheck() {
      const p = prices();
      const [a, b] = total();
      return `<div class="af-three">
        <div class="af-card"><h3 class="af-h4">On the Art page</h3>${w.pics[0] ? `<img class="af-cardimg" src="${esc(asset(w.pics[0].url))}" alt="">` : `<div class="af-cardimg af-noimg">No photo yet</div>`}
          <p class="af-name">${esc(w.title || "Untitled")}</p><p class="af-sub">${w.kind === "PRINT" ? "Prints" : "Original"} · ${p.length ? (p.length > 1 ? `from ${money(Math.min(...p))}` : money(p[0])) : "No price yet"}</p></div>
        <div class="af-card"><h3 class="af-h4">Before / After</h3>${w.refUrl && w.refConsent ? `${compare(42)}<p class="af-sub" style="margin-top:10px">Buyers drag the line to compare.</p>` : `<p class="af-sub">No original photo: buyers see your photos only.</p>`}</div>
        <div class="af-card"><h3 class="af-h4">Delivery</h3><div class="aa-time" style="grid-template-columns:1fr"><div><b>${a}–${b} days</b><span>Ready in ${esc(w.del.readyDays)}, then ${esc(w.del.transitMin)}–${esc(w.del.transitMax)} on the way</span></div></div>${w.del.shipsFrom ? `<p class="af-sub" style="margin-top:10px">From ${esc(w.del.shipsFrom)}</p>` : ""}</div></div>
      <div class="af-card"><h3>${problems.length ? "Before you submit" : admin ? "Ready to publish" : "Ready to send"}</h3>
        ${problems.length ? `<ul class="af-issues">${problems.map(([s, m]) => `<li><button type="button" data-act="goto" data-step="${s}">${esc(m)} <em>Step ${s}</em></button></li>`).join("")}</ul>` : `<ul class="af-list"><li>✓ Photo of your artwork${w.pics.length > 1 ? ` + ${w.pics.length - 1} more` : ""}</li><li>${w.refUrl ? "✓ Original photo for Before / After" : "– No original photo"}</li><li>✓ ${w.rows.length} size${w.rows.length === 1 ? "" : "s"} with prices</li><li>✓ Delivery time</li></ul>`}
        <p class="af-sub">${admin ? "As FrameX you publish it straight away." : "FrameX checks every artwork before buyers see it (usually within a day). You get an email when it is live."}</p></div>`;
    }

    function check() {
      problems = [];
      if (!w.pics.length) problems.push([1, "Add the photo of your artwork"]);
      if (w.refRef && !w.refConsent) problems.push([1, "Tick that you may show the original photo (or remove it)"]);
      if ((w.title || "").trim().length < 3) problems.push([2, "Give the artwork a title"]);
      if (!(w.medium || "").trim()) problems.push([2, "Say what it is made with (the medium)"]);
      if (!w.rows.length || w.rows.some((r) => !(Number(r.width) > 0 && Number(r.height) > 0 && Number(r.price) > 0))) problems.push([2, "Every size needs its width, height and price"]);
      const d = w.del;
      if (!(Number(d.transitMin) >= 1 && Number(d.transitMax) >= Number(d.transitMin))) problems.push([3, "Enter the days on the way, e.g. 3 to 6"]);
      return problems;
    }

    function render({ keepScroll = false } = {}) {
      const y = window.scrollY;
      const body = [stepPhotos, stepSizes, stepDelivery, stepCheck][step - 1]();
      root.innerHTML = `<div class="af">
        <header class="sd-head"><div><h1 class="sd-title">${found ? "Edit artwork" : "Add artwork"}</h1><p class="sd-lead">${["Photos first: they are what buyers see.", "The basics, the sizes you sell and their prices.", "How long it takes to reach the buyer.", "Check how buyers will see it, then send it."][step - 1]}</p></div>
          ${found && found.status === "APPROVED" && !admin ? `<p class="af-sub" style="max-width:320px">This artwork is live. Changing it sends it back to FrameX for review.</p>` : ""}</header>
        <div class="af-steps" role="tablist">${STEPS.map((t, i) => `<button type="button" role="tab" class="${i + 1 < step ? "ok" : i + 1 === step ? "on" : ""}" data-act="goto" data-step="${i + 1}" aria-selected="${i + 1 === step}"><b>${i + 1 < step ? "✓" : i + 1}</b>${t}</button>`).join("")}</div>
        ${body}
        <div class="af-foot"><button class="af-btn" type="button" data-act="${step === 1 ? "exit" : "back"}">${step === 1 ? "Cancel" : "← " + STEPS[step - 2]}</button>
          ${step < 4 ? `<button class="af-btn af-btn--pri" type="button" data-act="next">Next: ${STEPS[step]} →</button>` : `<button class="af-btn af-btn--pri" type="button" data-act="submit"${problems.length ? " disabled" : ""}>${admin ? "Publish now" : "Submit to FrameX"}</button>`}</div>
      </div>`;
      if (FrameX.beforeAfter) FrameX.beforeAfter.bind(root);
      if (keepScroll) window.scrollTo(0, y);
    }

    async function submit(btn) {
      if (check().length) return render({ keepScroll: true });
      btn.disabled = true;
      const body = {
        title: w.title, artType: w.artType, medium: w.medium, kind: w.kind, description: w.description,
        stock: w.kind === "PRINT" ? Number(w.stock) || 1 : 1,
        sizes: w.rows.map((r) => ({ width: Number(r.width), height: Number(r.height), price: Math.round(Number(r.price)) })),
        delivery: { readyDays: Number(w.del.readyDays), transitMin: Number(w.del.transitMin), transitMax: Number(w.del.transitMax), packing: w.del.packing, shipsFrom: w.del.shipsFrom },
        reference: { media: w.refRef || null, consent: Boolean(w.refRef && w.refConsent), imagination: !w.refRef && w.imagination },
        images: w.pics.map((p) => p.ref),
        handmade: w.handmade, frameIncluded: w.frameIncluded, frameDetails: w.frameDetails, canvasDetails: w.canvasDetails, year: w.year || "", shipping: w.shipping, care: w.care, tags: w.tags,
        publish: admin,
      };
      try {
        await http().put(`${base}/artworks/${encodeURIComponent(w.id)}`, body);
        dirty = false;
        FrameX.toast.show(admin ? "Published. Buyers can now find it." : "Sent. FrameX will check it before it goes live.");
        onExit();
      } catch (error) {
        btn.disabled = false;
        FrameX.toast.show(error.fields ? Object.values(error.fields)[0] : error.message || "That couldn't be saved. Please try again.", { duration: 6000 });
      }
    }

    /* kind: "main" (the artwork photo), "ref" (the original photo) or "more" */
    async function upload(files, kind) {
      const status = $(`[data-status="${kind}"]`, root);
      const list = kind === "more" ? files.slice(0, MAX_PICS - w.pics.length) : files.slice(0, 1);
      try {
        for (const [k, file] of list.entries()) {
          if (status) status.textContent = list.length > 1 ? `Uploading photo ${k + 1} of ${list.length}…` : "Uploading…";
          const m = (await http().upload(`${base}/media`, file, { name: file.name })).media;
          const pic = { ref: m.ref, url: m.url };
          if (kind === "ref") Object.assign(w, { refRef: m.ref, refUrl: m.url, refConsent: false, imagination: false });
          else if (kind === "main" && w.pics.length) w.pics[0] = pic;
          else w.pics.push(pic);
        }
        dirty = true;
        render({ keepScroll: true });
      } catch (error) {
        if (status) status.textContent = error.message || "That picture couldn't be added.";
      }
    }

    root.onclick = (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) {
        const v = chip.dataset.v;
        if (chip.dataset.chip === "packing") w.del.packing = v;
        else if (chip.dataset.chip === "kind") {
          w.kind = v;
          if (v === "ORIGINAL") w.rows = w.rows.slice(0, 1);
        } else w[chip.dataset.chip] = v;
        dirty = true;
        return render({ keepScroll: true });
      }
      const btn = e.target.closest("[data-act]");
      if (!btn || btn.tagName === "INPUT") return;
      const act = btn.dataset.act;
      const i = Number(btn.dataset.i);
      if (act === "goto" || act === "next" || act === "back") {
        step = act === "goto" ? Number(btn.dataset.step) || 1 : Math.min(4, Math.max(1, step + (act === "next" ? 1 : -1)));
        if (step === 4) check();
        if (act !== "goto") window.scrollTo(0, 0);
        return render();
      }
      if (act === "exit") {
        if (dirty && !window.confirm("Leave without sending your changes?")) return;
        return onExit();
      }
      if (act === "submit") return submit(btn);
      if (act === "main") w.pics.unshift(w.pics.splice(i, 1)[0]);
      if (act === "drop-pic") w.pics.splice(i, 1);
      if (act === "drop-ref") Object.assign(w, { refRef: "", refUrl: "", refConsent: false });
      if (act === "add-row") w.rows.push({ width: "", height: "", price: "" });
      if (act === "drop-row") w.rows.splice(i, 1);
      dirty = true;
      render({ keepScroll: true });
    };
    root.oninput = (e) => {
      const el = e.target;
      if (el.dataset.row !== undefined) w.rows[Number(el.dataset.row)][el.dataset.k] = el.value;
      else if (el.dataset.d) {
        w.del[el.dataset.d] = el.type === "number" ? el.value : el.value;
        const box = $("[data-time]", root);
        if (box && el.type === "number") {
          const [a, b] = total();
          const cells = $$("b", box);
          cells[0].textContent = `${w.del.readyDays} ${Number(w.del.readyDays) === 1 ? "day" : "days"}`;
          cells[1].textContent = `${w.del.transitMin}–${w.del.transitMax} days`;
          cells[2].textContent = `${a}–${b} days`;
        }
      } else if (el.dataset.f && el.type !== "checkbox") w[el.dataset.f] = el.value;
      dirty = true;
    };
    root.onchange = (e) => {
      const el = e.target;
      if (el.dataset.f && el.type === "checkbox") {
        w[el.dataset.f] = el.checked;
        dirty = true;
        return render({ keepScroll: true });
      }
      if (el.dataset.up && el.files && el.files.length) upload(Array.from(el.files), el.dataset.up);
    };

    render();
  }

  FrameX.artworkEditor = { open };
})((window.FrameX = window.FrameX || {}));
