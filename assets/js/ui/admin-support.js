/* ==========================================================================
   Admin: the help chat  (#/chats[?status=OPEN|CLOSED], #/chats/<id>)

   Conversations customers started from the chat button on the website, the
   ones with something new first. Open one to read it, answer (the customer
   sees it in the chat and gets an email at their account address), close it
   when it is done. Only an ADMIN can read these: the backend checks every
   request.

   Live chats (FrameX Care, 2026-10-24) are answered on the care desk
   (Live chats, #/live, ui/care-desk.js); "Care team" (#/care) makes the care logins for it.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const http = () => FrameX.http;
  const FILTERS = [["", "All"], ["OPEN", "Open"], ["CLOSED", "Closed"]];
  const ORDER_STATUS = { PENDING_PAYMENT: "Waiting for payment", PLACED: "Placed", CONFIRMED: "Confirmed", PROCESSING: "Being made", SHIPPED: "Shipped", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", RETURNED: "Returned" };
  const when = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const row = (t) => `<li class="sd-item adm-item${t.unread ? " is-unread" : ""}">
      <div class="sd-item__main">
        <a class="sd-item__name" href="#/chats/${esc(t.id)}">${esc(t.customer.name)}${t.unread ? ` <span class="sd-status sd-status--pending_review">${t.unread} new</span>` : ""}${t.status === "CLOSED" ? ` <span class="sd-status sd-status--unpublished">Closed</span>` : ""}</a>
        <span class="sd-item__meta">${esc(t.customer.email || "")}${t.topicName ? ` · ${esc(t.topicName)}` : ""}${t.orderNumber ? ` · order ${esc(t.orderNumber)}` : ""} · ${esc(when(t.lastMessageAt))}</span>
        <p class="adm-chat__last">${t.lastFrom === "framex" ? "<strong>You:</strong> " : ""}${esc(t.lastMessage.slice(0, 160))}</p>
      </div>
      <div class="sd-item__actions"><a class="iu-btn iu-btn--go" href="#/chats/${esc(t.id)}">${icon("mail")} ${t.unread ? "Answer" : "Open"}</a></div></li>`;

  async function list(main, params, { head }) {
    const status = ["OPEN", "CLOSED"].includes(params.get("status")) ? params.get("status") : "";
    const r = await http().get("/admin/support", { status });
    main.innerHTML = `${head("Chats", "Customers write from the chat button on every page. Your answer appears in their chat and is emailed to their account address. Live chats are answered under Live chats.", `<a class="btn btn--primary btn--sm" href="#/live">${icon("mail")} Open Live chats</a>`)}
      <div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter">${FILTERS.map(([id, label]) => `<a class="chip" href="#/chats${id ? `?status=${id}` : ""}" aria-pressed="${status === id}">${esc(label)}${id === "OPEN" && r.unread ? ` (${r.unread} new)` : ""}</a>`).join("")}</div></div>
      ${r.items.length ? `<ul class="sd-list">${r.items.map(row).join("")}</ul>` : `<div class="sd-empty">${icon("mail")}<strong>No chats yet</strong><span>When a customer writes from the chat button, it appears here.</span></div>`}`;
    badge();
  }

  async function thread(main, id, { head }) {
    const t = (await http().get(`/admin/support/${encodeURIComponent(id)}`)).thread;
    const draw = (t) => {
      main.innerHTML = `<a class="wz-back" href="#/chats">${icon("chev-left")} All chats</a>
        ${head(t.customer.name, `${esc(t.customer.email || "")}${t.customer.phone ? ` · ${esc(t.customer.phone)}` : ""}${t.topicName ? ` · ${esc(t.topicName)}` : ""}`, `<span class="sd-status sd-status--${t.status === "OPEN" ? "published" : "draft"}">${t.status === "OPEN" ? "Open" : "Closed"}</span>`)}
        <div class="adm-chat">
          <div class="adm-chat__main">
            <div class="adm-chat__log" data-log>${t.messages.map((m) => `<div class="hc-msg hc-msg--${m.from === "framex" ? "me" : "them"}">${m.orderNumber ? `<span class="hc-msg__order">${icon("package")} ${esc(m.orderNumber)}</span>` : ""}${esc(m.body).replace(/\n/g, "<br>")}<small>${m.from === "framex" ? "FrameX · " : `${esc(t.customer.name)} · `}${esc(when(m.at))}</small></div>`).join("")}</div>
            <form class="adm-chat__form" data-reply novalidate>
              <label class="visually-hidden" for="adm-reply">Your answer</label>
              <textarea class="input" id="adm-reply" name="body" rows="3" maxlength="2000" placeholder="Write your answer…"></textarea>
              <div class="form-status" role="status" aria-live="polite"></div>
              <div class="adm-actions"><button class="btn btn--primary" type="submit">${icon("mail")} Send answer</button>
                <button class="btn btn--outline btn--sm" type="button" data-status="${t.status === "OPEN" ? "CLOSED" : "OPEN"}">${t.status === "OPEN" ? "Close the chat" : "Open it again"}</button></div>
            </form>
          </div>
          <aside class="account-card adm-chat__side"><h2>${icon("receipt")} Recent orders</h2>
            ${t.recentOrders.length ? `<ul class="adm-chat__orders">${t.recentOrders.map((o) => `<li><a href="#/orders/${esc(o.orderNumber)}"><strong>${esc(o.orderNumber)}</strong></a><span>${esc(ORDER_STATUS[o.status] || o.status)} · ${formatPrice(o.total)}</span></li>`).join("")}</ul>` : `<p class="pp-muted">No orders yet.</p>`}
          </aside>
        </div>`;
      const log = $("[data-log]", main);
      log.scrollTop = log.scrollHeight;
    };
    draw(t);
    badge();
    main.onsubmit = async (e) => {
      if (!e.target.matches("[data-reply]")) return;
      e.preventDefault();
      const box = $("#adm-reply", main);
      const body = box.value.trim();
      if (!body) return box.focus();
      const btn = $("[data-reply] [type=submit]", main);
      btn.disabled = true;
      try {
        draw((await http().post(`/admin/support/${encodeURIComponent(id)}/reply`, { body })).thread);
        FrameX.toast.show("Answer sent. The customer is emailed too.");
      } catch (error) {
        FrameX.forms.status($(".form-status", main), "error", esc(error.message));
        btn.disabled = false;
      }
    };
    main.onclick = async (e) => {
      const b = e.target.closest("[data-status]");
      if (!b) return;
      try {
        draw((await http().post(`/admin/support/${encodeURIComponent(id)}/status`, { status: b.dataset.status })).thread);
        FrameX.toast.show(b.dataset.status === "CLOSED" ? "Chat closed." : "Chat opened again.");
      } catch (error) {
        FrameX.toast.show(error.message);
      }
    };
  }

  /* ---------------------------------------------------------------- Care team (#/care) */
  const memberRow = (m) => `<li class="sd-item adm-item" data-member="${esc(m.id)}">
      <div class="sd-item__main">
        <strong class="sd-item__name">${esc(m.name)} ${m.active ? (m.available ? `<span class="sd-status sd-status--published">Available</span>` : `<span class="sd-status sd-status--unpublished">Away</span>`) : `<span class="sd-status sd-status--unpublished">Switched off</span>`}</strong>
        <span class="sd-item__meta">${esc(m.email)} · ${m.chatsThisWeek} live ${m.chatsThisWeek === 1 ? "chat" : "chats"} this week</span>
      </div>
      <div class="sd-item__actions">
        <button class="iu-btn" type="button" data-rename>Change name</button>
        <button class="iu-btn" type="button" data-newpass>New password</button>
        <button class="iu-btn${m.active ? "" : " iu-btn--go"}" type="button" data-active="${m.active ? "0" : "1"}">${m.active ? "Switch off" : "Switch on"}</button>
      </div></li>`;

  async function team(main, { head }) {
    const draw = (items) => {
      main.innerHTML = `${head("Care team", "People who answer live chats. They log in with their own email (the normal Log in page) and open this admin panel with <strong>only Live chats and Orders</strong>: they can change a customer's order (size, address, cancel, refund) but not payouts, settings, coupons or shops. Customers see only their first name.", `<a class="btn btn--outline btn--sm" href="#/live">${icon("mail")} Open Live chats</a>`)}
        <div class="adm-care">
          <div class="account-card"><h2>${icon("users")} Care staff (${items.length})</h2>
            ${items.length ? `<ul class="sd-list">${items.map(memberRow).join("")}</ul>` : `<p class="pp-muted">No care logins yet. Add the first one here.</p>`}
          </div>
          <form class="account-card adm-care__form" data-new-member novalidate><h2>${icon("plus")} Add care staff</h2>
            <div class="form-field"><label for="cm-name">First name <small>(customers see this)</small></label><input class="input" id="cm-name" name="name" maxlength="30" autocomplete="off" required></div>
            <div class="form-field"><label for="cm-email">Email (to log in)</label><input class="input" id="cm-email" name="email" type="email" autocomplete="off" required></div>
            <div class="form-field"><label for="cm-pass">Password</label><input class="input" id="cm-pass" name="password" type="password" autocomplete="new-password" required><small class="pp-muted">At least 8 characters with a letter and a number. Give it to them yourself; they log in on the normal Log in page.</small></div>
            <div class="form-status" role="status" aria-live="polite"></div>
            <button class="btn btn--primary" type="submit">${icon("plus")} Create care login</button>
            <p class="adm-care__note">The email must not already have a FrameX account (customer, shop or artist): one role per account.</p>
          </form>
        </div>`;
    };
    draw((await http().get("/admin/care-team")).items);
    main.onsubmit = async (e) => {
      if (!e.target.matches("[data-new-member]")) return;
      e.preventDefault();
      const f = e.target;
      const say = $(".form-status", f);
      const btn = $("[type=submit]", f);
      btn.disabled = true;
      try {
        const r = await http().post("/admin/care-team", { name: f.name.value.trim(), email: f.email.value.trim(), password: f.password.value });
        draw(r.items);
        FrameX.toast.show("Care login created. Share the email and password with them.");
      } catch (error) {
        FrameX.forms.status(say, "error", esc(error.fields ? Object.values(error.fields)[0] : error.message));
        btn.disabled = false;
      }
    };
    main.onclick = async (e) => {
      const row = e.target.closest("[data-member]");
      if (!row) return;
      const id = row.dataset.member;
      let change = null;
      if (e.target.closest("[data-rename]")) {
        const name = window.prompt("New first name (customers see this):");
        if (name && name.trim()) change = { name: name.trim() };
      } else if (e.target.closest("[data-newpass]")) {
        const password = window.prompt("New password (at least 8 characters with a letter and a number). They will be logged out:");
        if (password) change = { password };
      } else if (e.target.closest("[data-active]")) {
        const on = e.target.closest("[data-active]").dataset.active === "1";
        if (on || window.confirm("Switch this care login off? They are logged out at once and can't log in until you switch it on again.")) change = { active: on };
      }
      if (!change) return;
      try {
        draw((await http().patch(`/admin/care-team/${encodeURIComponent(id)}`, change)).items);
        FrameX.toast.show("Saved.");
      } catch (error) {
        FrameX.toast.show(error.fields ? Object.values(error.fields)[0] : error.message);
      }
    };
  }

  /** The number of unread customer messages, next to "Chats" in the admin menu. */
  async function badge() {
    try {
      const { unread } = await http().get("/admin/support", { status: "OPEN" });
      const label = $('#admin-root .sd-nav a[href="#/chats"] span');
      if (label) label.textContent = unread ? `Chats (${unread})` : "Chats";
    } catch (error) {
      /* the menu simply shows no number */
    }
  }

  FrameX.adminSupport = { list, thread, badge, team };
})((window.FrameX = window.FrameX || {}));
