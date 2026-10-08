/* ==========================================================================
   Admin dashboard: Art & Artists, custom paintings, platform settings,
   accounts and reviews (FrameX.adminArt). Used by ui/admin-page.js, which
   owns the layout, the navigation and the admin check.

   Every view here only shows what /api/admin answers and sends what the admin
   chose: the backend checks the admin role on each request and decides what
   is allowed (an artwork can only be decided while it waits for review, a
   rejection needs a reason, a setting must be inside its limits).
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const forms = () => FrameX.forms;
  const pv = () => FrameX.paintingView;
  const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const img = (path) => (path ? http().asset(path) : "");
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const emptyBox = (ic, title, text = "") => `<div class="sd-empty">${icon(ic)}<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ""}</div>`;
  const chips = (base, key, current, options) => `<div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter">${options.map(([id, label]) => `<a class="chip" href="#/${base}${id ? `?${key}=${id}` : ""}" aria-pressed="${current === id}">${esc(label)}</a>`).join("")}</div></div>`;
  const confirmTwice = (btn, label) => {
    if (btn.classList.contains("is-confirming")) return true;
    btn.classList.add("is-confirming");
    btn.dataset.label = btn.textContent;
    btn.textContent = label;
    setTimeout(() => btn.isConnected && (btn.classList.remove("is-confirming"), (btn.textContent = btn.dataset.label)), 4000);
    return false;
  };
  const credentials = (c) => `<div class="ad-credentials" role="status"><strong>${c.emailed ? "Setup link emailed" : "Setup link created"}</strong>
      <p>${c.emailed ? `We emailed the link to ${esc(c.accountEmail)}.` : `Email isn't set up, so pass this link to the artist yourself (${esc(c.accountEmail)}).`} It works once and expires on ${esc(when(c.expiresAt))}.</p>
      <div class="ad-link"><input class="input" type="text" readonly value="${esc(c.setupUrl)}" aria-label="One-time setup link"><button class="btn btn--dark btn--sm" type="button" data-copy="${esc(c.setupUrl)}">${icon("copy")} Copy link</button></div></div>`;

  /* ---------------------------------------------------------------- Artists */
  const ART_STATUS = { ACTIVE: "Listed", INACTIVE: "Not listed" };

  function artistFields(a = {}, { account = true } = {}) {
    const f = forms().field;
    return `<div class="ad-form__row">${f("name", "Artist name", { required: true, value: a.name || "", maxlength: 80, prefix: "ar" })}${f("username", "Username", { value: a.username || "", maxlength: 30, prefix: "ar", hint: "Leave empty to make one from the name." })}</div>
      <div class="ad-form__row">${f("city", "City", { required: true, value: a.city || "", maxlength: 80, prefix: "ar" })}${f("state", "State", { required: true, value: a.state || "", maxlength: 80, prefix: "ar" })}</div>
      <div class="ad-form__row">${f("area", "Area / locality", { value: a.area || "", maxlength: 120, prefix: "ar", hint: "Never a street address." })}${f("experience", "Experience", { value: a.experience || "", maxlength: 300, prefix: "ar" })}</div>
      <div class="ad-form__row">${f("styles", "Art styles", { value: a.styles || "", maxlength: 300, prefix: "ar", hint: "Separate with commas." })}${f("mediums", "Mediums", { value: a.mediums || "", maxlength: 300, prefix: "ar", hint: "Separate with commas." })}</div>
      ${f("bio", "About", { value: a.bio || "", rows: 3, maxlength: 2000, prefix: "ar" })}
      ${account ? f("accountEmail", "Login email", { required: true, type: "email", value: a.email || "", prefix: "ar", hint: "The artist gets a one-time link to set their own password. You never see or set it." }) : ""}`;
  }
  const readArtist = (v) => ({ name: v.name, username: v.username, city: v.city, state: v.state, area: v.area, experience: v.experience, bio: v.bio, styles: v.styles, mediums: v.mediums });

  async function artists(main, params, { head }) {
    const tab = params.get("tab") || "artists";
    const done = params.get("done");
    if (tab === "new") {
      main.innerHTML = `<a class="sd-back" href="#/artists">${icon("chev-left")} Artists</a>${head("Add an artist", "For an artist you onboarded yourself. They get a one-time link to set their password.")}
        <form class="ad-form" novalidate>${artistFields()}<div class="form-status" role="status" aria-live="polite"></div><div><button class="btn btn--primary" type="submit">Create artist</button></div></form><div data-result></div>`;
      forms().handle($("form", main), {
        busyLabel: "Creating…",
        send: (v) => http().post("/admin/artists", { artist: readArtist(v), accountEmail: v.accountEmail }),
        onSuccess(r) {
          $("form", main).hidden = true;
          $("[data-result]", main).innerHTML = `<p class="sd-lead">${esc(r.artist.name)} was created (<code>${esc(r.artist.artistCode)}</code>).</p>${r.credentials ? credentials(r.credentials) : ""}<p style="margin-top:12px"><a class="btn btn--outline btn--sm" href="#/artists">Back to artists</a></p>`;
        },
      });
      return;
    }
    const [apps, list] = await Promise.all([http().get("/admin/artist-applications", { status: "PENDING" }), http().get("/admin/artists")]);
    main.innerHTML = `${head("Artists", "Artists apply from the Art & Artists page. Approving creates their profile and a login they finish with a one-time link. There is no public artist sign-up.", `<a class="btn btn--primary btn--sm" href="#/artists?tab=new">${icon("plus")} Add an artist</a>`)}
      <h2 class="ad-subtitle">Applications to review (${apps.items.length})</h2>
      ${apps.items.length
        ? `<ul class="sd-list">${apps.items
            .map((a) => `<li class="sd-item ad-item" data-app="${esc(a.id)}"><div class="sd-item__main"><strong>${esc(a.name)}</strong><span class="sd-item__meta">${esc([a.city, a.state].join(", "))} · ${esc(a.email)} · ${esc(a.phone)} · ${esc(when(a.createdAt))}</span>
              <span class="sd-item__meta">${esc([a.artStyles && `Styles: ${a.artStyles}`, a.mediums && `Mediums: ${a.mediums}`, a.experience && `Experience: ${a.experience}`].filter(Boolean).join(" · "))}</span>
              ${a.portfolioUrl ? `<span class="sd-item__meta"><a href="${esc(a.portfolioUrl)}" target="_blank" rel="noopener noreferrer nofollow">Their work</a></span>` : ""}${a.message ? `<span class="sd-item__meta">“${esc(a.message)}”</span>` : ""}
              <div data-approve hidden></div></div>
              <div class="sd-item__actions"><button class="iu-btn iu-btn--go" type="button" data-open>${icon("check")} Approve…</button><button class="iu-btn iu-btn--danger" type="button" data-reject>Reject</button></div></li>`)
            .join("")}</ul>`
        : emptyBox("check", "No applications waiting")}
      <div data-result>${done ? "" : ""}</div>
      <h2 class="ad-subtitle">Artists (${list.items.length})</h2>
      ${list.items.length
        ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Artist</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Login</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${list.items
            .map((a) => `<tr data-artist="${esc(a.uuid)}"><td><strong>${esc(a.name)}</strong><br><span class="sd-item__meta">@${esc(a.username)} · <code>${esc(a.artistCode)}</code> · ${a.artworkCount} artworks</span></td>
              <td>${esc([a.area, a.location.city, a.location.state].filter(Boolean).join(", "))}</td>
              <td><span class="sd-status sd-status--${a.status === "ACTIVE" ? "published" : "draft"}">${esc(ART_STATUS[a.status])}</span></td>
              <td>${a.account ? `${esc(a.account.email)}<br><span class="sd-item__meta">${esc({ ACTIVE: "Active", PENDING_SETUP: "Waiting for password setup", DISABLED: "Disabled" }[a.account.status] || a.account.status)}</span>` : `<span class="sd-item__meta">No login yet</span>`}</td>
              <td><div class="sd-item__actions"><a class="iu-btn" href="artist.html?artist=${encodeURIComponent(a.username)}" target="_blank" rel="noopener">${icon("eye")} View</a>
                <button class="iu-btn" type="button" data-status="${a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}">${a.status === "ACTIVE" ? "Unlist" : "List"}</button>
                ${a.account ? `<button class="iu-btn" type="button" data-link>New setup link</button>` : ""}</div></td></tr>`)
            .join("")}</tbody></table></div>`
        : emptyBox("users", "No artists yet", "Approve an application or add an artist.")}`;

    main.onclick = async (e) => {
      const app = e.target.closest("[data-app]");
      const row = e.target.closest("[data-artist]");
      try {
        if (app && e.target.closest("[data-open]")) {
          const a = apps.items.find((x) => x.id === app.dataset.app);
          const box = $("[data-approve]", app);
          box.hidden = false;
          box.innerHTML = `<form class="ad-form" style="margin-top:12px" novalidate>${artistFields({ name: a.name, city: a.city, state: a.state, styles: a.artStyles, mediums: a.mediums, experience: a.experience, email: a.email })}<div class="form-status" role="status" aria-live="polite"></div><div><button class="btn btn--primary btn--sm" type="submit">Approve and create login</button></div></form>`;
          forms().handle($("form", box), {
            busyLabel: "Approving…",
            send: (v) => http().post(`/admin/artist-applications/${a.id}/approve`, { artist: readArtist(v), accountEmail: v.accountEmail }),
            onSuccess(r) {
              app.innerHTML = `<div class="sd-item__main"><strong>${esc(r.artist.name)} is approved</strong><span class="sd-item__meta"><code>${esc(r.artist.artistCode)}</code> · @${esc(r.artist.username)}</span>${credentials(r.credentials)}</div>`;
            },
          });
          return;
        }
        if (app && e.target.closest("[data-reject]")) {
          if (!confirmTwice(e.target.closest("[data-reject]"), "Tap again to reject")) return;
          await http().post(`/admin/artist-applications/${app.dataset.app}/reject`, { reason: "" });
          FrameX.toast.show("Application rejected. The applicant was told by email.");
          return artists(main, params, { head });
        }
        if (row && e.target.closest("[data-status]")) {
          const btn = e.target.closest("[data-status]");
          if (btn.dataset.status === "INACTIVE" && !confirmTwice(btn, "Tap again to unlist")) return;
          await http().post(`/admin/artists/${row.dataset.artist}/status`, { status: btn.dataset.status });
          FrameX.toast.show(btn.dataset.status === "ACTIVE" ? "Listed." : "Unlisted. Their artworks are off sale and they get no new requests.");
          return artists(main, params, { head });
        }
        if (row && e.target.closest("[data-link]")) {
          const r = await http().post(`/admin/artists/${row.dataset.artist}/credentials`, {});
          $("[data-result]", main).innerHTML = credentials(r.credentials);
          $("[data-result]", main).scrollIntoView({ block: "center" });
        }
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /* ---------------------------------------------------------------- Artworks */
  const AW_STATUS = { PENDING_REVIEW: "Waiting for review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Withdrawn", INACTIVE: "Hidden" };
  const AW_TONE = { PENDING_REVIEW: "pending_review", APPROVED: "published", REJECTED: "unpublished", CANCELLED: "draft", INACTIVE: "draft" };

  async function artworks(main, params, { head }) {
    const status = params.get("status") || "";
    const r = await http().get("/admin/artworks", { status });
    main.innerHTML = `${head("Artworks", "Nothing an artist adds is public until it is approved here. A rejection needs a reason: the artist sees it.")}
      ${chips("artworks", "status", status, [["", "All"], ["PENDING_REVIEW", `Waiting for review (${r.counts.PENDING_REVIEW})`], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["INACTIVE", "Hidden"], ["CANCELLED", "Withdrawn"]])}
      ${r.items.length
        ? `<ul class="sd-list">${r.items
            .map((w) => `<li class="sd-item ad-item" data-artwork="${esc(w.id)}">
              ${w.images[0] ? `<a href="${esc(img(w.images[0]))}" target="_blank" rel="noopener"><img class="ad-thumb" src="${esc(img(w.images[0]))}" alt="" loading="lazy"></a>` : ""}
              <div class="sd-item__main"><strong>${esc(w.title)}</strong><span class="sd-item__meta">by ${esc(w.artistName)} (<code>${esc(w.artistCode)}</code>) · ${esc(w.artTypeName)} · ${esc(w.medium)} · ${esc(w.size)} · ${esc(w.kind === "PRINT" ? `Print, ${w.stock} copies` : "Original")} · ${rupees(w.price)}</span>
                ${w.description ? `<span class="sd-item__meta">${esc(w.description.slice(0, 220))}${w.description.length > 220 ? "…" : ""}</span>` : ""}
                <span class="sd-item__meta">${w.images.length} ${w.images.length === 1 ? "picture" : "pictures"} · submitted ${esc(when(w.submittedAt))}</span>
                ${w.status === "REJECTED" && w.rejectionReason ? `<p class="ad-reason"><strong>Rejected:</strong> ${esc(w.rejectionReason)}</p>` : ""}
                ${w.status === "PENDING_REVIEW" ? `<label class="form-field" style="margin-top:8px"><span>Reason, if you reject it <span class="hint">(the artist sees this)</span></span><input class="input" type="text" maxlength="500" data-reason></label>` : ""}</div>
              <span class="sd-status sd-status--${AW_TONE[w.status]}">${esc(AW_STATUS[w.status])}</span>
              <div class="sd-item__actions">
                ${w.status === "PENDING_REVIEW" ? `<button class="iu-btn iu-btn--go" type="button" data-review="APPROVED">${icon("check")} Approve</button><button class="iu-btn iu-btn--danger" type="button" data-review="REJECTED">Reject</button>` : ""}
                ${w.status === "APPROVED" ? `<a class="iu-btn" href="artwork.html?id=${encodeURIComponent(w.id)}" target="_blank" rel="noopener">${icon("eye")} View</a><button class="iu-btn iu-btn--danger" type="button" data-visible="false">Hide</button>` : ""}
                ${w.status === "INACTIVE" ? `<button class="iu-btn iu-btn--go" type="button" data-visible="true">Show again</button>` : ""}
              </div></li>`)
            .join("")}</ul>`
        : emptyBox("image", status ? "No artwork matches this filter" : "No artist has added an artwork yet")}`;
    main.onclick = async (e) => {
      const li = e.target.closest("[data-artwork]");
      if (!li) return;
      const review = e.target.closest("[data-review]");
      const visible = e.target.closest("[data-visible]");
      try {
        if (review) {
          const reason = ($("[data-reason]", li) || {}).value || "";
          if (review.dataset.review === "REJECTED" && reason.trim().length < 3) {
            $("[data-reason]", li).focus();
            return FrameX.toast.show("Write the reason first: the artist needs to know what to change.");
          }
          review.disabled = true;
          await http().post(`/admin/artworks/${encodeURIComponent(li.dataset.artwork)}/review`, { decision: review.dataset.review, reason });
          FrameX.toast.show(review.dataset.review === "APPROVED" ? "Approved. It is public now, and the artist was told." : "Rejected. The artist was told why.");
        } else if (visible) {
          if (visible.dataset.visible === "false" && !confirmTwice(visible, "Tap again to hide")) return;
          await http().post(`/admin/artworks/${encodeURIComponent(li.dataset.artwork)}/visible`, { visible: visible.dataset.visible === "true" });
        } else return;
        artworks(main, params, { head });
      } catch (error) {
        if (review) review.disabled = false;
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /* ---------------------------------------------------------------- Custom paintings */
  async function paintings(main, params, { head }) {
    const status = params.get("status") || "";
    const r = await http().get("/admin/paintings", { status });
    const c = r.counts;
    main.innerHTML = `${head("Custom paintings", "Every custom painting request, from the first message to delivery. Payments are verified by the server; refunds are recorded here after you make them.")}
      ${chips("paintings", "status", status, [["", "All"], ["PENDING_ARTIST_RESPONSE", `Waiting for artist (${c.PENDING_ARTIST_RESPONSE})`], ["ADVANCE_PAYMENT_PENDING", `Advance pending (${c.ADVANCE_PAYMENT_PENDING})`], ["PAINTING_IN_PROGRESS", `In progress (${c.PAINTING_IN_PROGRESS})`], ["REMAINING_PAYMENT_PENDING", `Balance pending (${c.REMAINING_PAYMENT_PENDING})`], ["READY_FOR_DISPATCH", "Ready"], ["SHIPPED", "Dispatched"], ["DELIVERED", "Delivered"], ["CANCELLED", "Cancelled"], ["DECLINED", "Declined"]])}
      ${c.refundPending ? `<p class="ad-reason" style="margin-bottom:12px"><strong>${c.refundPending}</strong> cancelled ${c.refundPending === 1 ? "request has" : "requests have"} money waiting to be refunded. Open the cancelled requests to record the refund.</p>` : ""}
      ${r.items.length
        ? `<ul class="sd-list">${r.items.map((p) => `<li class="sd-item ad-item"><a class="sd-item__main" href="#/paintings/${esc(p.requestNumber)}"><strong>${esc(p.requestNumber)} · ${esc(p.service.size)} ${esc(p.service.artType)}</strong><span class="sd-item__meta">${esc(p.customerName)} → ${esc(p.artist.name)} · ${rupees(p.price)} · paid ${rupees(p.amountPaid)} · ${esc(when(p.updatedAt))}</span>${p.refundStatus === "REFUND_PENDING" ? `<span class="sd-item__meta">Refund waiting</span>` : ""}</a>${pv().badge(p.status)}</li>`).join("")}</ul>`
        : emptyBox("mail", status ? "No request matches this filter" : "No custom painting requests yet")}`;
  }

  async function painting(main, number, { head }, loaded = null) {
    const r = loaded || (await http().get(`/admin/paintings/${encodeURIComponent(number)}`)).request;
    const a = r.deliverTo || {};
    const canCancel = !["SHIPPED", "DELIVERED", "DECLINED", "CANCELLED"].includes(r.status);
    main.innerHTML = `<a class="sd-back" href="#/paintings">${icon("chev-left")} All custom paintings</a>
      ${head(`Request ${r.requestNumber}`, `${esc(r.service.size)} ${esc(r.service.artType)} · ${esc(r.artist.name)} · ${esc(when(r.createdAt))}`, pv().badge(r.status))}
      <div class="cp-layout">
        <div style="display:grid;gap:var(--grid-gap)">
          <section class="art-panel"><h2>Request</h2><dl class="art-facts">
            <div><dt>Customer</dt><dd>${esc(r.customer.name)} · ${esc(r.customer.email)}${r.customer.phone ? ` · ${esc(r.customer.phone)}` : ""}</dd></div>
            <div><dt>Artist</dt><dd>${esc(r.artist.name)} (@${esc(r.artist.username)}, <code>${esc(r.artist.artistCode)}</code>)</dd></div>
            <div><dt>Service</dt><dd>${esc([r.service.title, r.service.artType, r.service.medium, r.service.size].filter(Boolean).join(" · "))}</dd></div>
            <div><dt>Instructions</dt><dd>${r.instructions ? esc(r.instructions) : "None"}</dd></div>
            <div><dt>Deliver to</dt><dd>${esc([a.fullName, a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", "))}</dd></div>
            <div><dt>Reference photos</dt><dd>${r.referencePhotos.length} (${r.referencePhotos.map((p) => `${p.width} × ${p.height}`).join(", ")})</dd></div>
            ${r.declineReason ? `<div><dt>Decline reason</dt><dd>${esc(r.declineReason)}</dd></div>` : ""}${r.cancelReason ? `<div><dt>Cancel reason</dt><dd>${esc(r.cancelReason)}</dd></div>` : ""}${r.dispatchNote ? `<div><dt>Dispatch</dt><dd>${esc(r.dispatchNote)}</dd></div>` : ""}
          </dl></section>
          <section class="art-panel"><h2>Payments</h2>
            <div class="cp-split"><div class="is-total"><span>Price</span><strong>${rupees(r.price)}</strong></div><div><span>Advance (${r.advancePercent}%)</span><strong>${rupees(r.advanceAmount)}</strong></div><div><span>On completion (${100 - r.advancePercent}%)</span><strong>${rupees(r.balanceAmount)}</strong></div><div><span>Paid</span><strong>${rupees(r.amountPaid)}</strong></div></div>
            ${r.payments.length ? `<ul class="cp-history" style="margin-top:12px">${r.payments.map((p) => `<li><span>${esc(p.stage === "ADVANCE" ? "Advance" : "Balance")} attempt ${p.attempt}: <strong>${esc(p.status)}</strong> · ${rupees(p.amount)}${p.method ? ` · ${esc(p.method)}` : ""}${p.reason ? ` · ${esc(p.reason)}` : ""}</span><small>${esc(when(p.paidAt || p.at))}</small></li>`).join("")}</ul>` : `<p class="pp-muted" style="margin-top:10px">No payment attempt yet.</p>`}
            ${r.refundStatus !== "NONE" ? `<p class="ad-reason" style="margin-top:12px"><strong>Refund: ${r.refundStatus === "REFUNDED" ? "recorded" : "waiting"}</strong>${r.refundNote ? ` — ${esc(r.refundNote)}` : ""}</p>` : ""}
          </section>
        </div>
        <aside style="display:grid;gap:var(--grid-gap)">
          <section class="art-panel"><h2>Actions</h2>
            ${canCancel ? `<form data-cancel class="ad-form" novalidate><label class="form-field"><span>Cancel this request (say why; the customer and the artist see it)</span><input class="input" type="text" name="reason" maxlength="300" required></label><div><button class="btn btn--outline btn--sm" type="submit">Cancel request</button></div><p class="form-field__hint">Nothing is refunded automatically. If the customer has paid, refund them in the payment gateway's dashboard, then record it here.</p></form>` : ""}
            ${r.refundStatus === "REFUND_PENDING" ? `<form data-refund class="ad-form" novalidate><label class="form-field"><span>Record the refund you made (amount and how)</span><input class="input" type="text" name="note" maxlength="300" required></label><div><button class="btn btn--dark btn--sm" type="submit">Record refund</button></div></form>` : ""}
            ${r.status === "SHIPPED" ? `<button class="btn btn--dark btn--sm" type="button" data-delivered>Mark as delivered</button>` : ""}
            ${!canCancel && r.refundStatus !== "REFUND_PENDING" && r.status !== "SHIPPED" ? `<p class="pp-muted">Nothing to do here.</p>` : ""}
            <div class="form-status" data-status role="status" aria-live="polite"></div>
          </section>
          <section class="art-panel"><h2>History</h2><ul class="cp-history">${r.history.slice().reverse().map((h) => `<li><span>${esc(h.detail || pv().STATUS[h.status] || "")}</span><small>${esc(when(h.at))} · ${esc(String(h.by || "").toLowerCase())}</small></li>`).join("")}</ul></section>
        </aside>
      </div>`;
    const say = (text) => forms().status($("[data-status]", main), "error", esc(text));
    const post = async (path, body) => {
      try {
        painting(main, number, { head }, (await http().post(`/admin/paintings/${encodeURIComponent(r.requestNumber)}/${path}`, body)).request);
      } catch (error) {
        say(error.message);
      }
    };
    const cancel = $("[data-cancel]", main);
    if (cancel) cancel.addEventListener("submit", (e) => (e.preventDefault(), post("cancel", { reason: cancel.reason.value })));
    const refund = $("[data-refund]", main);
    if (refund) refund.addEventListener("submit", (e) => (e.preventDefault(), post("refund-recorded", { note: refund.note.value })));
    const delivered = $("[data-delivered]", main);
    if (delivered) delivered.addEventListener("click", () => post("delivered", {}));
  }

  /* ---------------------------------------------------------------- Platform settings */
  async function settings(main, params, { head }) {
    const { items } = await http().get("/admin/settings");
    const groups = [...new Set(items.map((s) => s.group))];
    const control = (s) =>
      s.unit === "boolean"
        ? `<select class="select" data-setting="${esc(s.key)}" data-unit="boolean"><option value="true"${s.value ? " selected" : ""}>On</option><option value="false"${s.value ? "" : " selected"}>Off</option></select>`
        : `<input class="input" type="number" inputmode="decimal" step="${s.unit === "percent" && s.key !== "customPaintingAdvancePercent" ? "0.01" : "1"}" min="0" data-setting="${esc(s.key)}" data-unit="${esc(s.unit)}" value="${esc(s.value)}" aria-label="${esc(s.label)}">`;
    main.innerHTML = `${head("Platform settings", "Fees and rules FrameX decides. A change applies from the next quote or request; orders and requests already made keep what was agreed. Keys and passwords are not settings: they stay on the server.")}
      <form class="set-list" novalidate>
        ${groups.map((g) => `<h2 class="ad-subtitle">${esc(g)}</h2>${items.filter((s) => s.group === g).map((s) => `<div class="set-row"><div><strong>${esc(s.label)}</strong> <span class="sd-item__meta">(${esc(s.unit === "rupees" ? "₹" : s.unit === "percent" ? "%" : "on / off")})</span><small>${esc(s.hint || "")}${s.changed ? ` Changed by an admin; the server's default is ${esc(String(s.default))}.` : " Using the server's default."}</small></div><div>${control(s)}${s.changed ? `<button class="iu-btn" type="button" data-reset="${esc(s.key)}" style="margin-top:6px">Back to default</button>` : ""}</div></div>`).join("")}`).join("")}
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--primary" type="submit">Save settings</button></div>
      </form>`;
    const form = $("form", main);
    const status = $(".form-status", form);
    const send = async (changes) => {
      try {
        await http().patch("/admin/settings", changes);
        FrameX.toast.show("Settings saved.");
        settings(main, params, { head });
      } catch (error) {
        const fields = error.fields || {};
        forms().status(status, "error", esc(Object.keys(fields).length ? Object.entries(fields).map(([k, m]) => `${(items.find((s) => s.key === k) || { label: k }).label}: ${m}`).join(" ") : error.message));
      }
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const changes = {};
      form.querySelectorAll("[data-setting]").forEach((el) => {
        const s = items.find((x) => x.key === el.dataset.setting);
        const value = el.dataset.unit === "boolean" ? el.value === "true" : Number(el.value);
        if (value !== s.value) changes[s.key] = value;
      });
      if (!Object.keys(changes).length) return forms().status(status, "info", "Nothing was changed.");
      send(changes);
    });
    form.addEventListener("click", (e) => {
      const reset = e.target.closest("[data-reset]");
      if (reset) send({ [reset.dataset.reset]: null });
    });
  }

  /* ---------------------------------------------------------------- Accounts */
  async function users(main, params, { head }) {
    const role = params.get("role") || "";
    const q = params.get("q") || "";
    const r = await http().get("/admin/users", { role, q });
    const STATUS = { ACTIVE: "Active", PENDING_SETUP: "Waiting for password setup", DISABLED: "Disabled" };
    main.innerHTML = `${head("Accounts", "Customers, shops, artists and admins. A login can be switched off (it is logged out at once) and on again. Passwords are never shown or set here.")}
      ${chips("users", "role", role, [["", `All (${Object.values(r.counts).reduce((a, b) => a + b, 0)})`], ["CUSTOMER", `Customers (${r.counts.CUSTOMER})`], ["SHOP", `Shops (${r.counts.SHOP})`], ["ARTIST", `Artists (${r.counts.ARTIST})`], ["ADMIN", `Admins (${r.counts.ADMIN})`]])}
      <form class="sd-toolbar" data-search><label class="art-search"><span class="visually-hidden">Search accounts</span>${icon("search")}<input class="input" type="search" name="q" placeholder="Name, email or phone" value="${esc(q)}"></label><button class="btn btn--outline btn--sm" type="submit">Search</button></form>
      ${r.items.length
        ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Orders</th><th scope="col">Last login</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${r.items
            .map((u) => `<tr data-user="${esc(u.id)}"><td><strong>${esc(u.name)}</strong><br><span class="sd-item__meta">${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ""}</span></td><td>${esc(u.role.toLowerCase())}${u.shopCode ? `<br><span class="sd-item__meta"><code>${esc(u.shopCode)}</code></span>` : ""}${u.artistCode ? `<br><span class="sd-item__meta"><code>${esc(u.artistCode)}</code></span>` : ""}</td>
              <td><span class="sd-status sd-status--${u.status === "ACTIVE" ? "published" : u.status === "DISABLED" ? "unpublished" : "pending_review"}">${esc(STATUS[u.status] || u.status)}</span></td><td>${u.orders}</td><td>${esc(when(u.lastLoginAt) || "Never")}</td>
              <td><div class="sd-item__actions">${u.role === "ADMIN" ? "" : u.status === "DISABLED" ? `<button class="iu-btn iu-btn--go" type="button" data-enable="true">Enable</button>` : `<button class="iu-btn iu-btn--danger" type="button" data-enable="false">Disable</button>`}</div></td></tr>`)
            .join("")}</tbody></table></div>${r.total > r.items.length ? `<p class="sd-lead" style="margin-top:10px">Showing the newest ${r.items.length} of ${r.total}. Search to find others.</p>` : ""}`
        : emptyBox("users", "No account matches that")}`;
    $("[data-search]", main).addEventListener("submit", (e) => {
      e.preventDefault();
      const value = e.target.q.value.trim();
      window.location.hash = `#/users?${new URLSearchParams({ ...(role ? { role } : {}), ...(value ? { q: value } : {}) })}`;
    });
    main.onclick = async (e) => {
      const btn = e.target.closest("[data-enable]");
      if (!btn) return;
      if (btn.dataset.enable === "false" && !confirmTwice(btn, "Tap again to disable")) return;
      try {
        await http().post(`/admin/users/${btn.closest("[data-user]").dataset.user}/status`, { enabled: btn.dataset.enable === "true" });
        FrameX.toast.show(btn.dataset.enable === "true" ? "Enabled." : "Disabled. The account was logged out everywhere.");
        users(main, params, { head });
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /* ---------------------------------------------------------------- Reviews */
  async function reviews(main, params, { head }) {
    const { items } = await http().get("/admin/reviews");
    const KIND = { PRODUCT: "Product", SHOP: "Shop", ARTIST: "Artist", ARTWORK: "Artwork" };
    main.innerHTML = `${head("Reviews", "Reviews come only from customers whose order or painting was delivered. FrameX never writes or edits one; a review that breaks the rules can be hidden.")}
      ${items.length
        ? `<ul class="sd-list">${items.map((r) => `<li class="sd-item ad-item" data-review="${esc(r.id)}"><div class="sd-item__main"><strong>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)} · ${esc(KIND[r.targetType])} <code>${esc(r.targetId)}</code></strong><span class="sd-item__meta">${esc(r.author)} · ${esc(r.source)} · ${esc(when(r.createdAt))}</span>${r.body ? `<span class="sd-item__meta">“${esc(r.body)}”</span>` : ""}</div><span class="sd-status sd-status--${r.status === "PUBLISHED" ? "published" : "unpublished"}">${r.status === "PUBLISHED" ? "Shown" : "Hidden"}</span><div class="sd-item__actions"><button class="iu-btn ${r.status === "PUBLISHED" ? "iu-btn--danger" : "iu-btn--go"}" type="button" data-to="${r.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED"}">${r.status === "PUBLISHED" ? "Hide" : "Show"}</button></div></li>`).join("")}</ul>`
        : emptyBox("star", "No reviews yet", "They appear here once customers review a delivered order or painting.")}`;
    main.onclick = async (e) => {
      const btn = e.target.closest("[data-to]");
      if (!btn) return;
      try {
        await http().post(`/admin/reviews/${btn.closest("[data-review]").dataset.review}/status`, { status: btn.dataset.to });
        reviews(main, params, { head });
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /** Extra tiles for the admin overview. */
  function overviewTiles(o) {
    const tile = (n, label, href, alert = false) => `<a class="ad-tile ${alert ? "ad-tile--alert" : ""}" href="${href}"><strong>${n}</strong><span>${esc(label)}</span></a>`;
    if (!o.artists) return "";
    return `<h2 class="ad-subtitle">Art &amp; Artists</h2><div class="ad-tiles">
        ${tile(o.artists.applicationsPending, "Artist applications to review", "#/artists", o.artists.applicationsPending > 0)}
        ${tile(o.artworks.PENDING_REVIEW, "Artworks waiting for review", "#/artworks?status=PENDING_REVIEW", o.artworks.PENDING_REVIEW > 0)}
        ${tile(o.artists.active, "Listed artists", "#/artists")}
        ${tile(o.paintings.PENDING_ARTIST_RESPONSE + o.paintings.ADVANCE_PAYMENT_PENDING + o.paintings.ADVANCE_PAID + o.paintings.PAINTING_IN_PROGRESS + o.paintings.REMAINING_PAYMENT_PENDING + o.paintings.READY_FOR_DISPATCH + o.paintings.SHIPPED, "Custom paintings under way", "#/paintings")}
        ${tile(o.paintings.refundPending, "Painting refunds to make", "#/paintings?status=CANCELLED", o.paintings.refundPending > 0)}
      </div>`;
  }

  FrameX.adminArt = { artists, artworks, paintings, painting, settings, users, reviews, overviewTiles };
})((window.FrameX = window.FrameX || {}));
