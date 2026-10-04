/* ==========================================================================
   Form helpers shared by the account, partner and admin pages (FrameX.forms).
   Markup follows the existing contact form: .form-field[data-invalid] with a
   .form-field__error, and a .form-status box for the overall result.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;

  /** One labelled field. opts: type, autocomplete, required, hint, value, placeholder, rows (textarea), toggle (show/hide password) */
  function field(name, label, opts = {}) {
    const id = `${opts.prefix || "f"}-${name}`;
    const attrs = [
      `id="${id}"`,
      `name="${name}"`,
      opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : "",
      opts.required ? "required" : "",
      opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : "",
      opts.maxlength ? `maxlength="${opts.maxlength}"` : "",
      opts.inputmode ? `inputmode="${opts.inputmode}"` : "",
      opts.step ? `step="${opts.step}"` : "",
      `aria-describedby="${id}-err"`,
    ]
      .filter(Boolean)
      .join(" ");
    const control = opts.rows
      ? `<textarea ${attrs} rows="${opts.rows}">${esc(opts.value || "")}</textarea>`
      : `<input ${attrs} type="${opts.type || "text"}" value="${esc(opts.value ?? "")}">`;
    return `<div class="form-field${opts.toggle ? " form-field--password" : ""}" data-invalid="false">
      <label for="${id}">${esc(label)}${opts.required ? "" : opts.optional === false ? "" : ` <span class="hint">(optional)</span>`}</label>
      ${opts.toggle ? `<div class="password-wrap">${control}<button class="password-toggle" type="button" data-toggle-password aria-label="Show password" aria-pressed="false">${icon("eye")}</button></div>` : control}
      ${opts.hint ? `<p class="form-field__hint">${opts.hint}</p>` : ""}
      <p class="form-field__error" id="${id}-err">${icon("alert")}<span></span></p>
    </div>`;
  }

  function setError(input, message) {
    const wrap = input.closest(".form-field");
    if (!wrap) return;
    const slot = $(".form-field__error span", wrap);
    if (!slot) return; // checkbox groups have no message slot
    wrap.dataset.invalid = message ? "true" : "false";
    slot.textContent = message || "";
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  const clearErrors = (form) => $$("input, textarea, select", form).forEach((el) => setError(el, ""));

  /** Show the API's per-field messages; returns the first invalid input (to focus). */
  function applyErrors(form, fields, aliases = {}) {
    let first = null;
    Object.entries(fields || {}).forEach(([name, message]) => {
      const input = form.elements[aliases[name] || name];
      if (!input || !input.closest) return;
      setError(input, message);
      first = first || input;
    });
    if (first) first.focus();
    return first;
  }

  function status(box, kind, html) {
    if (!kind) {
      box.className = "form-status";
      box.innerHTML = "";
      return;
    }
    box.className = `form-status form-status--${kind} is-visible`;
    box.innerHTML = `${icon(kind === "error" ? "alert" : kind === "success" ? "check" : "alert")}<span>${html}</span>`;
  }

  function busy(button, on, label) {
    if (on) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.textContent = label || "Please wait…";
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  const values = (form) => Object.fromEntries(new FormData(form).entries());

  /**
   * Standard submit: clears errors, runs `send(values)`, shows field errors or
   * a friendly message on failure. Returns nothing; `onSuccess(result)` runs on success.
   */
  function handle(form, { send, onSuccess, statusBox, busyLabel, aliases }) {
    const box = statusBox || $(".form-status", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      clearErrors(form);
      status(box, null);
      busy(button, true, busyLabel);
      try {
        const result = await send(values(form));
        busy(button, false);
        onSuccess(result);
      } catch (error) {
        busy(button, false);
        const focused = error.fields ? applyErrors(form, error.fields, aliases) : null;
        if (!focused || !error.fields) status(box, "error", esc(error.message || "Something went wrong. Please try again."));
        else status(box, "error", esc(error.message));
        if (!(error instanceof FrameX.http.ApiError)) console.error(error);
      }
    });
    // Show / hide password buttons
    form.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-toggle-password]");
      if (!btn) return;
      const input = btn.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
    form.addEventListener("input", (event) => event.target.closest(".form-field") && setError(event.target, ""));
  }

  FrameX.forms = { field, setError, clearErrors, applyErrors, status, busy, values, handle };
})((window.FrameX = window.FrameX || {}));
