/* ==========================================================================
   The FrameX animation after logging in.

   The login and sign-up pages leave a note in sessionStorage when someone has
   just logged in (ui/auth-pages.js) and open the next page straight away. This
   file is loaded in the <head> of every page, WITHOUT "defer", so it runs
   before anything is drawn: when the note is there (and fresh), the page is
   covered in white and the animation plays once in the middle, small, for
   about 3 seconds, while the page loads its pictures and data underneath.
   Then the cover fades away and the page is simply there.

   Size: the film is 1920 x 1080 and its "FRAMEX" lettering is 686 px wide; the
   header logo's lettering is 912 px of its 1600 px file. The film is shown at
   the width that makes the two letterings the same size on this screen. The
   login page measured its own header logo and wrote the width in the note.

   It never holds anyone up: no note, a film that can't be loaded or played,
   or a device set to "reduce motion" -> nothing happens, the page just opens.
   The note is used once: reloading the page does not play the film again.
   ========================================================================== */
(function () {
  var KEY = "framex.welcome";
  var FILM = "assets/video/FrameX-animation-2-landscape.mp4";
  var FILM_PER_LOGO = 912 / 1600 / (686 / 1920);

  var note = null;
  try {
    note = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    window.sessionStorage.removeItem(KEY);
  } catch (e) {
    return;
  }
  // Older than 15 seconds = left behind by a page that never opened; not a login that just happened.
  if (!note || !(Date.now() - Number(note.at) < 15000)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var root = document.documentElement;
  root.classList.add("fx-welcoming"); // base.css: a white cover, before the page draws anything

  // The header logo's width: as measured on the login page, otherwise the sizes in chrome.css / mobile.css.
  var w = window.innerWidth;
  var logo = Number(note.logo);
  if (!(logo > 60 && logo < 400)) logo = w >= 1180 ? 200 : w >= 1100 ? 172 : w >= 640 ? 132 : w >= 420 ? 158 : 140;

  var box = document.createElement("div");
  box.className = "fx-welcome";
  box.setAttribute("role", "status");
  var film = document.createElement("video");
  film.muted = true;
  film.playsInline = true;
  film.setAttribute("muted", "");
  film.setAttribute("playsinline", "");
  film.setAttribute("preload", "auto");
  film.setAttribute("disablepictureinpicture", "");
  film.setAttribute("aria-hidden", "true");
  film.width = 1920;
  film.height = 1080;
  film.style.width = Math.round(logo * FILM_PER_LOGO) + "px";
  var words = document.createElement("span");
  words.className = "visually-hidden";
  words.textContent = "You are logged in. Opening FrameX…";
  box.appendChild(film);
  box.appendChild(words);

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    root.classList.remove("fx-welcoming");
    box.classList.add("is-leaving");
    window.setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 300);
  }

  // Whichever comes first: the film ends, 3 seconds of it have played, or it never starts.
  var giveUp = window.setTimeout(finish, 2000);
  film.addEventListener(
    "playing",
    function () {
      window.clearTimeout(giveUp);
      box.classList.add("is-playing");
      window.setTimeout(finish, 3000);
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
