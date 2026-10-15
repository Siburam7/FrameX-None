/* ==========================================================================
   FrameX.analytics — visitor statistics, only with the visitor's permission.

   Two places can receive what happens on a page, and neither gets anything
   until the visitor has pressed "Allow analytics":
     1. FrameX's own backend (POST /api/analytics/events): pages, products,
        templates, searches. It feeds the admin dashboard's visitor figures.
     2. Google Analytics 4, when a Measurement ID is set (GA4_MEASUREMENT_ID
        in backend/.env, handed over by /api/config; or config.js here for a
        site without the backend). Google's script is not even loaded before
        the visitor says yes.
   Until then nothing is sent, nothing is stored on the device, and no visitor
   id exists. "No thanks" is remembered so the question is asked once. A
   browser that sends "Global Privacy Control" or "Do Not Track" is taken as a
   no without asking. The choice can be changed on the Privacy Notice page.

   What is NEVER sent, to either place: names, emails, phone numbers,
   addresses, passwords, payment details, photos, account ids. A page's
   address is sent without its query string (FrameX) or with only the few
   parameters that name a product or a template (Google); the part after "#"
   is never sent. Staff pages (admin, shop and artist dashboards) and the
   password-reset page are not measured at all.

   What counts as a sale is decided by the server from verified payments, not
   here: "purchase" goes to Google only, once per order, and only for an order
   the server reports as placed (and never for a test order).

     FrameX.analytics.track("view_item", { itemType: "product", itemId, itemName, category, value })
     FrameX.analytics.track("search", { query })
     FrameX.analytics.consent()            "granted" | "denied" | null (not asked yet)
     FrameX.analytics.setConsent(true|false)
     FrameX.analytics.openChoices()        open the cookie settings

   The question is asked as a cookie banner on the first visit: "Accept all",
   "Reject" or "Settings". Settings opens a panel with one switch per kind of
   cookie: Necessary (always on: logging in, the cart, checkout, saved designs,
   this choice) and Analytics (the counting described above). There are no
   advertising cookies. The banner is shown on every page except the staff
   pages, also when analytics is not in use on the site (the visitor's choice
   is then kept for when it is). "Cookie settings" in the footer and "Change
   my choice" on the Privacy Notice page open the panel again.
   ========================================================================== */
(function (FrameX) {
  const CONSENT_KEY = "framex.consent.v1";
  const VISITOR_KEY = "framex.visitor.v1";
  const VISIT_KEY = "framex.visit.v1";
  const SENT_KEY = "framex.purchases.v1";
  const VISIT_IDLE_MS = 30 * 60 * 1000;
  const GA4_ID = /^G-[A-Z0-9]{4,20}$/;
  // Staff tools, and a page whose address carries a one-time secret, are never measured.
  const PRIVATE_PAGES = ["admin", "shop-dashboard", "artist-dashboard", "reset-password"];
  // What FrameX's own backend keeps. (It counts "added to cart" and orders itself, from the cart and the orders.)
  const FIRST_PARTY = ["page_view", "view_item", "view_item_list", "view_template", "view_artwork", "view_artist", "view_shop", "search", "begin_checkout", "live_demo_opened"];
  // The only query parameters that stay in the page address given to Google: they name what is on the page.
  const URL_PARAMS = ["id", "slug", "template", "product", "category", "c", "mode", "view", "shop", "artist"];

  let page = "";
  let entry = { referrer: "", utm: { source: "", medium: "", campaign: "" } }; // how this page was reached, noted when it opened
  let settings = null; // { firstParty, ga4 } once the backend has been asked
  let inert = false; // nothing to do on this page (staff page, or analytics is not set up)
  let choice = null; // "granted" | "denied" | null
  let running = false;
  let visitorId = "";
  let visit = null; // { id, at }
  let landing = false; // the next page_view is the first of this visit
  let gaLoaded = false;
  let googleOff = false; // Google's tag is on the page but was told to stop
  let banner = null;
  let panel = null; // the cookie settings panel, while it is open
  let privatePage = false;
  let timer = 0;
  let beats = 0;
  const waiting = []; // what happened on this page before the visitor chose (sent only if they say yes)
  const queue = []; // FrameX events on their way to the backend

  /* ---------------------------------------------------------------- Storage (may be blocked: then nothing is remembered) */
  const store = {
    get(area, key) {
      try {
        return JSON.parse(area.getItem(key) || "null");
      } catch (e) {
        return null;
      }
    },
    set(area, key, value) {
      try {
        area.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* blocked */
      }
    },
    drop(area, key) {
      try {
        area.removeItem(key);
      } catch (e) {
        /* blocked */
      }
    },
  };
  // Even reading window.localStorage can throw in a browser that blocks storage: then there is simply none.
  const area = (name) => {
    try {
      return window[name];
    } catch (e) {
      return null;
    }
  };
  const local = () => area("localStorage");
  const session = () => area("sessionStorage");
  const newId = (prefix) => {
    const bytes = new Uint8Array(15);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return prefix + "_" + Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  };

  function readChoice() {
    const saved = store.get(local(), CONSENT_KEY);
    return saved && typeof saved.analytics === "boolean" ? (saved.analytics ? "granted" : "denied") : null;
  }
  /** The browser itself says "don't": taken as a no, without asking. */
  const browserSaysNo = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";

  /* ---------------------------------------------------------------- What is sent */

  const text = (value, max) => (typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim().slice(0, max) : "");
  /** Search words without anything that looks like an email address or a phone number (the server removes them again). */
  const scrub = (value) =>
    text(value, 200)
      .toLowerCase()
      .replace(/[^\s@]+@[^\s@]+/g, " ")
      .replace(/\+?\d[\d\s().-]{5,}\d/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  const rupees = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : null);

  /** This page's address for Google: no "#...", and only the parameters that name what is on the page. */
  function cleanUrl() {
    const from = new URLSearchParams(window.location.search);
    const keep = new URLSearchParams();
    URL_PARAMS.forEach((k) => from.get(k) && keep.set(k, text(from.get(k), 80)));
    const query = keep.toString();
    return window.location.origin + window.location.pathname + (query ? "?" + query : "");
  }
  /** Where the visitor came from: the other site's address without its path, or nothing for this site itself. */
  function outsideReferrer() {
    try {
      const r = new URL(document.referrer);
      return r.host === window.location.host ? "" : r.origin;
    } catch (e) {
      return "";
    }
  }

  function firstPartyEvent(name, p) {
    const event = { name, page, path: window.location.pathname };
    if (name === "page_view" && landing) {
      landing = false;
      event.landing = true;
      event.referrer = entry.referrer;
      event.utm = entry.utm;
    }
    if (p.itemType) Object.assign(event, { itemType: p.itemType, itemId: text(p.itemId, 80), itemName: text(p.itemName, 120) });
    if (p.category) event.category = text(p.category, 60);
    if (name === "search") event.query = scrub(p.query);
    if (rupees(p.value) !== null) event.value = rupees(p.value);
    return event;
  }

  /** The same happening in Google's vocabulary: [event name, parameters], or null when Google is not told. */
  function googleEvent(name, p) {
    const item = () => [{ item_id: text(p.itemId, 80), item_name: text(p.itemName, 100), ...(p.category ? { item_category: text(p.category, 60) } : {}), ...(p.quantity ? { quantity: Number(p.quantity) || 1 } : {}), ...(rupees(p.price) !== null ? { price: rupees(p.price) } : {}) }];
    const money = rupees(p.value) !== null ? { currency: "INR", value: rupees(p.value) } : {};
    switch (name) {
      case "page_view":
        // A tagged link's campaign is handed over by name; the tags themselves are not left in the address.
        return ["page_view", { page_location: cleanUrl(), page_title: document.title, page_referrer: entry.referrer, ...(entry.utm.source ? { campaign_source: entry.utm.source } : {}), ...(entry.utm.medium ? { campaign_medium: entry.utm.medium } : {}), ...(entry.utm.campaign ? { campaign_name: entry.utm.campaign } : {}) }];
      case "view_item":
        return ["view_item", { ...money, items: item() }];
      case "view_template":
      case "view_artwork":
        return ["view_item", { ...money, items: [{ ...item()[0], item_category: name === "view_template" ? "template" : "artwork" }] }];
      case "view_item_list":
        return ["view_item_list", { item_list_id: text(p.itemId, 80), item_list_name: text(p.itemName, 100) }];
      case "view_artist":
      case "view_shop":
        return ["select_content", { content_type: name === "view_artist" ? "artist" : "shop", content_id: text(p.itemId, 80) }];
      case "search":
        return scrub(p.query) ? ["search", { search_term: scrub(p.query) }] : null;
      case "add_to_cart":
        return ["add_to_cart", { ...money, items: item() }];
      case "begin_checkout":
        return ["begin_checkout", { ...money, ...(Array.isArray(p.items) ? { items: p.items } : {}) }];
      case "purchase":
        return ["purchase", { transaction_id: text(p.transactionId, 40), ...money, ...(rupees(p.tax) !== null ? { tax: rupees(p.tax) } : {}), ...(rupees(p.shipping) !== null ? { shipping: rupees(p.shipping) } : {}), ...(Array.isArray(p.items) ? { items: p.items } : {}) }];
      default:
        // FrameX's own happenings (the Live Demo): the name, and which product.
        return /^[a-z][a-z0-9_]{2,39}$/.test(name) ? [name, p.itemId ? { item_id: text(p.itemId, 80) } : {}] : null;
    }
  }

  /* ---------------------------------------------------------------- Sending */

  function post(events) {
    if (!settings.firstParty || !visit) return;
    const backend = FrameX.config.backend || {};
    try {
      fetch(backend.url + "/analytics/events", {
        method: "POST",
        keepalive: true, // still delivered when the page is being left
        credentials: backend.session === "bearer" ? "omit" : "include",
        headers: { "Content-Type": "application/json", "X-FrameX-Client": "web" },
        body: JSON.stringify({ consent: true, visitorId, sessionId: visit.id, events }),
      }).catch(() => {});
    } catch (e) {
      /* statistics are never worth an error on the page */
    }
  }
  function flush() {
    clearTimeout(timer);
    timer = 0;
    while (queue.length) post(queue.splice(0, 20));
  }

  function loadGoogle() {
    if (!settings.ga4) return;
    window["ga-disable-" + settings.ga4] = false;
    if (gaLoaded) {
      // Switched off earlier on this page ("No thanks"), and allowed again now.
      if (googleOff) window.gtag("consent", "update", { analytics_storage: "granted" });
      googleOff = false;
      return;
    }
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    // Statistics only: nothing for advertising, ever.
    window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("js", new Date());
    window.gtag("config", settings.ga4, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: cleanUrl(), page_referrer: entry.referrer });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(settings.ga4);
    script.dataset.analytics = "ga4";
    document.head.appendChild(script);
  }

  /** A purchase is told to Google once per order, whatever page shows the order again. */
  function firstTime(orderNumber) {
    const sent = store.get(local(), SENT_KEY) || [];
    if (sent.includes(orderNumber)) return false;
    store.set(local(), SENT_KEY, sent.concat(orderNumber).slice(-50));
    return true;
  }

  function dispatch(name, p) {
    if (name === "purchase" && (p.test || !text(p.transactionId, 40) || !firstTime(text(p.transactionId, 40)))) return;
    if (settings.firstParty && FIRST_PARTY.includes(name)) {
      queue.push(firstPartyEvent(name, p));
      if (!timer) timer = setTimeout(flush, 1200);
    }
    if (settings.ga4) {
      const g = googleEvent(name, p);
      if (g) {
        loadGoogle();
        window.gtag("event", g[0], g[1]);
      }
    }
  }

  /* ---------------------------------------------------------------- Starting and stopping */

  function begin() {
    if (running || inert || !settings) return;
    running = true;
    visitorId = store.get(local(), VISITOR_KEY);
    if (typeof visitorId !== "string" || !/^[A-Za-z0-9_-]{16,40}$/.test(visitorId)) {
      visitorId = newId("v");
      store.set(local(), VISITOR_KEY, visitorId);
    }
    const saved = store.get(session(), VISIT_KEY);
    const now = Date.now();
    if (saved && typeof saved.id === "string" && now - saved.at < VISIT_IDLE_MS) visit = { id: saved.id, at: now };
    else {
      visit = { id: newId("s"), at: now };
      landing = true;
    }
    store.set(session(), VISIT_KEY, visit);
    if (settings.ga4) loadGoogle();
    waiting.splice(0).forEach(([name, p]) => dispatch(name, p));
    // "Still here", once a minute while the page is in front: it keeps the dashboard's "on the site now" honest.
    const beat = setInterval(() => {
      if (!running) return clearInterval(beat);
      if (document.visibilityState !== "visible" || (beats += 1) > 30) return;
      store.set(session(), VISIT_KEY, (visit = { id: visit.id, at: Date.now() }));
      if (queue.length) flush();
      else post([]);
    }, 60_000);
  }

  function stop() {
    running = false;
    queue.length = 0;
    waiting.length = 0;
    clearTimeout(timer);
    timer = 0;
    visitorId = "";
    visit = null;
    store.drop(local(), VISITOR_KEY);
    store.drop(local(), SENT_KEY);
    store.drop(session(), VISIT_KEY);
    if (settings && settings.ga4) {
      window["ga-disable-" + settings.ga4] = true;
      if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
      googleOff = gaLoaded;
      // Google's own cookies of this site are removed too.
      document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0].trim();
        if (!/^_ga/.test(name)) return;
        const host = window.location.hostname;
        [host, "." + host, "." + host.split(".").slice(-2).join(".")].forEach((domain) => (document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`));
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
    }
  }

  function setConsent(yes) {
    choice = yes ? "granted" : "denied";
    store.set(local(), CONSENT_KEY, { analytics: Boolean(yes), at: new Date().toISOString() });
    hideBanner();
    if (yes) {
      // Allowed on a page that was opened while the answer was still "no": this page is the first one counted.
      if (!running && !waiting.some(([name]) => name === "page_view")) waiting.unshift(["page_view", {}]);
      begin();
    } else stop();
    paintStatus();
    document.dispatchEvent(new CustomEvent("framex:consent-change", { detail: { analytics: choice } }));
  }

  /* ---------------------------------------------------------------- The cookie banner and settings */

  /** Who counts the visits, in words, for the banner and the panel. */
  const counters = () => (settings && settings.ga4 ? (settings.firstParty ? "our own counter and Google Analytics" : "Google Analytics") : "our own counter");

  function showBanner() {
    if (banner || privatePage) return;
    banner = document.createElement("section");
    banner.className = "consent consent--cookies";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookies");
    banner.innerHTML = `<div class="consent__text"><strong>We use cookies</strong>
        <p>Necessary cookies keep you logged in and remember your cart, your designs and this choice. With your OK we
          also use analytics cookies to count visits and see which pages and products people like. No advertising
          cookies, and nothing that says who you are. <a href="privacy-notice.html#cookies">Cookie policy</a></p></div>
      <div class="consent__actions">
        <button class="btn btn--ghost btn--sm consent__settings" type="button" data-cookie-settings>Settings</button>
        <button class="btn btn--outline btn--sm" type="button" data-consent="no">Reject</button>
        <button class="btn btn--dark btn--sm" type="button" data-consent="yes">Accept all</button>
      </div>`;
    banner.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-consent]");
      if (btn) setConsent(btn.dataset.consent === "yes");
    });
    document.body.appendChild(banner);
  }
  function hideBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  /** The cookie settings: one short line and a switch per kind of cookie, the details behind "More about cookies", then Reject all / Save / Accept all. */
  function openSettings() {
    if (panel) return;
    const opener = document.activeElement;
    const on = choice === "granted";
    panel = document.createElement("div");
    panel.className = "cookie-prefs";
    panel.innerHTML = `<div class="cookie-prefs__backdrop" data-cookie-close></div>
      <div class="cookie-prefs__box" role="dialog" aria-modal="true" aria-labelledby="cookie-prefs-title">
        <div class="cookie-prefs__head">
          <h2 id="cookie-prefs-title">Cookie settings</h2>
          <button class="cookie-prefs__close" type="button" data-cookie-close aria-label="Close">${FrameX.dom.icon ? FrameX.dom.icon("close") : "×"}</button>
        </div>
        <div class="cookie-prefs__item">
          <div><strong>Necessary</strong><span>Login, cart and your saved designs</span></div>
          <span class="cookie-prefs__always">Always on</span>
        </div>
        <div class="cookie-prefs__item">
          <div><strong id="cookie-analytics-label">Analytics</strong><span>Count visits, without knowing who you are</span></div>
          <label class="cookie-switch"><input type="checkbox" role="switch" data-cookie-analytics aria-labelledby="cookie-analytics-label"${on ? " checked" : ""}><span class="cookie-switch__track" aria-hidden="true"></span></label>
        </div>
        <div class="cookie-prefs__item">
          <div><strong>Advertising</strong><span>FrameX doesn't use them</span></div>
          <span class="cookie-prefs__always cookie-prefs__always--off">Not used</span>
        </div>
        <button class="cookie-prefs__more-btn" type="button" data-cookie-more aria-expanded="false" aria-controls="cookie-prefs-more">More about cookies ${FrameX.dom.icon ? FrameX.dom.icon("chev-down") : ""}</button>
        <div class="cookie-prefs__more" id="cookie-prefs-more" hidden>
          <p>A cookie is a small piece of text a website keeps in your browser, so it can remember you on the next page or
            the next visit.</p>
          <p><strong>Necessary</strong> cookies keep you logged in, remember your cart, checkout, wishlist and saved
            designs, and remember this choice. The site can't work without them, so they are always on.</p>
          <p><strong>Analytics</strong> cookies count visits and which pages, products and templates people look at, with
            ${counters()}. They never hold your name, email, phone, address or payment details.${inert && settings ? " Analytics is not in use on this site right now: your choice is kept for when it is." : ""}</p>
          <p><strong>Advertising</strong> cookies are not used: FrameX doesn't track you for ads.</p>
          <p>You can change your choice at any time from "Cookie settings" at the bottom of every page.
            <a href="privacy-notice.html#cookies">Read the full cookie policy</a></p>
        </div>
        <div class="cookie-prefs__actions">
          <button class="btn btn--outline btn--sm" type="button" data-cookie-save="no">Reject all</button>
          <button class="btn btn--outline btn--sm" type="button" data-cookie-save="mine">Save</button>
          <button class="btn btn--dark btn--sm" type="button" data-cookie-save="yes">Accept all</button>
        </div>
      </div>`;
    const close = () => {
      if (!panel) return;
      panel.remove();
      panel = null;
      document.removeEventListener("keydown", keys);
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    };
    const keys = (e) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab") return;
      // Keep the keyboard inside the panel
      const items = [...panel.querySelectorAll("button, input, a[href]")];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    panel.addEventListener("click", (e) => {
      if (e.target.closest("[data-cookie-close]")) return close();
      const more = e.target.closest("[data-cookie-more]");
      if (more) {
        const open = more.getAttribute("aria-expanded") !== "true";
        more.setAttribute("aria-expanded", String(open));
        panel.querySelector("#cookie-prefs-more").hidden = !open;
        return;
      }
      const save = e.target.closest("[data-cookie-save]");
      if (!save) return;
      const how = save.dataset.cookieSave;
      setConsent(how === "yes" ? true : how === "no" ? false : panel.querySelector("[data-cookie-analytics]").checked);
      close();
      if (FrameX.toast && FrameX.toast.show) FrameX.toast.show("Your cookie choices are saved.");
    });
    document.addEventListener("keydown", keys);
    document.body.appendChild(panel);
    panel.querySelector("[data-cookie-analytics]").focus();
  }

  /** The Privacy Notice page shows the current choice and a button to change it. */
  function paintStatus() {
    document.querySelectorAll("[data-analytics-status]").forEach((el) => {
      el.textContent = inert
        ? "Analytics cookies are not in use on this site at the moment."
        : choice === "granted"
          ? "Analytics cookies are ON for this browser: you allowed them."
          : choice === "denied"
            ? "Analytics cookies are OFF for this browser: you said no."
            : browserSaysNo()
              ? "Analytics cookies are OFF: your browser asks sites not to track, and we follow that."
              : "Analytics cookies are OFF: you have not chosen yet.";
    });
  }

  /* ---------------------------------------------------------------- Public */

  function track(name, params = {}) {
    if (inert || typeof name !== "string") return;
    const p = params && typeof params === "object" ? params : {};
    if (running) return dispatch(name, p);
    // Not decided yet (or the settings are still on their way): kept for this page only, and sent only after a yes.
    if (choice !== "denied" && !(choice === null && browserSaysNo()) && waiting.length < 40) waiting.push([name, p]);
  }

  async function start() {
    page = (document.body && document.body.dataset.page) || "";
    const q = new URLSearchParams(window.location.search);
    entry = { referrer: outsideReferrer(), utm: { source: text(q.get("utm_source"), 60), medium: text(q.get("utm_medium"), 60), campaign: text(q.get("utm_campaign"), 60) } };
    choice = readChoice();
    if (PRIVATE_PAGES.includes(page)) {
      inert = true;
      privatePage = true;
      return;
    }
    // The cookie banner, at once (not after the server's settings): the first visit, unless the browser already says no
    if (choice === null && !browserSaysNo()) showBanner();
    track("page_view");
    const server = FrameX.http && FrameX.http.serverConfig ? await FrameX.http.serverConfig() : null;
    const own = (FrameX.config && FrameX.config.analytics) || {};
    const fromServer = (server && server.analytics) || {};
    settings = { firstParty: Boolean(fromServer.enabled), ga4: GA4_ID.test(fromServer.ga4MeasurementId || "") ? fromServer.ga4MeasurementId : GA4_ID.test(own.ga4MeasurementId || "") ? own.ga4MeasurementId : "" };
    if (!settings.firstParty && !settings.ga4) {
      inert = true;
      waiting.length = 0;
      return paintStatus();
    }
    if (choice === "granted") begin();
    else if (choice !== null || browserSaysNo()) waiting.length = 0;
    paintStatus();
  }

  // Leaving the page (or putting it in the background): what is waiting goes out now.
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && running && flush());
  window.addEventListener("pagehide", () => running && flush());

  // The cart says an item was added: told to Google (FrameX's own count is made by the cart on the server).
  document.addEventListener("framex:cart-change", (e) => {
    if (!e.detail || e.detail.type !== "add" || !FrameX.cart) return;
    const item = FrameX.cart.items().find((i) => i.id === e.detail.itemId);
    if (!item) return;
    track("add_to_cart", { itemType: item.templateId ? "template" : "product", itemId: item.productId || item.templateId || "design", itemName: item.name, quantity: 1, price: item.unitPrice, value: item.unitPrice });
  });
  // The Live Demo announces what happens in it (assets/js/services/live-demo.js): no pictures, no positions.
  document.addEventListener("framex:analytics", (e) => {
    const d = e.detail || {};
    if (typeof d.event === "string" && /^live_demo_/.test(d.event)) track(d.event, d.productId ? { itemType: "product", itemId: d.productId } : {});
  });
  document.addEventListener("click", (e) => {
    // "Cookie settings" (footer, banner) and "Change my choice" (Privacy Notice) open the settings
    if (e.target.closest && e.target.closest("[data-cookie-settings], [data-analytics-choice]")) openSettings();
  });

  FrameX.analytics = {
    track,
    consent: () => choice,
    setConsent,
    openChoices: openSettings,
    // For the tests and for anyone curious in the console: what this page is set up to do.
    inspect: () => ({ page, inert, choice, running, settings, waiting: waiting.length, queued: queue.length, googleLoaded: gaLoaded, hasVisitorId: Boolean(visitorId), browserSaysNo: browserSaysNo() }),
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})((window.FrameX = window.FrameX || {}));
