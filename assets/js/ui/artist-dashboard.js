/* ==========================================================================
   Artist dashboard (artist-dashboard.html). For logged-in ARTIST accounts.

     #/overview            what needs attention, and what customers have paid
     #/requests[/CP-…]     custom painting requests: accept or decline, then
                           start, mark completed, dispatch, mark delivered
     #/artworks[/new|id]   your artworks and their review status
     #/services            your custom painting price list
     #/orders[/FX-…]       orders of your artworks
     #/profile             your public profile

   The page shows and asks; the backend decides. Which artist you are comes
   from your login, never from this page, and every step the backend refuses
   (starting before the advance is paid, dispatching before the balance) is
   simply not offered here and is refused there.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const forms = () => FrameX.forms;
  const pv = () => FrameX.paintingView;
  const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const img = (path) => (path ? http().asset(path) : "");
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

  let root;
  let me;

  const NAV = [
    ["overview", "Overview", "frame"],
    ["requests", "Painting requests", "mail"],
    ["artworks", "Artworks", "image"],
    ["services", "Price list", "receipt"],
    ["orders", "Artwork orders", "package"],
    ["profile", "Profile", "user"],
  ];
  const ART_STATUS = { PENDING_REVIEW: "Waiting for review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Withdrawn", INACTIVE: "Paused" };
  const ART_TONE = { PENDING_REVIEW: "pending_review", APPROVED: "published", REJECTED: "unpublished", CANCELLED: "draft", INACTIVE: "draft" };
  const artBadge = (s) => `<span class="sd-status sd-status--${ART_TONE[s] || "draft"}">${esc(ART_STATUS[s] || s)}</span>`;
  const FILTERS = [["", "All"], ["new", "New"], ["accepted", "Accepted"], ["active", "Active jobs"], ["completed", "Completed"], ["declined", "Declined / cancelled"]];

  const head = (title, lead, action = "") => `<header class="sd-head"><div><h1 class="sd-title">${esc(title)}</h1>${lead ? `<p class="sd-lead">${lead}</p>` : ""}</div>${action}</header>`;
  const emptyBox = (ic, title, text, action = "") => `<div class="sd-empty">${icon(ic)}<strong>${esc(title)}</strong><span>${esc(text)}</span>${action}</div>`;
  const newId = () => "aw-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

  function parse() {
    const h = window.location.hash.replace(/^#/, "") || "/overview";
    const [path, query] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
  }

  function layout(section) {
    root.innerHTML = `<div class="sd">
      <aside class="sd-side">
        <div class="sd-shop"><span class="sd-logo">${icon("image")}</span><div><strong>${esc(me.artist ? me.artist.name : me.name)}</strong><span class="sd-side__who">${esc(me.artist ? me.artist.artistCode : "")}</span></div></div>
        <nav class="sd-nav" aria-label="Artist dashboard"><ul>${NAV.map(([id, label, ic]) => `<li><a href="#/${id}"${id === section ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a></li>`).join("")}</ul></nav>
        ${me.artist ? `<a class="btn btn--outline btn--sm" href="${esc(FrameX.qs.artistUrl(me.artist.username))}" target="_blank" rel="noopener">${icon("eye")} View public profile</a>` : ""}
        <button class="btn btn--outline btn--sm" type="button" data-logout>${icon("logout")} Log out</button>
      </aside>
      <section class="sd-main" data-main></section>
    </div>`;
    $("[data-logout]", root).addEventListener("click", async () => {
      await FrameX.auth.logout();
      window.location.href = "login.html";
    });
    return $("[data-main]", root);
  }

  /* ---------------------------------------------------------------- Overview */
  async function overview(main) {
    const o = await http().get("/artist/overview");
    const tile = (n, label, href, alert = false) => `<a class="ad-tile ${alert ? "ad-tile--alert" : ""}" href="${href}"><strong>${n}</strong><span>${esc(label)}</span></a>`;
    main.innerHTML = `${head("Overview", o.artist.listed ? "Your profile is listed on FrameX." : "Your profile is not listed at the moment. Contact FrameX if this is unexpected.")}
      <div class="ad-tiles">
        ${tile(o.requests.new, "New requests to answer", "#/requests?filter=new", o.requests.new > 0)}
        ${tile(o.requests.accepted, "Accepted, advance pending", "#/requests?filter=accepted")}
        ${tile(o.requests.active, "Active painting jobs", "#/requests?filter=active", o.requests.active > 0)}
        ${tile(o.requests.completed, "Completed jobs", "#/requests?filter=completed")}
      </div>
      <h2 class="ad-subtitle">Artworks</h2>
      <div class="ad-tiles">
        ${tile(o.artworks.APPROVED, "Approved (on show)", "#/artworks?status=APPROVED")}
        ${tile(o.artworks.PENDING_REVIEW, "Waiting for review", "#/artworks?status=PENDING_REVIEW")}
        ${tile(o.artworks.REJECTED, "Rejected", "#/artworks?status=REJECTED", o.artworks.REJECTED > 0)}
      </div>
      <h2 class="ad-subtitle">Payments from customers</h2>
      <div class="ad-tiles">
        ${tile(rupees(o.earnings.paintings.received), "Paid for custom paintings", "#/requests")}
        ${tile(rupees(o.earnings.paintings.outstanding), "Still to be paid on open jobs", "#/requests?filter=active")}
        ${tile(rupees(o.earnings.artworks.paid), "Paid for artworks", "#/orders")}
      </div>
      <p class="sd-lead" style="margin-top:12px">${esc(o.earnings.note)}</p>`;
  }

  /* ---------------------------------------------------------------- Painting requests */
  async function requests(main, params) {
    const filter = params.get("filter") || "";
    const r = await http().get("/artist/requests", { filter });
    main.innerHTML = `${head("Painting requests", "Accept or decline new requests. Start only after the advance is paid; dispatch only after the remaining amount is paid.")}
      <div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter">${FILTERS.map(([id, label]) => `<a class="chip" href="#/requests${id ? `?filter=${id}` : ""}" aria-pressed="${filter === id}">${esc(label)}${id && r.counts[id] ? ` (${r.counts[id]})` : ""}</a>`).join("")}</div></div>
      ${r.items.length
        ? `<ul class="sd-list">${r.items
            .map((p) => `<li class="sd-item ad-item"><a class="sd-item__main" href="#/requests/${esc(p.requestNumber)}"><strong>${esc(p.service.size)} ${esc(p.service.artType)}</strong><span class="sd-item__meta">${esc(p.requestNumber)} · ${esc(p.customerName)} · ${rupees(p.price)} · ${esc(when(p.createdAt))}</span><span class="sd-item__meta">${esc(p.nextStep)}</span></a>${pv().badge(p.status)}</li>`)
            .join("")}</ul>`
        : emptyBox("mail", filter ? "Nothing here" : "No requests yet", filter ? "No request matches this filter." : "Requests from customers appear here. Make sure your price list has at least one service.", `<a class="btn btn--outline btn--sm" href="#/services">Open your price list</a>`)}`;
  }

  async function request(main, number, loaded = null) {
    const r = loaded || (await http().get(`/artist/requests/${encodeURIComponent(number)}`)).request;
    const a = r.deliverTo;
    const pct = r.advancePercent;
    const paid = (stage) => r.payments.some((p) => p.stage === stage && p.status === "PAID");
    const actions = [];
    if (r.actions.respond) actions.push(`<button class="btn btn--primary" type="button" data-respond="ACCEPT">${icon("check")} Accept</button><button class="btn btn--outline" type="button" data-respond="DECLINE">Decline</button>`);
    if (r.actions.start) actions.push(`<button class="btn btn--primary" type="button" data-step="start">Start painting</button>`);
    if (r.actions.complete) actions.push(`<button class="btn btn--primary" type="button" data-step="complete">Mark as completed</button>`);
    if (r.actions.dispatch) actions.push(`<button class="btn btn--primary" type="button" data-step="dispatch">Mark as dispatched</button>`);
    if (r.actions.deliver) actions.push(`<button class="btn btn--dark" type="button" data-step="deliver">Mark as delivered</button>`);
    const tone = r.status === "ADVANCE_PAID" || r.status === "READY_FOR_DISPATCH" ? "cp-status--done" : ["ADVANCE_PAYMENT_PENDING", "REMAINING_PAYMENT_PENDING"].includes(r.status) ? "cp-status--pay" : ["DECLINED", "CANCELLED"].includes(r.status) ? "cp-status--closed" : "";

    main.innerHTML = `<a class="sd-back" href="#/requests">${icon("chev-left")} All requests</a>
      ${head(`Request ${r.requestNumber}`, `${esc(r.service.size)} ${esc(r.service.artType)} · ${esc(when(r.createdAt))}`, pv().badge(r.status))}
      <div class="cp-status ${tone}" role="status"><strong>${esc(r.nextStep)}</strong>
        ${r.status === "ADVANCE_PAYMENT_PENDING" ? `<span>The customer has been asked to pay ${rupees(r.advanceAmount)} (${pct}%). You'll be told here and by email when it is paid.</span>` : ""}
        ${r.status === "REMAINING_PAYMENT_PENDING" ? `<span>The customer has been asked to pay the remaining ${rupees(r.balanceAmount)} (${100 - pct}%). Keep the painting until it is paid.</span>` : ""}
        ${r.status === "DECLINED" && r.declineReason ? `<span>Your reason: “${esc(r.declineReason)}”</span>` : ""}${r.status === "CANCELLED" && r.cancelReason ? `<span>${esc(r.cancelReason)}</span>` : ""}
        ${r.actions.respond ? `<label class="form-field" style="margin-top:8px"><span>If you decline, you can say why <span class="hint">(optional, the customer sees it)</span></span><input class="input" type="text" maxlength="300" data-reason></label>` : ""}
        ${r.actions.dispatch ? `<label class="form-field" style="margin-top:8px"><span>Courier and tracking number <span class="hint">(optional, the customer sees it)</span></span><input class="input" type="text" maxlength="300" data-note placeholder="e.g. India Post EO123456789IN"></label>` : ""}
        ${actions.length ? `<div class="cp-status__actions">${actions.join("")}</div>` : ""}
        <div class="form-status" data-status role="status" aria-live="polite"></div>
      </div>
      <div class="cp-layout" style="margin-top:var(--grid-gap)">
        <div style="display:grid;gap:var(--grid-gap)">
          <section class="art-panel"><h2>What the customer asked for</h2>
            <dl class="art-facts">
              <div><dt>Customer</dt><dd>${esc(r.customer.name)}${r.customer.city ? `, ${esc([r.customer.city, r.customer.state].filter(Boolean).join(", "))}` : ""}</dd></div>
              <div><dt>Service</dt><dd>${esc([r.service.title, r.service.artType, r.service.medium].filter(Boolean).join(" · "))}</dd></div>
              <div><dt>Size</dt><dd>${esc(r.service.size)}</dd></div>
              <div><dt>Instructions</dt><dd>${r.instructions ? esc(r.instructions) : "None"}</dd></div>
            </dl>
          </section>
          <section class="art-panel"><h2>Reference ${r.referencePhotos.length === 1 ? "photo" : "photos"}</h2>
            ${["DECLINED", "CANCELLED"].includes(r.status)
              ? `<p class="pp-muted">This request is closed, so its photos are no longer available.</p>`
              : `<ul class="cp-history">${r.referencePhotos.map((p) => `<li><strong>${esc(p.name)}</strong><small>${p.width} × ${p.height} px · ${(p.bytes / 1048576).toFixed(1)} MB · the customer's original file</small><span><button class="iu-btn iu-btn--go" type="button" data-photo="${esc(p.id)}">${icon("upload")} Download original</button></span></li>`).join("")}</ul><p class="form-field__hint">These photos are private. Use them only for this painting.</p>`}
          </section>
          <section class="art-panel"><h2>Deliver to</h2>
            ${a ? `<p><strong>${esc(a.fullName || r.customer.name)}</strong><br>${esc([a.line1, a.line2, a.landmark].filter(Boolean).join(", "))}<br>${esc([a.city, a.state, a.postalCode].filter(Boolean).join(", "))}${r.customer.phone ? `<br>Phone: ${esc(r.customer.phone)}` : ""}</p>` : `<p class="pp-muted">The delivery address and phone number are shown here once the painting is fully paid and ready to send.</p>`}
          </section>
        </div>
        <aside style="display:grid;gap:var(--grid-gap)">
          <section class="art-panel"><h2>Payment</h2>
            <div class="cp-split">
              <div class="is-total"><span>Price</span><strong>${rupees(r.price)}</strong></div>
              <div class="${paid("ADVANCE") ? "is-done" : ""}"><span>Advance (${pct}%)</span><strong>${rupees(r.advanceAmount)}</strong></div>
              <div class="${paid("BALANCE") ? "is-done" : ""}"><span>On completion (${100 - pct}%)</span><strong>${rupees(r.balanceAmount)}</strong></div>
              <div><span>Paid by the customer</span><strong>${rupees(r.amountPaid)}</strong></div>
            </div>
            <p class="form-field__hint" style="margin-top:8px">Payments are taken and verified by FrameX. Never ask a customer to pay you directly.</p>
          </section>
          <section class="art-panel"><h2>History</h2><ul class="cp-history">${r.history.slice().reverse().map((h) => `<li><span>${esc(h.detail || pv().STATUS[h.status] || "")}</span><small>${esc(when(h.at))}</small></li>`).join("")}</ul></section>
        </aside>
      </div>`;

    const say = (text) => forms().status($("[data-status]", main), "error", esc(text));
    main.onclick = async (e) => {
      const respond = e.target.closest("[data-respond]");
      const step = e.target.closest("[data-step]");
      const photo = e.target.closest("[data-photo]");
      try {
        if (respond) {
          if (respond.dataset.respond === "DECLINE" && !respond.classList.contains("is-confirming")) {
            respond.classList.add("is-confirming");
            respond.textContent = "Tap again to decline";
            return;
          }
          respond.disabled = true;
          const reason = ($("[data-reason]", main) || {}).value || "";
          const done = await http().post(`/artist/requests/${encodeURIComponent(r.requestNumber)}/respond`, { decision: respond.dataset.respond, reason });
          FrameX.toast.show(respond.dataset.respond === "ACCEPT" ? `Accepted. The customer has been asked for the ${pct}% advance.` : "Declined. The customer has been told; nothing was charged.");
          return request(main, number, done.request);
        }
        if (step) {
          step.disabled = true;
          const note = ($("[data-note]", main) || {}).value || "";
          const done = await http().post(`/artist/requests/${encodeURIComponent(r.requestNumber)}/step`, { step: step.dataset.step, note });
          FrameX.toast.show({ start: "Started. Good luck with the painting.", complete: `Marked as completed. The customer has been asked for the remaining ${100 - pct}%.`, dispatch: "Marked as dispatched.", deliver: "Marked as delivered." }[step.dataset.step]);
          return request(main, number, done.request);
        }
        if (photo) {
          const { link } = await http().post(`/artist/requests/${encodeURIComponent(r.requestNumber)}/photos/${photo.dataset.photo}/link`);
          const a2 = document.createElement("a");
          a2.href = http().fileUrl(link.path);
          a2.download = link.name || "";
          document.body.appendChild(a2);
          a2.click();
          a2.remove();
        }
      } catch (error) {
        if (respond) respond.disabled = false;
        if (step) step.disabled = false;
        say(error.message);
      }
    };
  }

  /* ---------------------------------------------------------------- Artworks */
  async function artworks(main, params) {
    const status = params.get("status") || "";
    const r = await http().get("/artist/artworks", { status });
    const tabs = [["", "All"], ["PENDING_REVIEW", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["INACTIVE", "Paused"], ["CANCELLED", "Withdrawn"]];
    main.innerHTML = `${head("Artworks", "Every artwork is reviewed by FrameX before customers can see it. Changing an artwork sends it back to review.", `<a class="btn btn--primary btn--sm" href="#/artworks/new">${icon("plus")} Add artwork</a>`)}
      <div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter">${tabs.map(([id, label]) => `<a class="chip" href="#/artworks${id ? `?status=${id}` : ""}" aria-pressed="${status === id}">${esc(label)}${id && r.counts[id] ? ` (${r.counts[id]})` : ""}</a>`).join("")}</div></div>
      ${r.items.length
        ? `<ul class="sd-list">${r.items
            .map((w) => `<li class="sd-item ad-item" data-artwork="${esc(w.id)}">
              ${w.images[0] ? `<img class="ad-thumb" src="${esc(img(w.images[0]))}" alt="" loading="lazy">` : ""}
              <div class="sd-item__main"><strong>${esc(w.title)}</strong><span class="sd-item__meta">${esc(w.artTypeName)} · ${esc(w.medium)} · ${esc(w.size)} · ${rupees(w.price)}</span>
                ${w.status === "REJECTED" && w.rejectionReason ? `<p class="ad-reason"><strong>Why it was rejected:</strong> ${esc(w.rejectionReason)}</p>` : ""}</div>
              ${artBadge(w.status)}
              <div class="sd-item__actions">
                ${w.status !== "CANCELLED" ? `<a class="iu-btn" href="#/artworks/${esc(w.id)}">${icon("edit")} Edit</a>` : ""}
                ${w.status === "APPROVED" ? `<a class="iu-btn" href="${esc(FrameX.qs.artworkUrl(w.id))}" target="_blank" rel="noopener">${icon("eye")} View</a><button class="iu-btn" type="button" data-set="INACTIVE">Pause</button>` : ""}
                ${w.status === "INACTIVE" ? `<button class="iu-btn iu-btn--go" type="button" data-set="APPROVED">Show again</button>` : ""}
                ${w.status !== "CANCELLED" ? `<button class="iu-btn iu-btn--danger" type="button" data-set="CANCELLED">Withdraw</button>` : `<button class="iu-btn iu-btn--go" type="button" data-set="PENDING_REVIEW">Send for review again</button>`}
              </div></li>`)
            .join("")}</ul>`
        : emptyBox("image", status ? "Nothing here" : "No artworks yet", status ? "No artwork matches this filter." : "Add your finished paintings, drawings and prints. FrameX reviews each one before it is shown.", `<a class="btn btn--primary btn--sm" href="#/artworks/new">Add your first artwork</a>`)}`;
    main.onclick = async (e) => {
      const btn = e.target.closest("[data-set]");
      if (!btn) return;
      if (btn.dataset.set === "CANCELLED" && !btn.classList.contains("is-confirming")) {
        btn.classList.add("is-confirming");
        btn.textContent = "Tap again to withdraw";
        return;
      }
      btn.disabled = true;
      try {
        await http().post(`/artist/artworks/${encodeURIComponent(btn.closest("[data-artwork]").dataset.artwork)}/status`, { status: btn.dataset.set });
        FrameX.toast.show({ INACTIVE: "Paused. Customers can't see it now.", APPROVED: "Shown again.", CANCELLED: "Withdrawn. You can send it for review again from the Withdrawn list.", PENDING_REVIEW: "Sent for review. Customers see it again once FrameX approves it." }[btn.dataset.set]);
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
      artworks(main, params);
    };
  }

  async function artworkForm(main, id) {
    const types = (await http().get("/artist/artworks")).artTypes;
    const w = id === "new" ? { id: newId(), title: "", price: "", artType: "", medium: "", size: "", kind: "ORIGINAL", handmade: true, frameIncluded: false, frameDetails: "", canvasDetails: "", year: "", stock: 1, shipping: "", care: [], tags: [], description: "", images: [], imageRefs: [], status: null } : (await http().get(`/artist/artworks/${encodeURIComponent(id)}`)).artwork;
    const pics = w.imageRefs.map((ref, i) => ({ ref, url: w.images[i] }));
    const f = forms().field;
    const text = (name, label, value, opts = {}) => f(name, label, { value, prefix: "aw", ...opts });

    main.innerHTML = `<a class="sd-back" href="#/artworks">${icon("chev-left")} All artworks</a>
      ${head(id === "new" ? "Add artwork" : "Edit artwork", w.status === "APPROVED" ? "This artwork is approved. If you change it, it goes back to FrameX for review and is hidden until it is approved again." : "FrameX reviews it before customers can see it.", w.status ? artBadge(w.status) : "")}
      ${w.status === "REJECTED" && w.rejectionReason ? `<p class="ad-reason" style="margin-bottom:14px"><strong>Why it was rejected:</strong> ${esc(w.rejectionReason)}</p>` : ""}
      <form class="ad-form" novalidate>
        <div class="form-field" data-invalid="false"><label>Pictures <span class="hint">(the first one is the main picture; up to 8)</span></label>
          <div class="ad-pics" data-pics></div><p class="form-field__error" id="aw-images-err">${icon("alert")}<span></span></p></div>
        ${text("title", "Title", w.title, { required: true, maxlength: 140 })}
        <div class="ad-form__row">
          <div class="form-field" data-invalid="false"><label for="aw-artType">Art type</label><select class="select" id="aw-artType" name="artType" required aria-describedby="aw-artType-err"><option value="">Choose…</option>${types.map((t) => `<option value="${esc(t.id)}"${t.id === w.artType ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select><p class="form-field__error" id="aw-artType-err">${icon("alert")}<span></span></p></div>
          ${text("medium", "Medium", w.medium, { required: true, maxlength: 80, placeholder: "e.g. Oil on canvas" })}
        </div>
        <div class="ad-form__row">${text("size", "Size", w.size, { required: true, maxlength: 60, placeholder: "e.g. 18 x 24 in" })}${text("price", "Price (₹)", w.price, { required: true, inputmode: "numeric", placeholder: "Whole rupees" })}</div>
        <div class="ad-form__row">
          <div class="form-field" data-invalid="false"><label for="aw-kind">Original or print</label><select class="select" id="aw-kind" name="kind"><option value="ORIGINAL"${w.kind !== "PRINT" ? " selected" : ""}>Original (one piece)</option><option value="PRINT"${w.kind === "PRINT" ? " selected" : ""}>Print (several copies)</option></select></div>
          ${text("stock", "Copies available (prints only)", w.kind === "PRINT" ? w.stock : "", { inputmode: "numeric" })}
        </div>
        <div class="ad-form__row">${text("year", "Year it was made", w.year || "", { inputmode: "numeric", maxlength: 4 })}${text("canvasDetails", "Canvas details", w.canvasDetails, { maxlength: 200, placeholder: "e.g. Stretched cotton canvas" })}</div>
        <label class="ad-check"><input type="checkbox" name="handmade"${w.handmade ? " checked" : ""}> Handmade by me</label>
        <label class="ad-check"><input type="checkbox" name="frameIncluded"${w.frameIncluded ? " checked" : ""}> A frame is included</label>
        ${text("frameDetails", "Frame details", w.frameDetails, { maxlength: 200, placeholder: "e.g. Teak wood frame, ready to hang" })}
        ${text("description", "Description", w.description, { rows: 5, maxlength: 3000 })}
        ${text("shipping", "Shipping / delivery", w.shipping, { rows: 2, maxlength: 400, placeholder: "How you pack and send it, and how long it takes" })}
        ${text("care", "Care instructions", (w.care || []).join("\n"), { rows: 3, hint: "One per line." })}
        ${text("tags", "Tags", (w.tags || []).join(", "), { maxlength: 300, hint: "Separate with commas, e.g. river, evening, Odisha." })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--primary" type="submit">${id === "new" ? "Submit for review" : "Save and submit for review"}</button></div>
      </form>`;

    const form = $("form", main);
    const box = $("[data-pics]", main);
    const drawPics = () => {
      box.innerHTML = `${pics.map((p, i) => `<div class="ref-tile"><img src="${esc(img(p.url))}" alt="Picture ${i + 1}"><button class="ref-tile__remove" type="button" data-unpic="${i}" aria-label="Remove picture ${i + 1}">${icon("close")}</button></div>`).join("")}${pics.length < 8 ? `<label class="ref-tile ref-tile--add"><input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" data-addpic><span>${icon("upload")}Add picture</span></label>` : ""}`;
    };
    drawPics();
    box.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const r = await http().upload("/artist/media", file, { name: file.name });
        pics.push({ ref: r.media.ref, url: r.media.url });
        forms().setError(box, "");
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
      drawPics();
    });
    box.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-unpic]");
      if (!rm) return;
      pics.splice(Number(rm.dataset.unpic), 1);
      drawPics();
    });
    forms().handle(form, {
      busyLabel: "Saving…",
      send: (v) =>
        http().put(`/artist/artworks/${encodeURIComponent(w.id)}`, {
          title: v.title, price: Number(v.price), artType: v.artType, medium: v.medium, size: v.size, kind: v.kind, stock: v.kind === "PRINT" ? Number(v.stock) : 1, year: v.year ? Number(v.year) : null,
          handmade: form.handmade.checked, frameIncluded: form.frameIncluded.checked, frameDetails: v.frameDetails, canvasDetails: v.canvasDetails, description: v.description, shipping: v.shipping,
          care: v.care.split("\n"), tags: v.tags.split(","), images: pics.map((p) => p.ref),
        }),
      onSuccess() {
        FrameX.toast.show("Saved. It is waiting for FrameX's review.");
        window.location.hash = "#/artworks?status=PENDING_REVIEW";
      },
    });
  }

  /* ---------------------------------------------------------------- Price list */
  async function services(main) {
    const { items } = await http().get("/artist/services");
    const f = forms().field;
    const row = (s) => `<tr data-service="${esc(s.id)}"><td><strong>${esc(s.size)} ${esc(s.artType)}</strong><br><span class="sd-item__meta">${esc([s.title, s.medium, s.estDays ? `about ${s.estDays} days` : ""].filter(Boolean).join(" · "))}</span></td><td>${rupees(s.price)}</td><td><span class="sd-status sd-status--${s.active ? "published" : "draft"}">${s.active ? "Offered" : "Hidden"}</span></td><td><div class="sd-item__actions"><button class="iu-btn" type="button" data-edit>${icon("edit")} Edit</button><button class="iu-btn" type="button" data-toggle>${s.active ? "Hide" : "Offer"}</button><button class="iu-btn iu-btn--danger" type="button" data-remove>Remove</button></div></td></tr>`;
    const formHtml = (s = {}) => `<form class="ad-form" data-service-form="${esc(s.id || "")}" novalidate>
        <div class="ad-form__row">${f("title", "Service name", { required: true, value: s.title || "", maxlength: 80, placeholder: "e.g. Pencil portrait", prefix: "sv" })}${f("artType", "Art type", { required: true, value: s.artType || "", maxlength: 60, placeholder: "e.g. Pencil Drawing", prefix: "sv" })}</div>
        <div class="ad-form__row">${f("size", "Size", { required: true, value: s.size || "", maxlength: 40, placeholder: "e.g. 12 × 16", prefix: "sv" })}${f("price", "Fixed price (₹)", { required: true, value: s.price || "", inputmode: "numeric", prefix: "sv" })}</div>
        <div class="ad-form__row">${f("medium", "Medium", { value: s.medium || "", maxlength: 80, placeholder: "e.g. Graphite", prefix: "sv" })}${f("estDays", "Estimated days to complete", { value: s.estDays || "", inputmode: "numeric", prefix: "sv" })}</div>
        ${f("description", "Description", { value: s.description || "", rows: 2, maxlength: 600, prefix: "sv" })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <div style="display:flex;gap:10px"><button class="btn btn--dark btn--sm" type="submit">${s.id ? "Save service" : "Add service"}</button>${s.id ? `<a class="btn btn--outline btn--sm" href="#/services">Cancel</a>` : ""}</div>
      </form>`;
    main.innerHTML = `${head("Custom painting price list", "Each service is a size and type of work at a fixed price. Customers choose one and see the price before they send a request.")}
      ${items.length ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Service</th><th scope="col">Price</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${items.map(row).join("")}</tbody></table></div>` : emptyBox("receipt", "No services yet", "Add at least one service so customers can send you a custom painting request.")}
      <h2 class="ad-subtitle" data-form-title>Add a service</h2><div data-form>${formHtml()}</div>`;
    const wire = () =>
      forms().handle($("[data-service-form]", main), {
        busyLabel: "Saving…",
        send(v) {
          const id = $("[data-service-form]", main).dataset.serviceForm;
          const current = items.find((s) => s.id === id);
          const body = { title: v.title, artType: v.artType, size: v.size, price: Number(v.price), medium: v.medium, estDays: v.estDays ? Number(v.estDays) : null, description: v.description, active: current ? current.active : true };
          return id ? http().put(`/artist/services/${id}`, body) : http().post("/artist/services", body);
        },
        onSuccess() {
          FrameX.toast.show("Saved.");
          services(main);
        },
      });
    wire();
    main.onclick = async (e) => {
      const tr = e.target.closest("[data-service]");
      if (!tr) return;
      const s = items.find((x) => x.id === tr.dataset.service);
      try {
        if (e.target.closest("[data-edit]")) {
          $("[data-form-title]", main).textContent = "Edit service";
          $("[data-form]", main).innerHTML = formHtml(s);
          wire();
          return $("[data-form]", main).scrollIntoView({ block: "center" });
        }
        if (e.target.closest("[data-toggle]")) await http().put(`/artist/services/${s.id}`, { ...s, active: !s.active });
        else if (e.target.closest("[data-remove]")) {
          const btn = e.target.closest("[data-remove]");
          if (!btn.classList.contains("is-confirming")) {
            btn.classList.add("is-confirming");
            btn.textContent = "Tap again";
            return;
          }
          await http().delete(`/artist/services/${s.id}`);
        } else return;
        services(main);
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /* ---------------------------------------------------------------- Orders of artworks */
  async function orders(main) {
    const r = await http().get("/artist/orders");
    main.innerHTML = `${head("Artwork orders", "Orders that contain one of your artworks. Pack it carefully and update where you are with it.")}
      ${r.items.length
        ? `<ul class="sd-list">${r.items.map((o) => `<li class="sd-item ad-item"><a class="sd-item__main" href="#/orders/${esc(o.orderNumber)}"><strong>${esc(o.firstItem ? o.firstItem.name : o.orderNumber)}</strong><span class="sd-item__meta">${esc(o.orderNumber)} · ${esc(o.customerName)} · ${rupees(o.itemsTotal)} · ${esc(when(o.placedAt))}</span><span class="sd-item__meta">${esc(o.payment)}</span></a>${o.needsAction ? `<span class="sd-status sd-status--pending_review">New</span>` : `<span class="sd-status sd-status--published">${esc(o.status.replace(/_/g, " ").toLowerCase())}</span>`}</li>`).join("")}</ul>`
        : emptyBox("package", "No orders yet", "When a customer buys one of your approved artworks, the order appears here.")}`;
  }

  async function order(main, number, loaded = null) {
    const o = loaded || (await http().get(`/artist/orders/${encodeURIComponent(number)}`)).order;
    const d = o.deliverTo;
    main.innerHTML = `<a class="sd-back" href="#/orders">${icon("chev-left")} All orders</a>
      ${head(`Order ${o.orderNumber}`, `${esc(when(o.placedAt))} · ${esc(o.payment)}`)}
      <div class="cp-layout">
        <section class="art-panel"><h2>Your ${o.items.length === 1 ? "artwork" : "artworks"} in this order</h2>
          <ul class="cp-history">${o.items
            .map((i) => `<li data-item="${esc(i.id)}"><strong>${esc(i.name)}</strong><small>${esc([i.size, `Qty ${i.quantity}`, rupees(i.lineTotal)].filter(Boolean).join(" · "))}</small>
              ${o.canUpdate ? `<span style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px"><select class="select" data-step aria-label="Where you are with ${esc(i.name)}">${o.fulfilmentStatuses.map((s) => `<option value="${s.id}"${s.id === i.fulfilment.status ? " selected" : ""}>${esc(s.label)}</option>`).join("")}</select><button class="iu-btn iu-btn--go" type="button" data-save>Update</button></span>` : `<small>${esc((o.fulfilmentStatuses.find((s) => s.id === i.fulfilment.status) || {}).label || "")}</small>`}</li>`)
            .join("")}</ul>
        </section>
        <section class="art-panel"><h2>Deliver to</h2><p><strong>${esc(d.name || "")}</strong><br>${esc([d.line1, d.line2, d.landmark].filter(Boolean).join(", "))}<br>${esc([d.city, d.state, d.postalCode].filter(Boolean).join(", "))}${d.phone ? `<br>Phone: ${esc(d.phone)}` : ""}</p></section>
      </div>`;
    main.onclick = async (e) => {
      const save = e.target.closest("[data-save]");
      if (!save) return;
      const li = save.closest("[data-item]");
      save.disabled = true;
      try {
        const r = await http().patch(`/artist/orders/${encodeURIComponent(o.orderNumber)}/items/${li.dataset.item}`, { status: $("[data-step]", li).value });
        FrameX.toast.show("Updated. The customer can see it in their order.");
        order(main, number, r.order);
      } catch (error) {
        save.disabled = false;
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /* ---------------------------------------------------------------- Profile */
  async function profile(main) {
    const p = (await http().get("/artist/profile")).profile;
    const f = forms().field;
    let photoRef = p.photoRef;
    main.innerHTML = `${head("Your profile", "This is what customers see on your public page. Your phone number and email are never shown.")}
      <form class="ad-form" novalidate>
        <div class="form-field"><label>Profile photo</label><div class="ad-pics" data-photo></div></div>
        <div class="ad-form__row">${f("name", "Artist name", { required: true, value: p.name, maxlength: 80, prefix: "ap" })}${f("username", "Username", { required: true, value: p.username, maxlength: 30, prefix: "ap", hint: "Shown as @username. Letters, numbers, dots and underscores." })}</div>
        ${f("bio", "Story / about you", { value: p.bio, rows: 5, maxlength: 2000, prefix: "ap" })}
        ${f("experience", "Experience", { value: p.experience, maxlength: 300, placeholder: "e.g. 8 years, fine arts graduate", prefix: "ap" })}
        <div class="ad-form__row">${f("specialties", "Specialties", { value: p.specialties.join(", "), maxlength: 400, prefix: "ap", hint: "Separate with commas." })}${f("mediums", "Mediums", { value: p.mediums.join(", "), maxlength: 400, prefix: "ap", hint: "Separate with commas." })}</div>
        ${f("styles", "Art styles", { value: p.styles.join(", "), maxlength: 400, prefix: "ap", hint: "Separate with commas. Customers can search by these." })}
        <div class="ad-form__row">${f("city", "City", { required: true, value: p.location.city, maxlength: 80, prefix: "ap" })}${f("state", "State", { required: true, value: p.location.state, maxlength: 80, prefix: "ap" })}</div>
        ${f("area", "Area / locality", { value: p.area, maxlength: 120, prefix: "ap", hint: "Only the area, never your street address." })}
        <label class="ad-check"><input type="checkbox" name="showArea"${p.showArea ? " checked" : ""}> Show my area on my public profile (your city is always shown)</label>
        <label class="ad-check"><input type="checkbox" name="customEnabled"${p.customEnabled ? " checked" : ""}> I am taking custom painting requests</label>
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--primary" type="submit">Save profile</button></div>
      </form>`;
    const form = $("form", main);
    const box = $("[data-photo]", main);
    let url = p.photo;
    const draw = () => (box.innerHTML = `${url ? `<div class="ref-tile"><img src="${esc(img(url))}" alt="Your profile photo"></div>` : ""}<label class="ref-tile ref-tile--add"><input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp"><span>${icon("upload")}${url ? "Change" : "Add photo"}</span></label>`);
    draw();
    box.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const r = await http().upload("/artist/media", file, { name: file.name });
        photoRef = r.media.ref;
        url = r.media.url;
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
      draw();
    });
    forms().handle(form, {
      busyLabel: "Saving…",
      send: (v) => http().patch("/artist/profile", { name: v.name, username: v.username, bio: v.bio, experience: v.experience, specialties: v.specialties, mediums: v.mediums, styles: v.styles, city: v.city, state: v.state, area: v.area, showArea: form.showArea.checked, customEnabled: form.customEnabled.checked, ...(photoRef !== p.photoRef ? { photo: photoRef } : {}) }),
      async onSuccess() {
        FrameX.toast.show("Your profile was saved.");
        me = await FrameX.auth.refresh();
        profile(layout("profile"));
      },
    });
  }

  /* ---------------------------------------------------------------- Router */
  async function route() {
    const { parts, params } = parse();
    const section = NAV.some(([id]) => id === parts[0]) ? parts[0] : "overview";
    const main = layout(section);
    main.onclick = null;
    main.innerHTML = `<div class="skeleton" style="height:120px"></div>`;
    document.title = `${NAV.find(([id]) => id === section)[1]} — FrameX artist dashboard`;
    try {
      if (section === "overview") await overview(main);
      if (section === "requests") await (parts[1] ? request(main, parts[1]) : requests(main, params));
      if (section === "artworks") await (parts[1] ? artworkForm(main, parts[1]) : artworks(main, params));
      if (section === "services") await services(main);
      if (section === "orders") await (parts[1] ? order(main, parts[1]) : orders(main));
      if (section === "profile") await profile(main);
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      if (error.status === 403) return window.location.replace("index.html");
      if (error.status === 404) return (main.innerHTML = emptyBox("alert", "That doesn't exist any more", "It may have been removed.", `<a class="btn btn--outline btn--sm" href="#/overview">Back to overview</a>`));
      console.error("Artist dashboard view failed", error);
      FrameX.templates.showError(main, "This page couldn't be loaded.", route);
    }
  }

  async function init() {
    root = $("#artist-dashboard-root");
    if (!root) return;
    me = await FrameX.auth.guard(["ARTIST"], {
      onForbidden() {
        root.innerHTML = `<div class="not-found">${icon("lock")}<h1 class="section-title">Artists only</h1><p class="section-lead">This page is for artists who sell on FrameX.</p><a class="btn btn--dark" href="art.html#join">Join as an artist</a></div>`;
      },
    });
    if (!me) return;
    window.addEventListener("hashchange", route);
    route();
  }

  FrameX.artistDashboard = { init };
})((window.FrameX = window.FrameX || {}));
