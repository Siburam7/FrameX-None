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

  // The theme chosen on this browser (the script in each page's head draws the page with it). Light if none.
  const THEME_KEY = "framex.theme.v1";
  const themeChoice = () => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "dark" || t === "system" ? t : "light";
    } catch (error) {
      return "light";
    }
  };

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

      <section class="account-card" aria-labelledby="acc-theme">
        <h2 id="acc-theme">${icon("moon")} Appearance</h2>
        <p class="account-card__lead">How FrameX looks on this browser.</p>
        <div class="theme-pick" role="radiogroup" aria-labelledby="acc-theme">${[
          ["dark", "Dark", "moon"],
          ["light", "Light", "sun"],
          ["system", "Same as my device", "settings"],
        ]
          .map(([id, label, ic]) => `<label class="theme-pick__item"><input type="radio" name="theme" value="${id}"${themeChoice() === id ? " checked" : ""}><span>${icon(ic)}${label}</span></label>`)
          .join("")}</div>
      </section>

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

      <section class="account-card" aria-labelledby="acc-data">
        <h2 id="acc-data">${icon("download")} Your data</h2>
        <p class="account-card__lead">Download everything FrameX keeps about your account (profile, addresses, orders, reviews and messages) as one file.</p>
        <div class="form-status" data-data-status role="status" aria-live="polite"></div>
        <div><button class="btn btn--outline btn--sm" type="button" data-download-data>${icon("download")} Download my data</button></div>
        ${
          user.role === "CUSTOMER"
            ? `<details class="account-edit" data-delete-box><summary>Delete my account</summary>
          <p class="account-card__lead">Deleting your account can't be undone. Your login, addresses, saved photos, saved designs and cart are removed at once. Records of your past orders are kept only as FrameX needs them for tax, without your name, email, phone or address. Your reviews stay without your name. An order or custom painting that is still under way has to be delivered or cancelled first.</p>
          <form id="delete-form" class="form-grid" novalidate>
            ${forms().field("password", "Your password", { required: true, type: "password", autocomplete: "current-password", toggle: true, prefix: "del" })}
            ${forms().field("confirm", "Type DELETE to confirm", { required: true, autocomplete: "off", maxlength: 10, prefix: "del", placeholder: "DELETE" })}
            <div class="form-status" role="status" aria-live="polite"></div>
            <div><button class="btn btn--dark btn--sm" type="submit">${icon("trash")} Delete my account for good</button></div>
          </form>
        </details>`
            : `<p class="account-card__lead">To close a ${user.role === "SHOP" ? "shop" : user.role === "ARTIST" ? "artist" : "staff"} account, please <a href="contact.html">contact FrameX</a>.</p>`
        }
      </section>
      ${user.role === "CUSTOMER" ? `<div class="account__links"><a class="btn btn--primary" href="shop.html">Browse frames</a><a class="btn btn--outline" href="shop.html#shops">Find shops near you</a></div>` : ""}
    </div>`;

    loadNews(root);
    // Appearance: saved in this browser and shown at once
    root.querySelectorAll('input[name="theme"]').forEach((input) =>
      input.addEventListener("change", () => {
        try {
          localStorage.setItem(THEME_KEY, input.value);
        } catch (error) {
          /* storage blocked: the choice lasts for this page */
        }
        if (window.FrameXTheme) window.FrameXTheme.apply();
        else document.documentElement.setAttribute("data-theme", input.value === "dark" ? "dark" : "light");
        FrameX.toast.show(input.value === "system" ? "FrameX now follows your device's light or dark setting." : `${input.value === "dark" ? "Dark" : "Light"} theme on.`);
      }),
    );
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
    // Your data: the file is made in this browser from the API's answer (works with the cookie and the bearer token alike)
    $("[data-download-data]", root).addEventListener("click", async (e) => {
      const button = e.currentTarget;
      const box = $("[data-data-status]", root);
      forms().busy(button, true, "Preparing…");
      try {
        const data = await FrameX.http.get("/users/me/data");
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `framex-my-data-${String(data.exportedAt || "").slice(0, 10) || "export"}.json`;
        root.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        forms().status(box, "success", "Your data was downloaded. Keep the file private: it holds your details.");
      } catch (error) {
        forms().status(box, "error", esc(error.message || "Your data couldn't be downloaded. Please try again."));
      } finally {
        forms().busy(button, false);
      }
    });
    const del = $("#delete-form", root);
    if (del)
      forms().handle(del, {
        busyLabel: "Deleting…",
        send: (v) => FrameX.http.post("/users/me/delete", { password: v.password, confirm: v.confirm }),
        async onSuccess() {
          // The server ended the session; this browser forgets it too
          try {
            await auth().logout();
          } catch (error) {
            /* already logged out on the server */
          }
          root.innerHTML = `<div class="account"><section class="account-card"><h1 class="account__title">Your account was deleted</h1><p class="account-card__lead">Your login and personal details are gone. A confirmation email is on its way to your old address. Thank you for using FrameX.</p><a class="btn btn--primary" href="index.html">Go to Home</a></section></div>`;
          window.scrollTo(0, 0);
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
