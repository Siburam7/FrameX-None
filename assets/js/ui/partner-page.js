/* ==========================================================================
   "Partner With FrameX" (partner.html): a framing shop asks to join.
   This sends an APPLICATION for FrameX to review (POST /api/shops/applications).
   It does not create a login. After approval a FrameX admin creates the shop
   account and the shop receives its Shop ID and a link to set its password.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const forms = () => FrameX.forms;

  function formHtml() {
    const f = forms().field;
    const o = { prefix: "pa" };
    return `<form id="partner-form" class="form-grid" novalidate>
      <div class="form-grid form-grid--2">
        ${f("shopName", "Shop name", { ...o, required: true, autocomplete: "organization", maxlength: 120 })}
        ${f("ownerName", "Owner name", { ...o, required: true, autocomplete: "name", maxlength: 80 })}
      </div>
      <div class="form-grid form-grid--2">
        ${f("phone", "Phone", { ...o, required: true, type: "tel", autocomplete: "tel", inputmode: "tel", placeholder: "10-digit mobile number" })}
        ${f("email", "Email", { ...o, required: true, type: "email", autocomplete: "email", hint: "Your Shop ID and password link are sent here if you're approved." })}
      </div>
      ${f("address", "Shop address", { ...o, required: true, autocomplete: "street-address", maxlength: 300, placeholder: "Building, street, area" })}
      <div class="form-grid form-grid--3">
        ${f("city", "City", { ...o, required: true, autocomplete: "address-level2", maxlength: 80 })}
        ${f("state", "State", { ...o, required: true, autocomplete: "address-level1", maxlength: 80 })}
        ${f("postalCode", "PIN code", { ...o, required: true, autocomplete: "postal-code", inputmode: "numeric", maxlength: 10 })}
      </div>
      ${f("businessDetails", "About your shop", { ...o, rows: 3, maxlength: 1000, placeholder: "What you make, how long you've been framing, opening hours…" })}
      ${f("message", "Message to FrameX", { ...o, rows: 3, maxlength: 1000 })}
      <div class="form-status" role="status" aria-live="polite"></div>
      <div><button class="btn btn--primary" type="submit">Send application</button></div>
      <p class="auth-card__fine">Sending this form does not create an account. FrameX reviews every shop before it is listed.</p>
    </form>`;
  }

  async function init() {
    const root = $("#partner-root");
    if (!root) return;
    const state = await FrameX.auth.ready;
    if (!state.available || !state.reachable) {
      // No backend to receive the form: say so and give the real contact routes.
      const c = (FrameX.seed.site && FrameX.seed.site.contact) || {};
      root.innerHTML = `<div class="state-message"><strong>Online applications aren't open ${state.available ? "right now" : "yet"}</strong>
        <span>Contact FrameX directly and we'll take your shop's details.</span>
        <div class="auth-card__actions">${c.whatsapp ? `<a class="btn btn--dark btn--sm" href="${esc(FrameX.contact.whatsappUrl(c.whatsapp))}" target="_blank" rel="noopener noreferrer">${icon("phone")} WhatsApp FrameX</a>` : ""}
        ${c.email ? `<a class="btn btn--outline btn--sm" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Partner with FrameX")}">${icon("mail")} Email FrameX</a>` : ""}</div></div>`;
      return;
    }
    root.innerHTML = formHtml();
    const form = $("#partner-form", root);
    forms().handle(form, {
      busyLabel: "Sending…",
      send: (v) => FrameX.http.post("/shops/applications", { shopName: v.shopName, ownerName: v.ownerName, phone: v.phone, email: v.email, address: v.address, city: v.city, state: v.state, postalCode: v.postalCode, businessDetails: v.businessDetails, message: v.message }),
      onSuccess(result) {
        root.innerHTML = `<div class="partner-done" role="status" tabindex="-1">${icon("check")}
          <h2>Application received</h2>
          <p>${esc(result.message)}</p>
          <p class="partner-done__ref">Reference: <code>${esc(result.application.id.slice(0, 8).toUpperCase())}</code></p>
          <a class="btn btn--outline btn--sm" href="index.html">Back to home</a></div>`;
        $(".partner-done", root).focus();
      },
    });
  }

  FrameX.partnerPage = { init };
})((window.FrameX = window.FrameX || {}));
