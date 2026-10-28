/* ==========================================================================
   Admin -> All frames (owner, 2026-10-27): every shop's frames in one list.
   The admin adds a frame for any shop, edits, duplicates, approves or hides
   one, with the same 4-step editor the shops use (ui/frame-editor.js).

     #/products                       the list (filter by shop and status, search)
     #/products/new                   "For which shop?", then the editor
     #/products/<shop uuid>/<id>      edit one frame of that shop
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const FILTERS = [["", "All"], ["pending_review", "Waiting"], ["published", "Live"], ["draft", "Draft"], ["unpublished", "Hidden"]];

  let shopsCache = null;
  const shops = async () => (shopsCache = shopsCache || http().get("/admin/shops").then((r) => (r.items || []).filter((s) => s.uuid)));

  const tabs = (on, counts = {}) => `<div class="aa-tabs"><a class="${on === "frames" ? "on" : ""}" href="#/products">Frames${counts.frames !== undefined ? ` (${counts.frames})` : ""}</a><a class="${on === "artworks" ? "on" : ""}" href="#/products?tab=artworks">Artworks${counts.artworks !== undefined ? ` (${counts.artworks})` : ""}</a></div>`;

  async function list(main, params, { head }) {
    if (params.get("tab") === "artworks") return artworks(main, params, { head });
    const status = params.get("status") || "";
    const shop = params.get("shop") || "";
    const q = (params.get("q") || "").toLowerCase();
    const [{ items }, all] = await Promise.all([http().get("/admin/products", { status, shop }), shops()]);
    const missing = items.filter((x) => !x.hasFront && !x.modelOnly).length;
    const shown = q ? items.filter((x) => `${x.name} ${x.shopName} ${x.shopCode}`.toLowerCase().includes(q)) : items;
    const link = (o) => {
      const p = new URLSearchParams(Object.assign({ status, shop, q: params.get("q") || "" }, o));
      [...p.keys()].forEach((k) => !p.get(k) && p.delete(k));
      return `#/products${p.toString() ? "?" + p : ""}`;
    };
    main.innerHTML = `<div class="af">${head("All frames", "Every shop's frames and every artist's artworks. Add for anyone, edit, approve or hide.", `<a class="af-btn af-btn--pri" href="#/products/new">＋ Add a frame</a>`)}
      ${tabs("frames")}
      <div class="af-row af-filters">
        <select class="af-in" data-shop aria-label="Shop"><option value="">All shops</option>${all.map((s) => `<option value="${esc(s.uuid)}"${s.uuid === shop ? " selected" : ""}>${esc(s.name)} (${esc(s.shopCode)})</option>`).join("")}</select>
        <input class="af-in" type="search" data-q placeholder="Search frames" value="${esc(params.get("q") || "")}" aria-label="Search frames">
        <div class="af-chips">${FILTERS.map(([id, label]) => `<a class="${status === id ? "on" : ""}" href="${link({ status: id })}">${label}</a>`).join("")}</div>
      </div>
      ${missing ? `<p class="af-note">${icon("alert")} ${missing} frame${missing === 1 ? " has" : "s have"} no frame front yet: customers can't see their own photo inside ${missing === 1 ? "it" : "them"}.</p>` : ""}
      <div class="af-card">${FrameX.frameEditor.listHtml(shown, { admin: true })}</div></div>`;
    $("[data-shop]", main).addEventListener("change", (e) => (location.hash = link({ shop: e.target.value })));
    $("[data-q]", main).addEventListener("change", (e) => (location.hash = link({ q: e.target.value.trim() })));
    main.onclick = async (e) => {
      const row = e.target.closest("[data-frame]");
      const btn = e.target.closest("[data-row]");
      if (!row || !btn) return;
      const id = row.dataset.frame;
      const shopId = row.dataset.shop;
      const act = btn.dataset.row;
      try {
        if (act === "edit") return (location.hash = `#/products/${encodeURIComponent(shopId)}/${encodeURIComponent(id)}`);
        btn.disabled = true;
        if (act === "duplicate") {
          const copy = await FrameX.frameEditor.duplicate(`/admin/shops/${encodeURIComponent(shopId)}`, id);
          FrameX.toast.show(`Made “${copy.name}” as a draft.`);
          return (location.hash = `#/products/${encodeURIComponent(shopId)}/${encodeURIComponent(copy.id)}`);
        }
        if (act === "approve" || act === "hide") {
          await http().post(`/admin/products/${encodeURIComponent(id)}/listing`, { status: act === "approve" ? "published" : "unpublished", note: "" });
          FrameX.toast.show(act === "approve" ? "Approved: it is live." : "Hidden: customers no longer see it.");
          return list(main, params, { head });
        }
      } catch (error) {
        btn.disabled = false;
        FrameX.toast.show(error.message || "That didn't work. Please try again.");
      }
    };
  }

  /** "For which shop?" then the editor for that shop. */
  async function newFrame(main, { head }) {
    const all = await shops();
    main.innerHTML = `<div class="af">${head("Add a frame", "First choose the shop the frame belongs to. The shop sees it under My frames and can edit it too.", `<a class="af-btn" href="#/products">← All frames</a>`)}
      <div class="af-card"><div class="af-f"><label for="af-shop">For which shop?</label>
        <select class="af-in" id="af-shop" data-pick><option value="">Choose a shop…</option>${all.map((s) => `<option value="${esc(s.uuid)}">${esc(s.name)} (${esc(s.shopCode)})${s.approvalStatus && s.approvalStatus !== "APPROVED" ? " · not approved" : ""}</option>`).join("")}</select></div>
        <button class="af-btn af-btn--pri" type="button" data-go disabled>Next: photos →</button></div></div>`;
    const pick = $("[data-pick]", main);
    const go = $("[data-go]", main);
    pick.addEventListener("change", () => (go.disabled = !pick.value));
    go.addEventListener("click", () => editor(main, pick.value, null));
  }

  async function editor(main, shopId, id) {
    const box = document.createElement("div");
    main.innerHTML = "";
    main.appendChild(box);
    await FrameX.frameEditor.open(box, { base: `/admin/shops/${encodeURIComponent(shopId)}`, productId: id, admin: true, onExit: () => (location.hash = "#/products") });
  }

  /* ---------------------------------------------------------------- Artworks */
  const ART_FILTERS = [["", "All"], ["PENDING_REVIEW", "Waiting"], ["APPROVED", "Live"], ["REJECTED", "Rejected"], ["INACTIVE", "Hidden"]];
  const ART_STATUS = { PENDING_REVIEW: ["Waiting for FrameX", "wait"], APPROVED: ["Live", "live"], REJECTED: ["Rejected", "draft"], INACTIVE: ["Hidden", "draft"], CANCELLED: ["Withdrawn", "draft"] };
  let artistsCache = null;
  const artistList = async () => (artistsCache = artistsCache || http().get("/admin/artists").then((r) => (r.items || []).filter((a) => a.uuid)));

  async function artworks(main, params, { head }) {
    const status = params.get("status") || "";
    const artist = params.get("artist") || "";
    const [{ items, counts }, all] = await Promise.all([http().get("/admin/artworks", { status, artist }), artistList()]);
    const link = (o) => {
      const p = new URLSearchParams(Object.assign({ tab: "artworks", status, artist }, o));
      [...p.keys()].forEach((k) => !p.get(k) && p.delete(k));
      return `#/products?${p}`;
    };
    const money = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
    const price = (w) => { const p = (w.sizes || []).map((s) => s.price); return p.length > 1 ? `${money(Math.min(...p))}–${money(Math.max(...p)).replace("₹", "")}` : money(w.price); };
    const days = (d) => (d ? `${d.readyDays + d.transitMin}–${d.readyDays + d.transitMax} days` : "—");
    main.innerHTML = `<div class="af">${head("All frames", "Every shop's frames and every artist's artworks. Add for anyone, edit, approve or hide.", `<a class="af-btn af-btn--pri" href="#/products/new-artwork">＋ Add artwork</a>`)}
      ${tabs("artworks")}
      <div class="af-row af-filters">
        <select class="af-in" data-artist aria-label="Artist"><option value="">All artists</option>${all.map((a) => `<option value="${esc(a.uuid)}"${a.uuid === artist ? " selected" : ""}>${esc(a.name)} (@${esc(a.username)})</option>`).join("")}</select>
        <div class="af-chips">${ART_FILTERS.map(([id, label]) => `<a class="${status === id ? "on" : ""}" href="${link({ status: id })}">${label}${id === "PENDING_REVIEW" && counts && counts.PENDING_REVIEW ? ` (${counts.PENDING_REVIEW})` : ""}</a>`).join("")}</div>
      </div>
      <div class="af-card">${
        items.length
          ? `<table class="af-listtbl"><thead><tr><th></th><th>Artwork</th><th>Artist</th><th>Sizes &amp; price</th><th>Delivery</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map((w) => { const [label, tone] = ART_STATUS[w.status] || [w.status, "draft"]; return `<tr data-artwork="${esc(w.id)}" data-artist-id="${esc(w.artistId || "")}"><td>${w.images[0] ? `<img src="${esc(http().asset(w.images[0]))}" alt="" loading="lazy">` : ""}</td><td><b>${esc(w.title)}</b><br><small>${esc(w.kind === "PRINT" ? "Prints" : "Original")} · ${esc(w.medium)}</small></td><td>${esc(w.artistName || "")}<br><small>${esc(w.artistCode || "")}</small></td><td>${(w.sizes || []).length} size${(w.sizes || []).length === 1 ? "" : "s"} · ${price(w)}</td><td>${days(w.delivery)}</td><td><span class="af-pill af-pill--${tone}">${esc(label)}</span></td>
          <td><span class="af-row af-nowrap"><button class="af-btn af-btn--sm" type="button" data-art="edit">Edit</button>${w.status === "PENDING_REVIEW" ? `<button class="af-btn af-btn--sm af-btn--dark" type="button" data-art="approve">Approve</button><button class="af-btn af-btn--sm" type="button" data-art="reject">Reject</button>` : ""}${w.status === "APPROVED" ? `<button class="af-btn af-btn--sm" type="button" data-art="hide">Hide</button>` : ""}${w.status === "INACTIVE" ? `<button class="af-btn af-btn--sm" type="button" data-art="show">Show again</button>` : ""}</span></td></tr>`; }).join("")}</tbody></table>`
          : `<div class="sd-empty"><strong>No artworks here</strong><span>Artworks appear as soon as an artist sends one.</span></div>`
      }</div></div>`;
    $("[data-artist]", main).addEventListener("change", (e) => (location.hash = link({ artist: e.target.value })));
    main.onclick = async (e) => {
      const row = e.target.closest("[data-artwork]");
      const btn = e.target.closest("[data-art]");
      if (!row || !btn) return;
      const id = row.dataset.artwork;
      const act = btn.dataset.art;
      try {
        if (act === "edit") return (location.hash = `#/products/artist/${encodeURIComponent(row.dataset.artistId)}/${encodeURIComponent(id)}`);
        if (act === "approve") await http().post(`/admin/artworks/${encodeURIComponent(id)}/review`, { decision: "APPROVED" });
        if (act === "reject") {
          const reason = window.prompt("Why is it not approved? The artist reads this.");
          if (!reason || reason.trim().length < 3) return;
          await http().post(`/admin/artworks/${encodeURIComponent(id)}/review`, { decision: "REJECTED", reason: reason.trim() });
        }
        if (act === "hide" || act === "show") await http().post(`/admin/artworks/${encodeURIComponent(id)}/visible`, { visible: act === "show" });
        FrameX.toast.show({ approve: "Approved: it is live.", reject: "Rejected. The artist is told why.", hide: "Hidden.", show: "Live again." }[act]);
        artworks(main, params, { head });
      } catch (error) {
        FrameX.toast.show(error.message || "That didn't work. Please try again.");
      }
    };
  }

  /** "For which artist?" then the artwork editor for that artist. */
  async function newArtwork(main, { head }) {
    const all = await artistList();
    main.innerHTML = `<div class="af">${head("Add artwork", "First choose the artist the artwork belongs to. The artist sees it under Artworks and can change it too.", `<a class="af-btn" href="#/products?tab=artworks">← All artworks</a>`)}
      <div class="af-card"><div class="af-f"><label for="aa-artist">For which artist?</label>
        <select class="af-in" id="aa-artist" data-pick><option value="">Choose an artist…</option>${all.map((a) => `<option value="${esc(a.uuid)}">${esc(a.name)} (@${esc(a.username)})${a.status !== "ACTIVE" ? " · not active" : ""}</option>`).join("")}</select></div>
        <button class="af-btn af-btn--pri" type="button" data-go disabled>Next: photos →</button></div></div>`;
    const pick = $("[data-pick]", main);
    const go = $("[data-go]", main);
    pick.addEventListener("change", () => (go.disabled = !pick.value));
    go.addEventListener("click", () => artworkEditor(main, pick.value, null));
  }

  async function artworkEditor(main, artistId, id) {
    const box = document.createElement("div");
    main.innerHTML = "";
    main.appendChild(box);
    await FrameX.artworkEditor.open(box, { base: `/admin/artists/${encodeURIComponent(artistId)}`, artworkId: id, admin: true, onExit: () => (location.hash = "#/products?tab=artworks") });
  }

  FrameX.adminFrames = { list, newFrame, editor, newArtwork, artworkEditor };
})((window.FrameX = window.FrameX || {}));
