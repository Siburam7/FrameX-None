/* ==========================================================================
   The login box's content, and the forgot-password and reset-password pages.
   (Since 2026-10-31 there is no login or sign-up page: login.html / signup.html open the home page with the
   login box, ui/auth-gate.js.)

   - Sign-up creates customer accounts only. There is no shop or admin sign-up:
     shops apply on partner.html and receive credentials after FrameX approves.
   - Logging in also signs up: Google, or an email + a 6-digit code (a new email
     gives its name and becomes an account). "Log in using password" keeps the
     password form; it has two tabs (Customer / Local shop): the tab only tells the
     backend where to look; the role always comes from the backend.
   - Passwords go straight to the backend over the API and are never stored
     in the browser.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const forms = () => FrameX.forms;
  const auth = () => FrameX.auth;

  const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";

  /* ---------------------------------------------------------------- Continue with Google / Facebook (owner, 2026-10-26)
     Shown on the customer login, the sign-up and the login dialog, only when the backend says so (GET /api/config ->
     auth.google / auth.facebook: public ids, no secret). Google draws its own button (Google Identity Services) and
     answers with an ID token; Facebook's SDK answers with an access token. Either goes to the backend, which checks
     it with Google / Facebook before anyone is logged in (backend lib/social-login.js). */
  const GOOGLE_SDK = "https://accounts.google.com/gsi/client";
  const FACEBOOK_SDK = "https://connect.facebook.net/en_US/sdk.js";
  const FACEBOOK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07"/></svg>';
  const sdks = {};
  const loadSdk = (src) =>
    (sdks[src] =
      sdks[src] ||
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => {
          delete sdks[src];
          reject(new Error(src + " didn't load"));
        };
        document.head.appendChild(s);
      }));
  let googleFor = ""; // the Client ID Google's library was started with (once per page)
  let googleAnswer = null; // what the button on screen does with Google's answer
  let facebookFor = "";

  /** The (still empty) place for the buttons; mountSocial() fills it, or removes it when neither is switched on. */
  const socialBlock = (mode, or = mode === "signup" ? "or sign up with email" : "or log in with email / phone") => `<div class="soc" data-social data-for="customer">
        <div class="soc__buttons"></div>
        <div class="form-status" role="status" aria-live="polite"></div>
        <p class="soc__or"><span>${or}</span></p>
      </div>`;

  async function mountSocial(root, mode, onSuccess) {
    const box = $("[data-social]", root);
    if (!box) return;
    let ids = null;
    try {
      const settings = FrameX.http && FrameX.http.serverConfig ? await FrameX.http.serverConfig() : null;
      ids = settings && settings.auth;
    } catch (error) {
      ids = null;
    }
    if (!ids || (!ids.google && !ids.facebook)) return box.remove();
    const buttons = $(".soc__buttons", box);
    const status = $(".form-status", box);
    const finish = async (provider, body) => {
      forms().status(status, "info", "Logging you in…");
      try {
        onSuccess(await auth().socialLogin(provider, body));
      } catch (error) {
        forms().status(status, "error", esc(error.message || "That didn't work. Please try again."));
      }
    };
    const width = () => Math.min(400, Math.max(220, Math.round(buttons.clientWidth || box.clientWidth || 320)));

    if (ids.google) {
      const holder = document.createElement("div");
      holder.className = "soc__google";
      buttons.appendChild(holder);
      try {
        await loadSdk(GOOGLE_SDK);
        const google = window.google.accounts.id;
        if (googleFor !== ids.google) {
          google.initialize({ client_id: ids.google, callback: (answer) => googleAnswer && googleAnswer(answer), ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true });
          googleFor = ids.google;
        }
        googleAnswer = (answer) => answer && answer.credential && finish("google", { credential: answer.credential });
        box.classList.add("is-ready");
        google.renderButton(holder, { type: "standard", theme: "outline", size: "large", shape: "pill", text: mode === "signup" ? "signup_with" : "continue_with", logo_alignment: "center", width: width() });
      } catch (error) {
        holder.remove(); // Google can't be reached from here (blocked, offline): the email form still works
      }
    }

    if (ids.facebook) {
      try {
        await loadSdk(FACEBOOK_SDK);
        if (facebookFor !== ids.facebook) {
          window.FB.init({ appId: ids.facebook, cookie: false, xfbml: false, version: "v26.0" }); // v19.0 has expired (2026-11-09)
          facebookFor = ids.facebook;
        }
        buttons.insertAdjacentHTML("beforeend", `<button class="soc__facebook" type="button">${FACEBOOK_ICON}<span>${mode === "signup" ? "Sign up with Facebook" : "Continue with Facebook"}</span></button>`);
        box.classList.add("is-ready");
        $(".soc__facebook", buttons).addEventListener("click", () =>
          // FB.login straight from the click, so the browser lets its window open
          window.FB.login(
            (answer) => {
              if (answer && answer.authResponse && answer.authResponse.accessToken) finish("facebook", { accessToken: answer.authResponse.accessToken });
              else forms().status(status, "error", "Facebook login was cancelled.");
            },
            { scope: "public_profile,email" },
          ),
        );
      } catch (error) {
        /* Facebook can't be reached from here: no Facebook button */
      }
    }
    if (!buttons.children.length) box.remove();
  }

  /** top: what sits above the heading (the login box's step bars, a "Back" link). */
  function shell(root, title, lead, body, top = "") {
    const heading = root.dataset.embedded ? `<h2 class="auth-card__title" id="auth-gate-title">${title}</h2>` : `<h1 class="auth-card__title">${title}</h1>`;
    root.innerHTML = `<div class="auth-card">
      ${top}
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
    const allowed = !next || (/^shop-dashboard/.test(next) ? user.role === "SHOP" : /^admin/.test(next) ? user.role === "ADMIN" || user.role === "CARE" : true);
    return next && allowed ? next : auth().homeFor(user.role);
  };
  const after = (user) => {
    window.location.href = destination(user);
  };
  /** After a log-in or sign-up on these pages: the page that opens next plays the FrameX logo animation (ui/welcome.js). */
  const welcome = (user) => {
    try {
      window.sessionStorage.setItem("framex.welcome", String(Date.now()));
    } catch (error) {
      /* storage is blocked: the next page just opens */
    }
    after(user);
  };

  /* ---------------------------------------------------------------- Login box (owner, 2026-10-31)
     No login or sign-up page: everything happens in a box over the page (ui/auth-gate.js). Two ways in: Continue
     with Google, or an email + a 6-digit code. A new address that gets a correct code is asked only for its name
     (filled in from the email, changeable) and becomes a customer account; an existing customer goes straight in.
     "Log in using password" keeps the password form (old accounts, shops, artists, staff).
     onSuccess(user) is what the box does after a login. */
  const MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  /** Step 1 email, 2 code, 3 name: three short bars at the top of the box. */
  const steps = (n) => `<div class="auth-steps" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= n ? ' class="is-on"' : ""}></i>`).join("")}</div>`;

  /** "siburam.n7@gmail.com" -> "Siburam", "ravi.kumar@x.in" -> "Ravi Kumar": only a guess, the person can change it. */
  const nameFromEmail = (email) =>
    String(email || "")
      .split("@")[0]
      .split(/[^a-z]+/i)
      .filter((part) => part.length >= 2)
      .slice(0, 3)
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join(" ")
      .slice(0, 80);

  /* A phone number too (2026-11-01): the code then goes by SMS, or on WhatsApp first when the server has that on
     (2026-11-07, owner: "WhatsApp pehle, SMS backup"). Offered only while the server can send one of them (GET
     /api/config features.smsDelivery / whatsappLoginCodes); a new number's email is optional (owner: "Email
     optional"). The owner's layout: a toggle "Phone number | Email" above the box, phone chosen first. */
  const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>';
  /** "98765 43210", "+91 98765 43210": a phone number, not an email. */
  const looksLikePhone = (value) => /^[+\d\s()-]+$/.test(String(value).trim()) && String(value).replace(/\D/g, "").length >= 10;
  let smsOn = null; // can the server send a code to a phone? null until GET /api/config has answered
  let waOn = false; // … and does it go on WhatsApp first?
  const smsLogin = () =>
    FrameX.http
      .serverConfig()
      .then((c) => {
        const f = (c && c.features) || {};
        waOn = Boolean(f.whatsappLoginCodes);
        return waOn || Boolean(f.smsDelivery && f.smsDelivery !== "none");
      })
      .catch(() => false);

  /** Step 1. how: "phone" | "email" (the toggle; phone first). email: what was typed before (back from step 2). */
  function codeStart(root, { onSuccess, email = "", how = "phone" }) {
    const tabs = smsOn === true;
    const byPhone = tabs && how === "phone";
    const before = byPhone === looksLikePhone(email) ? email : "";
    shell(
      root,
      "Log in or sign up",
      tabs ? "Use your phone number, email or Google. New here? Your account is made when you log in." : "Use your email or Google. New here? Your account is made when you log in.",
      `${socialBlock("login", tabs ? "or use your phone number or email" : "or use your email")}
      ${
        tabs
          ? `<div class="auth-tabs" role="tablist" aria-label="Log in with">
        <button class="auth-tabs__btn" type="button" role="tab" id="tab-phone" aria-controls="code-form" aria-selected="${byPhone}" data-how="phone">${icon("phone")} Phone number</button>
        <button class="auth-tabs__btn" type="button" role="tab" id="tab-email" aria-controls="code-form" aria-selected="${!byPhone}" data-how="email">${icon("mail")} Email</button>
      </div>`
          : ""
      }
      <form id="code-form" class="form-grid" novalidate${tabs ? ` role="tabpanel" aria-labelledby="tab-${byPhone ? "phone" : "email"}"` : ""}>
        ${
          byPhone
            ? forms().field("phone", "Phone number", { required: true, type: "tel", autocomplete: "tel-national", inputmode: "numeric", placeholder: "98765 43210", maxlength: 16, value: before, hint: `We'll send a 6-digit code ${waOn ? "on WhatsApp" : "by SMS"}.`, prefix: "cl" })
            : // the same one-line hint as the phone box, so the box keeps its height when the toggle changes (owner)
              forms().field("email", "Email", { required: true, type: "email", autocomplete: "email", inputmode: "email", placeholder: "you@gmail.com", value: before, hint: "We'll send a 6-digit code by email.", prefix: "cl" })
        }
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">Send me a code</button>
      </form>
      <p class="auth-card__alt"><button class="auth-link auth-link--strong" type="button" data-use-password>Log in using password</button></p>
      <p class="auth-card__fine auth-card__center">By continuing you agree to the <a href="terms-of-use.html">Terms of Use</a> and <a href="privacy-notice.html">Privacy Notice</a>.</p>`,
      steps(1),
    );
    const form = $("#code-form", root);
    const input = form.elements.phone || form.elements.email;
    // The first time, the server's answer decides whether the toggle (phone first) is there
    if (smsOn === null)
      smsLogin().then((on) => {
        smsOn = on;
        if (on && form.isConnected && !input.value) codeStart(root, { onSuccess, how });
      });
    $$("[data-how]", root).forEach((tab) => tab.addEventListener("click", () => tab.getAttribute("aria-selected") !== "true" && codeStart(root, { onSuccess, how: tab.dataset.how })));
    $("[data-use-password]", root).addEventListener("click", () => passwordLogin(root, { onSuccess }));
    forms().handle(form, {
      busyLabel: "Sending…",
      send: (v) => {
        const to = (byPhone ? v.phone : v.email).trim();
        return (byPhone ? auth().sendPhoneCode(to) : auth().sendLoginCode(to)).then((info) => ({ info, email: to }));
      },
      onSuccess: ({ info, email: sentTo }) => codeEntry(root, { onSuccess, email: sentTo, info, byPhone }),
    });
    mountSocial(root, "login", onSuccess);
    input.focus();
  }

  /**
   * "Enter the code": six boxes (typing moves on, pasting fills them all, the sixth digit sends it).
   * A code on WhatsApp (info.channel) offers "Send it by SMS instead" for a number without WhatsApp; it waits like
   * "Send a new code" (each message costs money).
   */
  function codeEntry(root, { onSuccess, email, info, byPhone = false }) {
    const onWa = byPhone && info.channel === "whatsapp";
    const from = onWa ? "WhatsApp" : byPhone ? "the SMS" : "the email";
    const help = onWa
      ? info.smsAvailable
        ? 'Didn\'t get it? <button class="auth-link" type="button" data-by-sms disabled>Send it by SMS instead</button>'
        : "Didn't get it? Check WhatsApp on this number, or wait a moment."
      : byPhone
        ? "Didn't get it? Check the number, or wait a moment."
        : "Didn't get it? Check your spam folder.";
    shell(
      root,
      "Enter the code",
      "",
      `${info.devMode ? devBanner() : ""}
      <p class="auth-mail">${byPhone ? PHONE_ICON : MAIL_ICON}<span>We sent a 6-digit code ${onWa ? "on WhatsApp " : byPhone ? "by SMS " : ""}to <strong>${esc(info.masked)}</strong></span></p>
      <form id="code-verify-form" class="form-grid" novalidate>
        <fieldset class="otp-boxes">
          <legend class="visually-hidden">The 6-digit code</legend>
          <div class="otp-boxes__row">${[1, 2, 3, 4, 5, 6]
            .map((n) => `<input class="otp-boxes__digit" type="text" inputmode="numeric" maxlength="1" aria-label="Digit ${n} of 6"${n === 1 ? ' autocomplete="one-time-code"' : ' autocomplete="off"'}>`)
            .join("")}</div>
          <input type="hidden" name="code">
        </fieldset>
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">Continue</button>
      </form>
      <p class="auth-card__alt">${help}<br><button class="auth-link" type="button" data-resend disabled></button></p>`,
      `${steps(2)}<button class="auth-link auth-back" type="button" data-change>← Change ${byPhone ? "number" : "email"}</button>`,
    );
    const form = $("#code-verify-form", root);
    const status = $(".form-status", form);
    const boxes = $$(".otp-boxes__digit", form);
    const hidden = form.elements.code;
    const sync = () => (hidden.value = boxes.map((b) => b.value).join(""));
    const fill = (digits, from = 0) => {
      digits.split("").forEach((d, i) => boxes[from + i] && (boxes[from + i].value = d));
      sync();
      (boxes.find((b) => !b.value) || boxes[5]).focus();
      if (hidden.value.length === 6) form.requestSubmit();
    };
    boxes.forEach((box, i) => {
      box.addEventListener("input", () => {
        const digits = box.value.replace(/\D/g, "");
        box.value = "";
        if (digits) fill(digits.slice(0, 6 - i), i);
        else sync();
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && i > 0) {
          boxes[i - 1].value = "";
          boxes[i - 1].focus();
          sync();
          e.preventDefault();
        }
        if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowRight" && i < 5) boxes[i + 1].focus();
      });
      box.addEventListener("paste", (e) => {
        const digits = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        if (!digits) return;
        e.preventDefault();
        boxes.forEach((b) => (b.value = ""));
        fill(digits, 0);
      });
    });

    // "Send a new code" (and "Send it by SMS instead") unlock after the backend's wait time
    const resend = $("[data-resend]", root);
    const bySms = $("[data-by-sms]", root);
    let left = info.resendAfterSeconds || 30;
    const tick = () => {
      if (!resend.isConnected) return;
      resend.disabled = left > 0;
      if (bySms) bySms.disabled = left > 0;
      resend.textContent = left > 0 ? `You can ask for a new code in 0:${String(left).padStart(2, "0")}` : "Send a new code";
      if (left-- > 0) setTimeout(tick, 1000);
    };
    tick();
    // A new code goes the same way as this one (a number that got its code by SMS keeps getting SMS)
    const again = (via) => async () => {
      resend.disabled = true;
      if (bySms) bySms.disabled = true;
      try {
        codeEntry(root, { onSuccess, email, byPhone, info: await (byPhone ? auth().sendPhoneCode(email, via) : auth().sendLoginCode(email)) });
      } catch (error) {
        forms().status(status, "error", esc(error.message));
        left = error.retryAfterSeconds || 0;
        tick();
      }
    };
    resend.addEventListener("click", again(byPhone ? info.channel : undefined));
    if (bySms) bySms.addEventListener("click", again("sms"));
    $("[data-change]", root).addEventListener("click", () => codeStart(root, { onSuccess, email, how: byPhone ? "phone" : "email" }));

    forms().handle(form, {
      busyLabel: "Checking…",
      send: (v) => {
        if (!/^\d{6}$/.test(v.code)) throw new FrameX.http.ApiError(`Enter the 6-digit code from ${from}.`);
        return byPhone ? auth().verifyPhoneCode(email, v.code) : auth().verifyLoginCode(email, v.code);
      },
      // A new address: its name; an existing customer is in
      onSuccess: (result) => (result && result.newAccount ? nameStep(root, { onSuccess, ticket: result.signupToken, email: byPhone ? "" : email, byPhone }) : onSuccess(result)),
    });
    boxes[0].focus();
  }

  /**
   * "Welcome to FrameX!": a new address, its code checked. The name is filled in from the email and can be changed.
   * A new mobile number (byPhone): the name, and an email only if they want to give one (it can be left empty).
   */
  function nameStep(root, { onSuccess, ticket, email, byPhone = false }) {
    const guess = nameFromEmail(email);
    shell(
      root,
      "Welcome to FrameX!",
      guess ? "We filled in your name from your email. Change it if you like." : "Tell us your name to finish.",
      `<form id="name-form" class="form-grid" novalidate>
        <div class="auth-filled${guess ? " is-guess" : ""}">
          ${forms().field("name", "Your name", { required: true, autocomplete: "name", maxlength: 80, value: guess, hint: "This name goes on your orders.", prefix: "cn" })}
          <em class="auth-filled__tag" aria-hidden="true">from email</em>
        </div>
        ${byPhone ? forms().field("email", "Email", { type: "email", autocomplete: "email", inputmode: "email", placeholder: "you@gmail.com", hint: "For order emails. Leave it empty to skip.", prefix: "cn" }) : ""}
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">Continue</button>
        <p class="auth-card__fine auth-card__center">${byPhone ? "You can add a password later in your account." : "You can add a mobile number and a password later in your account."}</p>
      </form>`,
      steps(3),
    );
    const form = $("#name-form", root);
    const input = form.elements.name;
    $("label", $(".auth-filled", form)).appendChild($(".auth-filled__tag", form)); // the tag sits at the end of the label
    // Once they change it, it is no longer "from email"
    input.addEventListener("input", () => $(".auth-filled", form).classList.remove("is-guess"));
    forms().handle(form, {
      busyLabel: "Creating your account…",
      send: (v) => auth().codeSignup(ticket, v.name.trim(), undefined, byPhone ? (v.email || "").trim() : undefined),
      onSuccess,
    });
    input.focus();
    input.select();
  }

  /* ---------------------------------------------------------------- Log in using password (old accounts, shops, artists, staff) */
  function passwordLogin(root, { onSuccess, type: startType } = {}) {
    let type = startType === "shop" ? "shop" : "customer";
    const copy = {
      customer: { label: "Email or phone", placeholder: "you@example.com", autocomplete: "username" },
      shop: { label: "Shop ID or email", placeholder: "FRX-SHOP-1001", autocomplete: "username" },
    };
    shell(
      root,
      "Log in with password",
      "",
      `<div class="auth-tabs" role="tablist" aria-label="Account type">
        <button class="auth-tabs__btn" type="button" role="tab" id="tab-customer" aria-controls="login-form" data-type="customer">${icon("user")} Customer / artist</button>
        <button class="auth-tabs__btn" type="button" role="tab" id="tab-shop" aria-controls="login-form" data-type="shop">${icon("store")} Local shop</button>
      </div>
      <form id="login-form" class="form-grid" role="tabpanel" novalidate>
        ${forms().field("identifier", copy[type].label, { required: true, autocomplete: "username", prefix: "login" })}
        ${forms().field("password", "Password", { required: true, type: "password", autocomplete: "current-password", toggle: true, prefix: "login" })}
        <p class="auth-card__row"><a href="forgot-password.html">Forgot password?</a></p>
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary btn--block" type="submit">Log in</button>
      </form>
      <p class="auth-card__alt" data-for="customer"><button class="auth-link auth-link--strong" type="button" data-use-code>Log in with an email code instead</button></p>
      <p class="auth-card__alt" data-for="shop">Shop logins are created by FrameX after your shop is approved. <a href="partner.html">Partner with FrameX</a></p>`,
      `<button class="auth-link auth-back" type="button" data-back>← Back</button>`,
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
    const toCode = () => codeStart(root, { onSuccess });
    $("[data-back]", root).addEventListener("click", toCode);
    $("[data-use-code]", root).addEventListener("click", toCode);

    forms().handle(form, {
      busyLabel: "Logging in…",
      send: (v) => auth().login(v.identifier.trim(), v.password, type),
      onSuccess,
    });
    form.elements.identifier.focus();
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
    // "#token=" (emails, the admin's copy), or "?token=" (the WhatsApp button: Meta refuses a "#" in a button address)
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || new URLSearchParams(window.location.search).get("token") || "";
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
    // Already logged in: the login and sign-up addresses have nothing to offer.
    if (state.authenticated && (page === "login" || page === "signup")) return after(state.user);
    // No login or sign-up page any more (owner, 2026-10-31): the home page opens with the login box; "next" and
    // "type=shop" go along, so old links, emails and bookmarks still work (ui/auth-gate.js reads ?login=1).
    if (page === "login" || page === "signup") {
      const q = new URLSearchParams(window.location.search);
      q.set("login", "1");
      return window.location.replace("index.html?" + q);
    }
    ({ "forgot-password": forgot, "reset-password": reset })[page](root);
  }

  /** The login box's content inside `root`. view: "login" (email code, Google) | "shop" (password form, shop tab) */
  const mount = (root, view, options) => (view === "shop" ? passwordLogin(root, { ...options, type: "shop" }) : codeStart(root, options));

  FrameX.authPages = { init, mount, unavailable, destination, welcome };
})((window.FrameX = window.FrameX || {}));
