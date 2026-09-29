/* Shared backdrop + scroll lock + focus trap for the drawer and modal. */
(function (FrameX) {
  const { $, focusable } = FrameX.dom;
  let openCount = 0;
  let dismissHandlers = [];

  function show(onDismiss) {
    openCount += 1;
    dismissHandlers.push(onDismiss);
    $("#backdrop").classList.add("is-visible");
    document.body.classList.add("is-locked");
  }

  function hide(onDismiss) {
    openCount = Math.max(0, openCount - 1);
    dismissHandlers = dismissHandlers.filter((fn) => fn !== onDismiss);
    if (openCount === 0) {
      $("#backdrop").classList.remove("is-visible");
      document.body.classList.remove("is-locked");
    }
  }

  /** Keep Tab focus inside `container`. Call from a keydown handler. */
  function trapFocus(container, event) {
    if (event.key !== "Tab") return;
    const items = focusable(container);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function init() {
    $("#backdrop").addEventListener("click", () => {
      const top = dismissHandlers[dismissHandlers.length - 1];
      if (top) top();
    });
  }

  FrameX.overlay = { init, show, hide, trapFocus };
})((window.FrameX = window.FrameX || {}));
