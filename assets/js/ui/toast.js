/* Toast notifications. Polite live region, auto-dismiss, optional action. */
(function (FrameX) {
  const { $ } = FrameX.dom;
  const DURATION = 3400;

  function show(message, { action = null, duration = DURATION } = {}) {
    const region = $("#toast-region");
    if (!region) return;
    // Don't stack identical messages
    if ([...region.children].some((t) => t.dataset.message === message)) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.message = message;
    const text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(text);

    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toast__action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.onClick();
        dismiss(toast);
      });
      toast.appendChild(button);
    }

    region.appendChild(toast);
    setTimeout(() => dismiss(toast), duration);
  }

  function dismiss(toast) {
    if (!toast.isConnected || toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), {
      once: true,
    });
    setTimeout(() => toast.remove(), 400); // safety net when animations are disabled
  }

  /** For UI that exists but is not connected to a backend yet. */
  const soon = (feature) => show(`${feature} is coming soon.`);

  FrameX.toast = { show, soon };
})((window.FrameX = window.FrameX || {}));
