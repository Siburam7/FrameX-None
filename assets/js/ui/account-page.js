/* ==========================================================================
   Account page (account.html): the logged-in user's profile.
   Customers see their details and can edit name / phone and change password.
   Shop users also see their shop (Shop ID, status, location) and a link to
   the shop dashboard; admins get a link to the admin dashboard.
   Protected: not logged in -> login page. The data comes from /api/users/me.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const forms = () => FrameX.forms;
  const auth = () => FrameX.auth;

  const STATUS = { ACTIVE: "Active", PENDING_SETUP: "Waiting for password setup", DISABLED: "Disabled" };
  const SHOP_STATUS = { ACTIVE: "Approved · Active", INACTIVE: "Approved · Not listed (inactive)", PENDING: "Waiting for approval", REJECTED: "Not approved" };
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");

  function render(root, user) {
    const rows = [
      ["Name", user.name],
      ["Email", user.email],
      ["Phone", user.phone || "Not added"],
      ["Account status", STATUS[user.status] || user.status],
      ["Member since", date(user.createdAt)],
    ];
    const shop = user.shop;
    root.innerHTML = `<div class="account">
      <header class="account__head">
        <span class="account__avatar" aria-hidden="true">${esc(user.name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join(""))}</span>
        <div><h1 class="account__title">${esc(user.name)}</h1><p class="account__role">${{ CUSTOMER: "Customer account", SHOP: "Local shop account", ADMIN: "FrameX admin", ARTIST: "Artist account" }[user.role]}</p></div>
        <button class="btn btn--outline btn--sm" type="button" data-logout>${icon("logout")} Log out</button>
      </header>

      ${user.role === "SHOP" && shop ? `<section class="account-card account-card--shop" aria-labelledby="acc-shop">
        <h2 id="acc-shop">${icon("store")} Your shop</h2>
        <dl class="account-list">
          <div><dt>Shop ID</dt><dd><code>${esc(shop.shopCode)}</code></dd></div>
          <div><dt>Shop name</dt><dd>${esc(shop.name)}</dd></div>
          <div><dt>Status</dt><dd>${esc(SHOP_STATUS[shop.status] || shop.status)}</dd></div>
          <div><dt>Location</dt><dd>${esc([shop.city, shop.state].filter(Boolean).join(", "))}</dd></div>
        </dl>
        <a class="btn btn--dark btn--sm" href="shop-dashboard.html">Open shop dashboard</a>
      </section>` : ""}
      ${user.role === "ADMIN" ? `<section class="account-card"><h2>${icon("shield")} Administration</h2><p class="account-card__lead">Review shop applications and manage shops.</p><a class="btn btn--dark btn--sm" href="admin.html">Open admin dashboard</a></section>` : ""}

      ${user.role === "ARTIST" && user.artist ? `<section class="account-card account-card--shop" aria-labelledby="acc-artist">
        <h2 id="acc-artist">${icon("image")} Your artist profile</h2>
        <dl class="account-list">
          <div><dt>Artist ID</dt><dd><code>${esc(user.artist.artistCode)}</code></dd></div>
          <div><dt>Name</dt><dd>${esc(user.artist.name)}</dd></div>
          <div><dt>Username</dt><dd>@${esc(user.artist.username)}</dd></div>
          <div><dt>Status</dt><dd>${user.artist.status === "ACTIVE" ? "Listed on FrameX" : "Not listed"}</dd></div>
        </dl>
        <a class="btn btn--dark btn--sm" href="artist-dashboard.html">Open artist dashboard</a>
      </section>` : ""}

      <section class="account-card" aria-labelledby="acc-paintings">
        <h2 id="acc-paintings">${icon("image")} Custom paintings</h2>
        <p class="account-card__lead">Requests you sent to artists: see the artist's answer, pay the advance, and follow the painting until it arrives.</p>
        <a class="btn btn--dark btn--sm" href="paintings.html">View your painting requests</a>
      </section>

      <section class="account-card" aria-labelledby="acc-news">
        <h2 id="acc-news">${icon("mail")} Notifications <span class="acc-news__count" data-news-count hidden></span></h2>
        <ul class="acc-news" data-news><li class="acc-news__empty">Loading…</li></ul>
        <button class="btn btn--outline btn--sm" type="button" data-news-read hidden>Mark all as read</button>
      </section>

      <section class="account-card" aria-labelledby="acc-orders">
        <h2 id="acc-orders">${icon("receipt")} Your orders</h2>
        <p class="account-card__lead">See what you ordered, follow its status, pay for an order that is waiting, or cancel one.</p>
        <a class="btn btn--dark btn--sm" href="orders.html">View your orders</a>
      </section>

      <div class="account__grid">
        <section class="account-card" aria-labelledby="acc-details">
          <h2 id="acc-details">${icon("user")} Your details</h2>
          <dl class="account-list">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          <details class="account-edit"><summary>Edit name or phone</summary>
            <form id="profile-form" class="form-grid" novalidate>
              ${forms().field("name", "Name", { required: true, autocomplete: "name", value: user.name, maxlength: 80, prefix: "pf" })}
              ${forms().field("phone", "Phone", { type: "tel", autocomplete: "tel", inputmode: "tel", value: user.phone || "", prefix: "pf" })}
              <div class="form-status" role="status" aria-live="polite"></div>
              <div><button class="btn btn--dark btn--sm" type="submit">Save changes</button></div>
            </form>
          </details>
        </section>

        <section class="account-card" aria-labelledby="acc-password">
          <h2 id="acc-password">${icon("lock")} Password</h2>
          <p class="account-card__lead">Changing your password signs you out on other devices.</p>
          <form id="password-form" class="form-grid" novalidate>
            ${forms().field("currentPassword", "Current password", { required: true, type: "password", autocomplete: "current-password", toggle: true, prefix: "pw" })}
            ${forms().field("newPassword", "New password", { required: true, type: "password", autocomplete: "new-password", toggle: true, hint: "At least 8 characters, with a letter and a number.", prefix: "pw" })}
            ${forms().field("confirmPassword", "Confirm new password", { required: true, type: "password", autocomplete: "new-password", toggle: true, prefix: "pw" })}
            <div class="form-status" role="status" aria-live="polite"></div>
            <div><button class="btn btn--dark btn--sm" type="submit">Change password</button></div>
          </form>
        </section>
      </div>
      ${user.role === "CUSTOMER" ? `<div class="account__links"><a class="btn btn--primary" href="shop.html">Browse frames</a><a class="btn btn--outline" href="shop.html#shops">Find shops near you</a></div>` : ""}
    </div>`;

    loadNews(root);
    $("[data-logout]", root).addEventListener("click", async () => {
      await auth().logout();
      window.location.href = "index.html";
    });

    forms().handle($("#profile-form", root), {
      busyLabel: "Saving…",
      send: (v) => auth().updateProfile({ name: v.name, phone: v.phone }),
      onSuccess(updated) {
        render(root, updated);
        FrameX.toast.show("Your details were saved.");
      },
    });
    const pw = $("#password-form", root);
    forms().handle(pw, {
      busyLabel: "Changing…",
      send: (v) => auth().changePassword(v.currentPassword, v.newPassword, v.confirmPassword),
      onSuccess() {
        pw.reset();
        forms().status($(".form-status", pw), "success", "Password changed. Other devices have been signed out.");
      },
    });
  }

  /** The newest notifications of this account. */
  async function loadNews(root) {
    const list = $("[data-news]", root);
    if (!list) return;
    const ago = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    try {
      const r = await FrameX.http.get("/notifications", { limit: 8 });
      list.innerHTML = r.items.length
        ? r.items.map((n) => `<li class="acc-news__item${n.read ? "" : " is-unread"}">${n.link ? `<a href="${esc(n.link)}">` : "<div>"}<strong>${esc(n.title)}</strong><span>${esc(n.body)}</span><small>${esc(ago(n.createdAt))}</small>${n.link ? "</a>" : "</div>"}</li>`).join("")
        : `<li class="acc-news__empty">Nothing yet. Order updates and answers from artists appear here.</li>`;
      const count = $("[data-news-count]", root);
      count.hidden = !r.unread;
      count.textContent = r.unread ? `${r.unread} new` : "";
      const read = $("[data-news-read]", root);
      read.hidden = !r.unread;
      read.onclick = async () => {
        await FrameX.http.post("/notifications/read");
        loadNews(root);
      };
    } catch (error) {
      list.innerHTML = `<li class="acc-news__empty">Notifications couldn't be loaded.</li>`;
    }
  }

  async function init() {
    const root = $("#account-root");
    if (!root) return;
    const user = await auth().guard(["CUSTOMER", "SHOP", "ADMIN", "ARTIST"]);
    if (!user) return;
    document.title = `${user.name} — FrameX account`;
    render(root, user);
  }

  FrameX.accountPage = { init };
})((window.FrameX = window.FrameX || {}));
