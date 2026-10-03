/* ==========================================================================
   Contact page.
   There is NO backend yet, so the form never claims a message was sent.
   - valid + an email address configured  -> opens the visitor's email app (mailto)
   - valid + nothing configured           -> says plainly that it is not connected
   To go live: implement sendMessage() to POST to your form service / API.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, icon, escapeHtml: esc } = FrameX.dom;

  const RULES = {
    name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? "" : "Please enter a valid email address."),
    phone: (v) => (!v.trim() || /^[+\d][\d\s\-()]{6,}$/.test(v.trim()) ? "" : "Please enter a valid phone number, or leave it empty."),
    subject: (v) => (v.trim().length >= 3 ? "" : "Please add a subject."),
    message: (v) => (v.trim().length >= 10 ? "" : "Please write at least 10 characters.")
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

  /** Replace with a real request once a backend / form service exists. */
  async function sendMessage(data, contact) {
    if (contact && contact.email) {
      const body = `${data.message}\n\n— ${data.name}${data.phone ? " · " + data.phone : ""} · ${data.email}`;
      window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(body)}`;
      return "mailto";
    }
    return "not-connected";
  }

  async function init() {
    const form = $("#contact-form");
    if (!form) return;
    let contact = {};
    try { contact = (await FrameX.api.getSite()).contact || {}; } catch (e) { /* form still works */ }

    const info = $("#contact-info");
    const rows = [
      contact.email && `<li>${icon("mail")}<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>`,
      contact.phone && `<li>${icon("phone")}<a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ""))}">${esc(contact.phone)}</a></li>`,
      contact.whatsapp && `<li>${icon("phone")}<a href="https://wa.me/${esc(String(contact.whatsapp).replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(FrameX.contact.formatWhatsapp(contact.whatsapp))}</a></li>`
    ].filter(Boolean);
    info.innerHTML = rows.length
      ? `<ul class="info-list">${rows.join("")}</ul>`
      : `<p class="contact-info__empty">FrameX hasn't published a phone number or email address yet. They will be listed here as soon as they are available.</p>`;

    $$("input, textarea", form).forEach((field) => {
      field.addEventListener("blur", () => RULES[field.name] && setError(field, RULES[field.name](field.value)));
      field.addEventListener("input", () => field.closest(".form-field").dataset.invalid === "true" && setError(field, RULES[field.name](field.value)));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fields = $$("input, textarea", form).filter((f) => RULES[f.name]);
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
      const data = Object.fromEntries(fields.map((f) => [f.name, f.value]));
      const result = await sendMessage(data, contact);
      status(form, "info", result === "mailto"
        ? "Your email app should open with this message ready to send. Nothing has been sent yet."
        : "Your message couldn't be sent from this page. Please reach us on WhatsApp or by email using the details on this page.");
    });
  }

  FrameX.contactPage = { init };
})((window.FrameX = window.FrameX || {}));
