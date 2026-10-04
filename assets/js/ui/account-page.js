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
        <div><h1 class="account__title">${esc(user.name)}</h1><p class="account__role">${{ CUSTOMER: "Customer account", SHOP: "Local shop account", ADMIN: "FrameX admin" }[user.role]}</p></div>
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

  async function init() {
    const root = $("#account-root");
    if (!root) return;
    const user = await auth().guard(["CUSTOMER", "SHOP", "ADMIN"]);
    if (!user) return;
    document.title = `${user.name} — FrameX account`;
    render(root, user);
  }

  FrameX.accountPage = { init };
})((window.FrameX = window.FrameX || {}));
