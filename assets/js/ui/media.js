/* ==========================================================================
   Video sections: "Magnetic hanging" (switchable videos with progress) and
   the full-width museum-quality video. Videos load and play only while on
   screen, are always muted, and never autoplay for reduced-motion users.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, prefersReducedMotion } = FrameX.dom;

  function whenVisible(el, onEnter, onLeave) {
    if (!("IntersectionObserver" in window)) return onEnter();
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? onEnter() : onLeave()));
    }, { threshold: 0.35 }).observe(el);
  }

  function initHanging() {
    const video = $("#hanging-video");
    const items = $$(".hanging__item");
    if (!video || !items.length) return;

    let index = 0;
    let loaded = false;
    const reduced = prefersReducedMotion();
    video.muted = true;
    video.poster = items[0].dataset.poster;
    if (reduced) video.controls = true;

    const setProgress = (i, value) => items[i].style.setProperty("--progress", value);

    function select(i, { play = true } = {}) {
      index = i;
      loaded = true;
      items.forEach((item, k) => {
        item.setAttribute("aria-current", String(k === i));
        setProgress(k, 0);
      });
      video.poster = items[i].dataset.poster;
      video.src = items[i].dataset.video;
      if (play) video.play().catch(() => {});
    }

    video.addEventListener("timeupdate", () => {
      if (video.duration) setProgress(index, video.currentTime / video.duration);
    });
    video.addEventListener("ended", () => select((index + 1) % items.length));
    items.forEach((item, i) => item.addEventListener("click", () => select(i)));
    items[0].setAttribute("aria-current", "true");

    whenVisible(
      video,
      () => {
        if (reduced) return;
        loaded ? video.play().catch(() => {}) : select(0);
      },
      () => video.pause()
    );
  }

  function initMuseum() {
    const video = $("#museum-video");
    if (!video) return;
    video.muted = true;
    if (prefersReducedMotion()) return; // poster only
    let loaded = false;
    whenVisible(
      video,
      () => {
        if (!loaded) {
          video.src = video.dataset.src;
          loaded = true;
        }
        video.play().catch(() => {});
      },
      () => video.pause()
    );
  }

  function init() {
    initHanging();
    initMuseum();
  }

  FrameX.media = { init };
})((window.FrameX = window.FrameX || {}));
