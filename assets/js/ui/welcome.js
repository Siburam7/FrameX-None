/* ==========================================================================
   The FrameX logo animation while a page opens.

   This file is loaded in the <head> of every page, WITHOUT "defer", so it runs
   before anything is drawn. Every time a page is opened or reloaded, the page
   is covered in white and the logo part of the FrameX film plays once in the
   middle, small, for about one second, while the page loads its pictures and
   data underneath. Then the cover fades away and the page is simply there.

   Which part: the film (3.3 s) first draws the logo mark (the black tile, the
   "F", the orange dot: finished at 1.6 s), and from 1.9 s shrinks it and writes
   "FRAMEX". Only the first part is shown: it is played 1.7 times faster and
   stopped at 1.72 s, before the lettering begins. That takes one second.

   Size: the film is 1920 x 1080 and its "FRAMEX" lettering is 686 px wide; the
   header logo's lettering is 912 px of its 1600 px file. The film is shown at
   the width at which the two letterings would be the same size on this screen
   (so the logo mark is about 76 px on a laptop and 53 px on a phone). The
   header logo's width is remembered from the last page that was opened on this
   screen; before that, the sizes written in chrome.css / mobile.css are used.

   It never holds anyone up: a film that can't be loaded or played, or a device
   set to "reduce motion" -> no cover, the page just opens.
   ========================================================================== */
(function () {
  var FILM = "assets/video/FrameX-animation-2-landscape.mp4";
  var FILM_PER_LOGO = 912 / 1600 / (686 / 1920);
  var STOP_AT = 1.72; // seconds of film: the logo mark is complete, the lettering has not begun
  var SPEED = 1.7;
  var LOGO_KEY = "framex.logoWidth";

  // The header logo's real width, noted once this page has drawn it, for the next page that opens.
  function rememberLogo() {
    try {
      var img = document.querySelector(".site-header .brand img");
      var width = img ? Math.round(img.getBoundingClientRect().width) : 0;
      if (width > 60 && width < 400) window.localStorage.setItem(LOGO_KEY, JSON.stringify({ screen: window.innerWidth, logo: width }));
    } catch (e) {
      /* storage is blocked: the sizes below are used */
    }
  }
  if (document.readyState === "complete") window.setTimeout(rememberLogo, 0);
  else window.addEventListener("load", function () { window.setTimeout(rememberLogo, 300); });

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var root = document.documentElement;
  root.classList.add("fx-welcoming"); // base.css: a white cover, before the page draws anything

  var w = window.innerWidth;
  var logo = 0;
  try {
    var noted = JSON.parse(window.localStorage.getItem(LOGO_KEY) || "null");
    if (noted && noted.screen === w) logo = Number(noted.logo);
  } catch (e) {
    /* use the sizes below */
  }
  if (!(logo > 60 && logo < 400)) logo = w >= 1180 ? 200 : w >= 1100 ? 172 : w >= 640 ? 132 : w >= 420 ? 158 : 140;

  var box = document.createElement("div");
  box.className = "fx-welcome";
  box.setAttribute("aria-hidden", "true");
  var film = document.createElement("video");
  film.muted = true;
  film.playsInline = true;
  film.defaultPlaybackRate = SPEED;
  film.playbackRate = SPEED;
  film.setAttribute("muted", "");
  film.setAttribute("playsinline", "");
  film.setAttribute("preload", "auto");
  film.setAttribute("disablepictureinpicture", "");
  film.width = 1920;
  film.height = 1080;
  film.style.width = Math.round(logo * FILM_PER_LOGO) + "px";
  box.appendChild(film);

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    try {
      film.pause();
    } catch (e) {
      /* nothing to stop */
    }
    root.classList.remove("fx-welcoming");
    box.classList.add("is-leaving");
    window.setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 260);
  }

  // Whichever comes first: the logo mark is complete, a little over a second has passed, or the film never starts.
  var giveUp = window.setTimeout(finish, 900);
  function watch() {
    if (done) return;
    if (film.currentTime >= STOP_AT) return finish();
    window.requestAnimationFrame(watch);
  }
  film.addEventListener(
    "playing",
    function () {
      window.clearTimeout(giveUp);
      film.playbackRate = SPEED;
      box.classList.add("is-playing");
      window.setTimeout(finish, (STOP_AT / SPEED) * 1000 + 250); // also when the tab is in the background
      window.requestAnimationFrame(watch);
    },
    { once: true },
  );
  film.addEventListener("ended", finish);
  film.addEventListener("error", finish);
  film.src = FILM;

  function show() {
    document.body.appendChild(box);
    var started = film.play();
    if (started && started.catch) started.catch(finish);
  }
  if (document.body) show();
  else {
    var waiting = new MutationObserver(function () {
      if (!document.body) return;
      waiting.disconnect();
      show();
    });
    waiting.observe(root, { childList: true });
  }
})();
