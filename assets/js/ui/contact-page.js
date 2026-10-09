/* ==========================================================================
   Contact page.
   The form sends the message to the FrameX backend (POST /api/contact): it is
   kept for the admin panel ("Messages") and an alert email goes to FrameX's
   own address. The visitor's email app is never opened.
   - sent                      -> says so, and empties the form
   - refused / no connection   -> says it was NOT sent, and keeps what was typed
   - no backend on this site   -> says plainly that the form is not connected
   ========================================================================== */
(function (FrameX) {
  const { $, $$, icon, escapeHtml: esc } = FrameX.dom;

  const RULES = {
    name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
    email: (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
        ? ""
        : "Please enter a valid email address.",
    phone: (v) =>
      !v.trim() || /^[+\d][\d\s\-()]{6,}$/.test(v.trim())
        ? ""
        : "Please enter a valid phone number, or leave it empty.",
    subject: (v) => (v.trim().length >= 3 ? "" : "Please add a subject."),
    message: (v) =>
      v.trim().length >= 10 ? "" : "Please write at least 10 characters.",
  };

  function setError(field, message) {
    const wrap = field.closest(".form-field");
    wrap.dataset.invalid = message ? "true" : "false";
    $(".form-field__error span", wrap).textContent = message;
    field.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function status(form, kind, text) {
    const box = $("#contact-status", form);
    box.className = `form-status form-status--${kind} is-visible`;
    box.innerHTML = `${icon(kind === "error" ? "close" : "check")}<span>${esc(text)}</span>`;
  }

  /** -> "sent" | "not-connected". Throws when the server refused the message or couldn't be reached. */
  async function sendMessage(data) {
    if (!FrameX.http || !FrameX.http.enabled()) return "not-connected";
    await FrameX.http.post("/contact", data);
    return "sent";
  }

  async function init() {
    const form = $("#contact-form");
    if (!form) return;
    let contact = {};
    try {
      contact = (await FrameX.api.getSite()).contact || {};
    } catch (e) {
      /* form still works */
    }

    const info = $("#contact-info");
    const rows = [
      contact.email &&
        `<li>${icon("mail")}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>`,
      contact.phone &&
        `<li>${icon("phone")}<a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ""))}">${esc(contact.phone)}</a></li>`,
      contact.whatsapp &&
        `<li>${icon("phone")}<a href="https://wa.me/${esc(String(contact.whatsapp).replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(FrameX.contact.formatWhatsapp(contact.whatsapp))}</a></li>`,
    ].filter(Boolean);
    info.innerHTML = rows.length
      ? `<ul class="info-list">${rows.join("")}</ul>`
      : `<p class="contact-info__empty">FrameX hasn't published a phone number or email address yet. They will be listed here as soon as they are available.</p>`;

    const fields = $$("input, textarea", form).filter((f) => RULES[f.name]);
    fields.forEach((field) => {
      field.addEventListener("blur", () =>
        setError(field, RULES[field.name](field.value)),
      );
      field.addEventListener(
        "input",
        () =>
          field.closest(".form-field").dataset.invalid === "true" &&
          setError(field, RULES[field.name](field.value)),
      );
    });

    // A logged-in customer doesn't have to type who they are again.
    if (FrameX.auth && FrameX.auth.ready)
      FrameX.auth.ready
        .then((state) => {
          if (!state.authenticated || !state.user) return;
          if (!form.name.value) form.name.value = state.user.name || "";
          if (!form.email.value) form.email.value = state.user.email || "";
        })
        .catch(() => {});

    const button = $("button[type=submit]", form);
    let busy = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      let firstBad = null;
      fields.forEach((f) => {
        const message = RULES[f.name](f.value);
        setError(f, message);
        if (message && !firstBad) firstBad = f;
      });
      if (firstBad) {
        status(form, "error", "Please fix the highlighted fields.");
        return firstBad.focus();
      }
      const data = Object.fromEntries(fields.map((f) => [f.name, f.value.trim()]));
      data.fxhp = form.fxhp ? form.fxhp.value : "";
      busy = true;
      button.disabled = true;
      const label = button.textContent;
      button.textContent = "Sending…";
      try {
        const result = await sendMessage(data);
        if (result === "sent") {
          form.reset();
          status(form, "success", `Thank you, ${data.name}. Your message has been sent to FrameX. We will reply to ${data.email}.`);
        } else {
          status(form, "info", "Your message couldn't be sent from this page. Please reach us on WhatsApp or by email using the details on this page.");
        }
      } catch (error) {
        // The server names the fields it refused; show each under its own box.
        let shown = false;
        if (error.fields)
          fields.forEach((f) => {
            if (!error.fields[f.name]) return;
            setError(f, error.fields[f.name]);
            shown = true;
          });
        status(
          form,
          "error",
          shown
            ? "Please fix the highlighted fields."
            : error.status === 429
              ? "You have sent several messages already. Please wait a while before sending another, or reach us using the details on this page."
              : "Your message was NOT sent: FrameX couldn't be reached. Please try again in a moment, or reach us using the details on this page.",
        );
      }
      busy = false;
      button.disabled = false;
      button.textContent = label;
    });
  }

  FrameX.contactPage = { init };
})((window.FrameX = window.FrameX || {}));
