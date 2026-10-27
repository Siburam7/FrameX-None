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

  async function list(main, params, { head }) {
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
    main.innerHTML = `<div class="af">${head("All frames", "Every shop's frames. Add a frame for any shop, edit, duplicate, approve or hide.", `<a class="af-btn af-btn--pri" href="#/products/new">＋ Add a frame</a>`)}
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

  FrameX.adminFrames = { list, newFrame, editor };
})((window.FrameX = window.FrameX || {}));
