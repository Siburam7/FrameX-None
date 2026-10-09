/* ==========================================================================
   Login, sign-up, forgot-password and reset-password pages.

   - Sign-up creates customer accounts only. There is no shop or admin sign-up:
     shops apply on partner.html and receive credentials after FrameX approves.
   - The login page has two tabs (Customer / Local shop). The tab only tells
     the backend where to look; the role always comes from the backend.
   - Passwords go straight to the backend over the API and are never stored
     in the browser.
   - The login and sign-up forms are also shown inside the login dialog
     (ui/auth-gate.js) through mount(): same code, same backend calls.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const forms = () => FrameX.forms;
  const auth = () => FrameX.auth;

  const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";

  function shell(root, title, lead, body) {
    const heading = root.dataset.embedded ? `<h2 class="auth-card__title" id="auth-gate-title">${title}</h2>` : `<h1 class="auth-card__title">${title}</h1>`;
    root.innerHTML = `<div class="auth-card">
      ${heading}
      ${lead ? `<p class="auth-card__lead">${lead}</p>` : ""}
      ${body}
    </div>`;
  }

  /** Accounts need the FrameX backend. Say so plainly when it isn't there. */
  function unavailable(root) {
    const s = auth().state;
    shell(
      root,
      "Accounts aren't available right now",
      s.available
        ? "We can't reach the FrameX server at the moment. Please try again in a little while."
        : "FrameX accounts haven't been switched on for this site yet, and the cart needs an account. You can still browse every frame, and order by messaging us.",
      `<div class="auth-card__actions"><a class="btn btn--dark" href="shop.html">Browse frames</a>${s.available ? `<button class="btn btn--outline" type="button" data-reload>Try again</button>` : `<a class="btn btn--outline" href="contact.html">Contact us</a>`}</div>`,
    );
    const again = $("[data-reload]", root);
    if (again) again.addEventListener("click", () => window.location.reload());
  }

  const destination = (user) => {
    const next = auth().safeNext(FrameX.qs.param("next"));
    // "next" is honoured only if that page fits the role (a customer isn't sent to the shop dashboard).
    const allowed = !next || (/^shop-dashboard/.test(next) ? user.role === "SHOP" : /^admin/.test(next) ? user.role === "ADMIN" : true);
    return next && allowed ? next : auth().homeFor(user.role);
  };
  const after = (user) => {
    window.location.href = destination(user);
  };

  /** Keeps "?next=…" when moving between the login and sign-up pages, so the visitor still returns where they were. */
  const carryNext = () => {
    const next = auth().safeNext(FrameX.qs.param("next"));
    return next ? "?next=" + encodeURIComponent(next) : "";
  };

  /* ---------------------------------------------------------------- Login
     onSuccess(user) replaces the usual "go to the next page" (the login dialog uses it). */
  function login(root, { onSuccess = after } = {}) {
    let type = FrameX.qs.param("type") === "shop" ? "shop" : "customer";
    const copy = {
      customer: { label: "Email or phone", placeholder: "you@example.com", autocomplete: "username" },
      shop: { label: "Shop ID or email", placeholder: "FRX-SHOP-1001", autocomplete: "username" },
    };
    shell(
      root,
      "Log in to FrameX",
      "",
      `<div class="auth-tabs" role="tablist" aria-label="Account type">
        <button class="auth-tabs__btn" type="button" role="tab" id="tab-customer" aria-controls="login-form" data-type="customer">${icon("user")} Customer</button>
        <button class="auth-tabs__btn" type="button" role="tab" id="tab-shop" aria-controls="login-form" data-type="shop">${icon("store")} Local shop</button>
      </div>
      <form id="login-form" class="form-grid" role="tabpanel" novalidate>
        ${forms().field("identifier", copy[type].label, { required: true, autocomplete: "username", prefix: "login" })}
        ${forms().field("password", "Password", { required: true, type: "password", autocomplete: "current-password", toggle: true, prefix: "login" })}
        <p class="auth-card__row"><a href="forgot-password.html">Forgot password?</a></p>
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">Log in</button>
      </form>
      <p class="auth-card__alt" data-for="customer">New to FrameX? <a href="signup.html${carryNext()}" data-auth-view="signup">Create an account</a></p>
      <p class="auth-card__alt" data-for="shop">Shop logins are created by FrameX after your shop is approved. <a href="partner.html">Partner with FrameX</a></p>`,
    );

    const form = $("#login-form", root);
    function setType(next, focus) {
      type = next;
      $$(".auth-tabs__btn", root).forEach((b) => {
        const on = b.dataset.type === type;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      const input = form.elements.identifier;
      input.closest(".form-field").querySelector("label").textContent = copy[type].label;
      input.placeholder = copy[type].placeholder;
      input.setAttribute("inputmode", type === "shop" ? "text" : "email");
      $$("[data-for]", root).forEach((el) => (el.hidden = el.dataset.for !== type));
      forms().clearErrors(form);
      forms().status($(".form-status", form), null);
    }
    $(".auth-tabs", root).addEventListener("click", (e) => {
      const btn = e.target.closest("[data-type]");
      if (btn) setType(btn.dataset.type);
    });
    $(".auth-tabs", root).addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") setType(type === "shop" ? "customer" : "shop", true);
    });
    setType(type);

    forms().handle(form, {
      busyLabel: "Logging in…",
      send: (v) => auth().login(v.identifier.trim(), v.password, type),
      onSuccess,
    });
    form.elements.identifier.focus();
  }

  /* ---------------------------------------------------------------- Sign up (customers only) */
  function signup(root, { onSuccess = after } = {}) {
    shell(
      root,
      "Create your FrameX account",
      "Save your details and order frames from local shops.",
      `<form id="signup-form" class="form-grid" novalidate>
        ${forms().field("name", "Name", { required: true, autocomplete: "name", maxlength: 80, prefix: "su" })}
        ${forms().field("email", "Email", { required: true, type: "email", autocomplete: "email", prefix: "su" })}
        ${forms().field("phone", "Phone", { type: "tel", autocomplete: "tel", inputmode: "tel", placeholder: "10-digit mobile number", prefix: "su" })}
        ${forms().field("password", "Password", { required: true, type: "password", autocomplete: "new-password", toggle: true, hint: PASSWORD_HINT, prefix: "su" })}
        ${forms().field("confirmPassword", "Confirm password", { required: true, type: "password", autocomplete: "new-password", toggle: true, prefix: "su" })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">Create account</button>
        <p class="auth-card__fine">By creating an account you agree to the <a href="terms-of-use.html">Terms of Use</a> and <a href="privacy-notice.html">Privacy Notice</a>.</p>
      </form>
      <p class="auth-card__alt">Already have an account? <a href="login.html${carryNext()}" data-auth-view="login">Log in</a></p>
      <p class="auth-card__alt">Own a framing shop? <a href="partner.html">Partner with FrameX</a></p>`,
    );
    const form = $("#signup-form", root);
    forms().handle(form, {
      busyLabel: "Creating your account…",
      send(v) {
        if (v.password !== v.confirmPassword) throw new FrameX.http.ApiError("Please check the highlighted fields.", { fields: { confirmPassword: "The passwords don't match." } });
        // Only these fields are sent. The backend always creates a CUSTOMER.
        return auth().signup({ name: v.name, email: v.email, phone: v.phone, password: v.password, confirmPassword: v.confirmPassword });
      },
      onSuccess,
    });
    form.elements.name.focus();
  }

  /* ---------------------------------------------------------------- Forgot password
     1. Which account?           email, mobile number or Shop ID
     2. How to send the code?    Email / Mobile, shown masked; only what the account has
     3. Enter the 6-digit code   limited tries, resend after a short wait
     4. Choose a new password
     The backend sends through a real email / SMS provider. If a service is not
     configured, the page says so; it never shows a code or pretends one was sent. */
  const devMailboxUrl = () => FrameX.config.backend.url.replace(/\/api$/, "") + "/dev/mailbox";
  const CHANNEL = {
    email: { icon: "mail", send: "Send code to Email", sent: "We emailed a 6-digit code to", extra: " You can also use the button in that email." },
    sms: { icon: "phone", send: "Send code to Mobile", sent: "We texted a 6-digit code to", extra: "" },
  };
  /** Shown only when the backend is explicitly in development mode: nothing was really sent. */
  const devBanner = () =>
    `<div class="form-status form-status--dev is-visible" role="note">${icon("alert")}<span><strong>Development mode: nothing was really sent.</strong> This server is set to keep messages in its developer mailbox instead of delivering them. <a href="${esc(devMailboxUrl())}" target="_blank" rel="noopener">Open the developer mailbox</a>. On a live site the code goes to the inbox or phone.</span></div>`;

  function forgot(root) {
    let ticket = "";
    let channels = [];
    let identifier = "";

    const frame = (lead, body) =>
      shell(root, "Forgot your password?", lead, `${body}<p class="auth-card__alt"><a href="login.html">Back to log in</a></p>`);

    /* ---- 1. Which account? ---- */
    function accountStep() {
      frame(
        "Enter the email address, mobile number or Shop ID on your account.",
        `<form id="recovery-form" class="form-grid" novalidate>
          ${forms().field("identifier", "Email, mobile number or Shop ID", { required: true, autocomplete: "username", value: identifier, prefix: "fp" })}
          <div class="form-status" role="status" aria-live="polite"></div>
          <button class="btn btn--primary btn--block" type="submit">Continue</button>
        </form>`,
      );
      const form = $("#recovery-form", root);
      forms().handle(form, {
        busyLabel: "Looking up your account…",
        send: (v) => {
          identifier = v.identifier.trim();
          return auth().startRecovery(identifier);
        },
        onSuccess(result) {
          ticket = result.recoveryToken;
          channels = result.channels;
          optionsStep();
        },
      });
      form.elements.identifier.focus();
    }

    /* ---- 2. How should the code be sent? ---- */
    function optionsStep(message = "") {
      const usable = channels.filter((c) => c.available);
      frame(
        usable.length ? "How would you like to reset your password?" : "",
        `${message ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>${esc(message)}</span></div>` : ""}
        ${usable.length ? "" : `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>Password reset isn't available right now because FrameX can't send messages. Please <a href="contact.html">contact FrameX</a>.</span></div>`}
        <div class="recovery-options">${channels
          .map(
            (c) => `<button class="recovery-option" type="button" data-channel="${c.type}" ${c.available ? "" : "disabled"}>
              ${icon(CHANNEL[c.type].icon)}
              <span><strong>${CHANNEL[c.type].send}</strong><span>${esc(c.masked)}</span>${c.available ? "" : `<em>${esc(c.reason || "Not available")}</em>`}</span>
              ${c.available ? icon("chev-right") : ""}</button>`,
          )
          .join("")}</div>
        <p class="auth-card__alt"><button class="auth-link" type="button" data-restart>Use a different account</button></p>`,
      );
      $("[data-restart]", root).addEventListener("click", accountStep);
      $(".recovery-options", root).addEventListener("click", (e) => {
        const btn = e.target.closest("[data-channel]");
        if (btn && !btn.disabled) send(btn.dataset.channel, btn);
      });
    }

    /** Ask the backend to send a code. Success means the provider accepted it. */
    async function send(type, button) {
      const option = channels.find((c) => c.type === type);
      if (button) forms().busy(button, true, "Sending…");
      try {
        codeStep(option, await auth().sendRecoveryCode(ticket, type));
      } catch (error) {
        if (error.code === "RECOVERY_EXPIRED") return accountStep();
        // Not configured, provider failure, too many requests, no connection: say which.
        optionsStep(error.message);
      }
    }

    /* ---- 3. Enter the code ---- */
    function codeStep(option, info) {
      const copy = CHANNEL[option.type];
      frame(
        `${copy.sent} <strong>${esc(info.masked)}</strong>. It expires in ${info.expiresInMinutes} minutes.${copy.extra}`,
        `${info.devMode ? devBanner() : ""}
        <form id="otp-verify-form" class="form-grid" novalidate>
          ${forms().field("code", "6-digit code", { required: true, autocomplete: "one-time-code", inputmode: "numeric", maxlength: 6, placeholder: "••••••", prefix: "fp" })}
          <div class="form-status" role="status" aria-live="polite"></div>
          <button class="btn btn--primary btn--block" type="submit">Verify code</button>
        </form>
        <p class="auth-card__alt otp-actions"><button class="auth-link" type="button" data-resend disabled>Resend code</button> · <button class="auth-link" type="button" data-other>Try another way</button></p>`,
      );
      const form = $("#otp-verify-form", root);
      const status = $(".form-status", form);
      const input = form.elements.code;
      input.classList.add("otp-input");
      input.addEventListener("input", () => (input.value = input.value.replace(/\D/g, "").slice(0, 6)));

      // "Resend code" unlocks after the backend's wait time.
      const resend = $("[data-resend]", root);
      let left = info.resendAfterSeconds || 30;
      const tick = () => {
        if (!resend.isConnected) return;
        resend.disabled = left > 0;
        resend.textContent = left > 0 ? `Resend available in ${left} seconds` : "Resend code";
        if (left-- > 0) setTimeout(tick, 1000);
      };
      tick();
      resend.addEventListener("click", async () => {
        resend.disabled = true;
        try {
          codeStep(option, await auth().sendRecoveryCode(ticket, option.type));
        } catch (error) {
          if (error.code === "RECOVERY_EXPIRED") return accountStep();
          forms().status(status, "error", esc(error.message));
          left = error.retryAfterSeconds || 0;
          tick();
        }
      });
      $("[data-other]", root).addEventListener("click", () => optionsStep());

      forms().handle(form, {
        busyLabel: "Checking…",
        send: (v) => auth().verifyRecoveryCode(ticket, option.type, v.code.trim()),
        // A correct code is exchanged for a one-time reset token; the new password is set with it.
        onSuccess: (result) => passwordStep(root, result.resetToken, { lead: "Code verified. Now choose a new password." }),
      });
      input.focus();
    }

    accountStep();
  }

  /** The "choose a new password" form, used after a reset link, a verified code, or a shop setup link. */
  function passwordStep(root, token, { setup = false, shop = null, lead = "" } = {}) {
    shell(
      root,
      setup ? "Set your shop password" : "Choose a new password",
      setup && shop ? `Shop ID <strong>${esc(shop.shopCode)}</strong> · ${esc(shop.name)}. You'll log in with this Shop ID (or your email) and the password you choose now.` : esc(lead),
      `<form id="reset-form" class="form-grid" novalidate>
        ${forms().field("password", "New password", { required: true, type: "password", autocomplete: "new-password", toggle: true, hint: PASSWORD_HINT, prefix: "rp" })}
        ${forms().field("confirmPassword", "Confirm password", { required: true, type: "password", autocomplete: "new-password", toggle: true, prefix: "rp" })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">${setup ? "Set password" : "Save new password"}</button>
      </form>`,
    );
    const form = $("#reset-form", root);
    forms().handle(form, {
      busyLabel: "Saving…",
      send: (v) => auth().resetPassword(token, v.password, v.confirmPassword),
      onSuccess(result) {
        const isShop = result.role === "SHOP";
        shell(
          root,
          setup ? "Your shop account is ready" : "Password updated",
          isShop && result.shopCode ? `Log in with Shop ID <strong>${esc(result.shopCode)}</strong> and your new password.` : "Log in with your new password. Other devices have been signed out.",
          `<div class="auth-card__actions"><a class="btn btn--primary" href="login.html${isShop ? "?type=shop" : ""}">Log in</a></div>`,
        );
      },
    });
    form.elements.password.focus();
  }

  /* ---------------------------------------------------------------- Reset password / first-time shop setup */
  async function reset(root) {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    // Take the token out of the address bar and history.
    if (token) history.replaceState(null, "", window.location.pathname);
    let info = { valid: false };
    if (token) {
      try {
        info = await auth().tokenInfo(token);
      } catch (error) {
        if (error.network) return unavailable(root);
      }
    }
    if (!info.valid) {
      return shell(
        root,
        "This link is no longer valid",
        "Password links work once and expire. Ask for a new one and try again.",
        `<div class="auth-card__actions"><a class="btn btn--dark" href="forgot-password.html">Get a new link</a><a class="btn btn--outline" href="login.html">Log in</a></div>
         <p class="auth-card__alt">Setting up a shop account? Ask FrameX to send you a new setup link.</p>`,
      );
    }
    passwordStep(root, token, { setup: info.purpose === "ACCOUNT_SETUP", shop: info.shop });
  }

  async function init() {
    const root = $("#auth-root");
    if (!root) return;
    const page = document.body.dataset.page;
    const state = await auth().ready;
    if (!state.available || !state.reachable) return unavailable(root);
    // Already logged in: the login and sign-up pages have nothing to offer.
    if (state.authenticated && (page === "login" || page === "signup")) return after(state.user);
    ({ login, signup, "forgot-password": forgot, "reset-password": reset })[page](root);
  }

  /** Show the login or sign-up form inside `root` (the login dialog). view: "login" | "signup" */
  const mount = (root, view, options) => (view === "signup" ? signup : login)(root, options);

  FrameX.authPages = { init, mount, unavailable };
})((window.FrameX = window.FrameX || {}));
