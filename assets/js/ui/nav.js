/* Header behaviour: scrolled state, mobile menu, active-section highlight. */
(function (FrameX) {
  const { $, $$ } = FrameX.dom;
  const DESKTOP_QUERY = "(min-width: 1100px)";

  function init() {
    const header = $("[data-site-header]");
    const toggle = $("#nav-toggle");
    const panel = $("#primary-nav");
    if (!header || !toggle || !panel) return;

    // Scrolled state (rAF-throttled, passive) ---------------------------------
    let ticking = false;
    const update = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
      // The footer pushes the header up and out of view instead of sliding under it (owner, 2026-10-28).
      // `translate`, not `transform`, so the header's entry animation is left alone; never while the menu is open,
      // as a moved header would carry the fixed menu panel with it.
      const footer = $(".site-footer");
      const h = header.offsetHeight;
      const push = footer && !header.classList.contains("is-menu-open")
        ? Math.min(Math.max(h - footer.getBoundingClientRect().top, 0), h + 32)
        : 0;
      header.style.translate = push ? `0 ${-push}px` : "";
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    window.addEventListener("resize", update);
    update();

    // Mobile menu -----------------------------------------------------------------
    const setOpen = (open) => {
      panel.classList.toggle("is-open", open);
      header.classList.toggle("is-menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.classList.toggle("is-locked", open);
      update();
    };

    toggle.addEventListener("click", () =>
      setOpen(toggle.getAttribute("aria-expanded") !== "true"),
    );
    panel.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia(DESKTOP_QUERY).addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });

    // Search that grows (owner's experiment, 2026-11-01) ---------------------------
    // The round search button grows into a search box while everything in the header but the logo fades out.
    // Laptops (a mouse, 1100px+): on hover, about 28% of the bar wide, from its own middle (kept inside the buttons'
    // side); it closes when the mouse leaves unless the visitor is in it. Phones and tablets: on a tap, across the
    // room between the logo and the bar's edge, with the cursor in it; it stays until its X (on laptops too).
    // Opened and left empty for IDLE_MS, it closes by itself.
    // As the visitor types, the matches show in a box under it (the backend's search: products, artworks, artists,
    // templates, shops), with a link to the full search page; without the backend, the search page opens instead.
    const box = $("[data-hdr-search]", header);
    const form = box && $(".hdr-search__form", box);
    const input = form && $(".hdr-search__input", form);
    if (box && form && input) {
      const IDLE_MS = 10000;
      const laptop = window.matchMedia(`${DESKTOP_QUERY} and (hover: hover)`);
      const bar = $(".site-header__bar", header);
      const brand = $(".brand", header);
      const actions = $(".site-header__actions", header);
      const results = $(".hdr-results", box);
      const http = FrameX.http;
      const live = Boolean(results && http && http.enabled());
      let closing = 0;
      let idle = 0;
      const place = () => {
        const own = box.getBoundingClientRect();
        const end = actions.getBoundingClientRect().right;
        let width;
        let left;
        if (laptop.matches) {
          width = Math.round(Math.min(460, Math.max(300, bar.clientWidth * 0.28)));
          left = Math.min(own.left + own.width / 2 - width / 2, end - width);
        } else {
          width = Math.round(Math.min(560, end - (brand.getBoundingClientRect().right + 12)));
          left = end - width;
        }
        form.style.setProperty("--hs-w", width + "px");
        form.style.setProperty("--hs-x", Math.round(left - own.left) + "px");
        // the results box on a laptop: under the search box, their right edges in line, at least 420px wide
        const wide = Math.min(Math.max(width, 420), bar.clientWidth);
        box.style.setProperty("--hr-w", wide + "px");
        box.style.setProperty("--hr-x", Math.round(left + width - wide - own.left) + "px");
        // a narrow box (phones) gets a short hint that fits
        if (!input.dataset.hint) input.dataset.hint = input.placeholder;
        input.placeholder = width < 300 ? "Search FrameX" : input.dataset.hint;
      };
      const open = () => {
        clearTimeout(closing);
        if (header.classList.contains("is-searching")) return;
        if (panel.classList.contains("is-open")) setOpen(false);
        place();
        header.classList.add("is-searching");
        wait();
      };
      // a laptop's soft close (mouse gone, focus not in the box) …
      const close = () => {
        clearTimeout(closing);
        if (box.contains(document.activeElement)) return;
        clearTimeout(idle);
        header.classList.remove("is-searching");
        if (results) results.hidden = true;
      };
      // … and the X / Escape / nothing typed for IDLE_MS, everywhere
      const shut = () => {
        clearTimeout(closing);
        clearTimeout(idle);
        input.value = "";
        header.classList.remove("is-searching");
        if (results) {
          results.hidden = true;
          results.innerHTML = "";
        }
        if (box.contains(document.activeElement)) document.activeElement.blur();
      };
      const wait = () => {
        clearTimeout(idle);
        idle = setTimeout(() => !input.value.trim() && header.classList.contains("is-searching") && shut(), IDLE_MS);
      };

      /* ---- the results box ---- */
      const GROUPS = [["products", "Products"], ["artworks", "Artworks"], ["artists", "Artists"], ["templates", "Templates"], ["shops", "Shops"]];
      const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
      const esc = FrameX.dom.escapeHtml;
      const show = (html) => {
        results.innerHTML = html;
        results.hidden = !html;
      };
      const row = (kind, i) => {
        const meta =
          kind === "products" ? [i.shopName, i.inStock === false ? "Out of stock" : ""].filter(Boolean).join(" · ")
          : kind === "artworks" ? `by ${i.artistName} · ${rupees(i.price)}`
          : kind === "artists" ? [i.username ? "@" + i.username : "", i.city].filter(Boolean).join(" · ")
          : kind === "shops" ? i.city
          : "Design template";
        const pic = i.image ? `<img src="${esc(http.asset(i.image))}" alt="" loading="lazy" decoding="async">` : `<span aria-hidden="true">${esc(String(i.name).slice(0, 1).toUpperCase())}</span>`;
        return `<a class="hdr-results__row" href="${esc(i.url)}">${pic}<span><strong>${esc(i.name)}</strong><small>${esc(meta || "")}</small></span></a>`;
      };
      let asked = 0;
      let counted = "";
      let countTimer = 0;
      // for the visitor statistics: the words someone searched for, once they stop typing (as on the search page)
      const count = (q) => {
        clearTimeout(countTimer);
        countTimer = setTimeout(() => {
          if (q === counted || !FrameX.analytics) return;
          counted = q;
          FrameX.analytics.track("search", { query: q });
        }, 1500);
      };
      async function find() {
        const q = input.value.trim();
        const mine = (asked += 1);
        if (!q) return show("");
        if (q.length < 2) return show(`<p class="hdr-results__note">Type at least two letters</p>`);
        if (results.hidden) show(`<p class="hdr-results__note">Searching…</p>`);
        try {
          const r = await http.get("/search", { q, limit: 4 });
          if (mine !== asked || !header.classList.contains("is-searching")) return; // an older answer, or closed
          count(q);
          const groups = GROUPS.filter(([kind]) => r.results[kind] && r.results[kind].total);
          const all = `<a class="hdr-results__all" href="search.html?q=${encodeURIComponent(q)}">See all results for “${esc(q)}”</a>`;
          show(
            groups.length
              ? groups
                  .map(([kind, label]) => `<div class="hdr-results__group"><p class="hdr-results__label">${label} <span>(${r.results[kind].total})</span></p>${r.results[kind].items.map((i) => row(kind, i)).join("")}</div>`)
                  .join("") + all
              : `<p class="hdr-results__note">Nothing matches “${esc(q)}”. Try a shorter word.</p>`,
          );
        } catch (error) {
          if (mine === asked) show(`<p class="hdr-results__note">Search couldn't be loaded. Please try again.</p>`);
        }
      }
      const findSoon = FrameX.dom.debounce(find, 250);

      box.addEventListener("mouseenter", () => laptop.matches && open());
      // (closed by itself while the mouse rested on it: moving the mouse opens it again)
      box.addEventListener("mousemove", () => laptop.matches && !header.classList.contains("is-searching") && open());
      box.addEventListener("mouseleave", () => laptop.matches && (closing = setTimeout(close, 200)));
      input.addEventListener("focus", open);
      // focus leaving the box (a click elsewhere) closes it on a laptop; moving into the results doesn't
      box.addEventListener("focusout", (event) => laptop.matches && !box.contains(event.relatedTarget) && !box.matches(":hover") && close());
      input.addEventListener("input", () => {
        wait();
        if (live) findSoon();
      });
      box.addEventListener("keydown", (event) => {
        if (event.key === "Escape") return shut();
        if (!live || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
        // the arrow keys move through the results
        const links = $$("a", results);
        if (!links.length) return;
        const at = links.indexOf(document.activeElement);
        const next = event.key === "ArrowDown" ? Math.min(at + 1, links.length - 1) : at - 1;
        event.preventDefault();
        (next < 0 ? input : links[next]).focus();
      });
      $(".hdr-search__close", form).addEventListener("click", shut);
      // The search button / Enter: nothing typed = the box opens with the cursor in it (a tap on a phone); words =
      // the results show under the box (the search page only without the backend). On a phone the keyboard closes
      // so the results can be seen.
      form.addEventListener("submit", (event) => {
        if (input.value.trim() && !live) return;
        event.preventDefault();
        if (!input.value.trim()) {
          open();
          input.focus();
          return;
        }
        find();
        if (!laptop.matches) input.blur();
      });
      laptop.addEventListener("change", () => shut());
      window.addEventListener("resize", () => header.classList.contains("is-searching") && place());
    }
  }

  FrameX.nav = { init };
})((window.FrameX = window.FrameX || {}));
