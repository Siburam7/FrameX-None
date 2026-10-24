/* ==========================================================================
   FrameX Care chat (owner, 2026-10-23 / 10-24): on every customer page.

   1. Quick answers first, without AI: eight common questions answered on the
      spot from FrameX's own information — the customer's real orders, the live
      delivery / gift-wrap / COD amounts (/api/config), the real stock (search).
   2. "Connect with FrameX Care": inside the team's hours (10am–8pm) and with
      someone Available, the customer waits up to 2 minutes ("Connecting…") until
      a care person accepts, then sees "Live · You're chatting with <first name>"
      and both sides see each other's messages at once (a live connection,
      FrameX.http.stream). Nobody free, or outside the hours: they leave a
      message instead, answered here and by email (the help chat from 2026-10-23).
   3. The care person or the customer ends it; the customer can rate it.

   Visitors who aren't logged in get the quick answers too; talking to a person
   needs an account (so FrameX can answer by email and see their orders).
   Not on the admin, care and seller dashboards; not for shop, artist, care or
   admin accounts. ?chat=1 in the address opens it (the reply email links
   there). Server side: backend/src/routes/support.js.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const NOT_HERE = ["admin", "shop-dashboard", "artist-dashboard", "login", "signup", "forgot-password", "reset-password"];
  const QUESTIONS = [
    ["order", "package", "Where is my order?"],
    ["delivery", "truck", "Delivery time & charges"],
    ["sizes", "ruler", "Sizes & prices"],
    ["stock", "check", "Is it in stock?"],
    ["photo", "image", "Photo & print quality"],
    ["payment", "wallet", "Payment & COD"],
    ["cancel", "close", "Cancel or return"],
    ["gift", "gift", "Gift wrap"],
  ];
  const TOPIC_OF = { order: "order", photo: "photo", sizes: "advice", stock: "advice", cancel: "order" };
  const ORDER_STATUS = { PENDING_PAYMENT: "Waiting for payment", PLACED: "Order placed", CONFIRMED: "Confirmed", PROCESSING: "Being made", SHIPPED: "Shipped", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", RETURNED: "Returned" };
  const ORDER_NEXT = {
    PENDING_PAYMENT: "The payment isn't finished yet. Open the order and press Retry payment.",
    PLACED: "The shop will confirm it and the delivery time with you soon.",
    CONFIRMED: "The shop has confirmed it and will start making it.",
    PROCESSING: "The shop is making it now.",
    SHIPPED: "It has left the shop and is on its way. You get an email when it is out for delivery.",
    OUT_FOR_DELIVERY: "It is out for delivery today.",
    DELIVERED: "It has been delivered. We hope you love it!",
    CANCELLED: "This order was cancelled. If you paid online, the refund goes back to the same payment method.",
    RETURNED: "This order was returned.",
  };

  let root, button, panel, body, form, input, sub;
  let user = null;
  let cfg = null; // /api/config: delivery, giftWrap, cod, care
  let thread = null; // the customer's conversation (GET /support)
  let view = "home"; // home | answers | thread | waiting | live | busy | ended | guest
  let log = []; // the quick questions asked and their answers (this page only)
  let stockAt = -1; // where the "Is it in stock?" answer is in the log
  let asked = { question: "", topic: "", orderNumber: "" }; // what the customer asked before asking for a person
  let busyReason = "";
  let orders = null;
  let live = null; // the live connection
  let typingUntil = 0;
  let typingTimer = 0;
  let lastTypingSent = 0;
  let countdown = 0;
  let isOpen = false;

  const http = () => FrameX.http;
  const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const money = (n) => (FrameX.pricing && FrameX.pricing.formatPrice ? FrameX.pricing.formatPrice(n) : `₹${n}`);
  const careHours = () => (cfg && cfg.care && cfg.care.hours) || "10am–8pm";
  const waitMs = () => ((cfg && cfg.care && cfg.care.waitSeconds) || 120) * 1000;
  const liveState = () => (thread && thread.live ? thread.live.state : "");
  const emailNote = () => (user && user.email ? ` (${esc(user.email)})` : "");

  function setBadge(n) {
    const b = $("[data-chat-badge]", button);
    b.textContent = n > 9 ? "9+" : String(n);
    b.hidden = !n;
    button.setAttribute("aria-label", n ? `FrameX Care chat, ${n} new ${n === 1 ? "message" : "messages"}` : "FrameX Care chat");
  }

  /* ---------------------------------------------------------------- Pieces */
  const bubble = (who, html, small) => `<div class="hc-msg hc-msg--${who}">${html}${small ? `<small>${small}</small>` : ""}</div>`;
  const card = (html, extra = "") => `<div class="hc-card${extra}">${html}</div>`;
  const btn = (attrs, label, kind = "") => `<button type="button" class="hc-b${kind ? ` hc-b--${kind}` : ""}" ${attrs}>${label}</button>`;
  const helped = () => card(`Did this answer your question?<div class="hc-btns">${btn("data-helped", "👍 Yes, thanks")}${btn("data-connect", "Connect with FrameX Care", "on")}</div>`);

  function messageHtml(m) {
    if (m.from === "system") return `<p class="hc-day">${esc(m.body)} · ${esc(time(m.at))}</p>`;
    const mine = m.from === "you";
    const order = m.orderNumber ? `<span class="hc-msg__order">${icon("package")} ${esc(m.orderNumber)}</span>` : "";
    return bubble(mine ? "me" : "them", order + esc(m.body).replace(/\n/g, "<br>"), `${mine ? "" : `${esc(m.name || "FrameX")} · `}${esc(time(m.at))}`);
  }

  const orderRow = (o) =>
    `<div class="hc-order">${o.firstItem && o.firstItem.image ? `<img src="${esc(http().asset(o.firstItem.image))}" alt="" width="40" height="40">` : icon("package")}<span><strong>${esc(o.orderNumber)}${o.firstItem ? ` · ${esc(o.firstItem.name)}` : ""}</strong><span class="hc-pill">${esc(ORDER_STATUS[o.status] || o.status)}</span></span></div>`;

  /* ---------------------------------------------------------------- Quick answers */
  async function answer(id) {
    const q = QUESTIONS.find((x) => x[0] === id);
    asked = { question: q[2], topic: TOPIC_OF[id] || "other", orderNumber: "" };
    log.push(bubble("me", esc(q[2])));
    log.push(card(`<p class="hc-muted">One moment…</p>`));
    view = "answers";
    render();
    const html = await answerHtml(id).catch(() => `<p>Sorry, this answer couldn't be loaded. Please try again, or connect with FrameX Care.</p>`);
    log[log.length - 1] = card(html);
    if (id === "stock") stockAt = log.length - 1;
    else log.push(helped());
    render();
    if (id === "stock") $("[data-stock-q]", panel).focus();
  }

  const stockForm = (value = "") =>
    `<h4>Is it in stock?</h4><p>Type the name of the frame or product:</p>
     <form class="hc-stock" data-stock><label class="visually-hidden" for="hc-stock-q">Product name</label><input id="hc-stock-q" data-stock-q maxlength="60" value="${esc(value)}" placeholder="e.g. walnut frame" autocomplete="off"><button type="submit" class="hc-b hc-b--on">Check</button></form>`;

  async function answerHtml(id) {
    if (id === "order") {
      if (!user) return `<h4>Your orders</h4><p>Log in to see your orders and where they are.</p><div class="hc-btns"><a class="hc-b hc-b--dark" href="${esc(FrameX.auth.loginUrl())}">Log in</a></div>`;
      if (!orders) orders = ((await http().get("/orders", { limit: 3 })).items || []).slice(0, 3);
      if (!orders.length) return `<h4>Your orders</h4><p>You haven't placed an order yet.</p><div class="hc-btns"><a class="hc-b hc-b--dark" href="shop.html">Browse frames</a></div>`;
      const o = orders[0];
      asked.orderNumber = o.orderNumber;
      return `<h4>Your latest order</h4>${orderRow(o)}<p>${esc(ORDER_NEXT[o.status] || "")}</p>
        <div class="hc-btns"><a class="hc-b hc-b--dark" href="order.html?id=${encodeURIComponent(o.orderNumber)}">Open my order</a>${orders.length > 1 ? btn("data-more-orders", "Another order") : ""}</div>`;
    }
    if (id === "delivery") {
      const d = (cfg && cfg.delivery) || {};
      return `<h4>Delivery</h4><ul>
        ${typeof d.fee === "number" ? `<li>Delivery charge <strong>${esc(money(d.fee))}</strong></li>` : ""}
        ${d.freeAbove ? `<li><strong>Free</strong> on orders above <strong>${esc(money(d.freeAbove))}</strong></li>` : ""}
        ${d.firstOrderFree ? `<li>Your <strong>first order</strong> has free delivery</li>` : ""}
        <li>Some shops also offer pickup</li></ul>
        <p>Any delivery charge is shown in your total before you pay. The shop confirms the delivery time with you after you order.</p>`;
    }
    if (id === "sizes")
      return `<h4>Sizes &amp; prices</h4><p>Every product page shows its sizes and the price of each size before you pay. Most frames come in:</p>
        <ul><li>Small — 8 × 10 in</li><li>Medium — 12 × 16 in</li><li>Large — 16 × 20 in</li><li>Extra Large — 20 × 24 in</li></ul>
        <div class="hc-btns"><a class="hc-b hc-b--dark" href="shop.html">Browse frames</a></div>`;
    if (id === "stock") return stockForm();
    if (id === "photo")
      return `<h4>Photo &amp; print quality</h4><p>Your uploaded image will be printed in the same original quality you provide. We do not enhance or change it.</p>
        <ul><li>Use the original photo from your phone or camera, not a screenshot or a WhatsApp copy</li><li>About 300 pixels for every inch of the print gives the best result</li></ul>`;
    if (id === "payment") {
      const cod = (cfg && cfg.cod) || {};
      return `<h4>Payment &amp; COD</h4><ul><li>Pay online with UPI, card or net banking in the payment gateway's secure window — FrameX never sees your card or UPI PIN</li>
        ${cod.enabled !== false ? `<li>Cash on Delivery where the shop offers it${cod.fee ? ` (${esc(money(cod.fee))} COD charge)` : ""}</li>` : ""}
        <li>Payment failed? Open the order under Your orders and press <strong>Retry payment</strong> — you are not charged twice</li></ul>`;
    }
    if (id === "cancel")
      return `<h4>Cancel or return</h4><ul><li>You can cancel from the order's page before production starts</li><li>If you paid online, the refund goes back to the same payment method</li>
        <li>Arrived damaged? Contact us within 7 days — we arrange a replacement or refund after checking</li></ul>`;
    if (id === "gift") {
      const g = (cfg && cfg.giftWrap) || {};
      if (g.enabled === false) return `<h4>Gift wrap</h4><p>Gift wrapping isn't offered at the moment.</p>`;
      return `<h4>Gift wrap</h4><p>Yes, for most orders. At checkout choose <strong>“Gift wrap this order”</strong>${g.fee ? ` — ${esc(money(g.fee))} is added as its own line before you pay` : ""}.</p>`;
    }
    return "";
  }

  async function stockSearch(q) {
    const term = q.trim();
    if (term.length < 2 || stockAt < 0) return;
    let results;
    try {
      const r = await http().get("/search", { q: term, kinds: "products", limit: 5 });
      const items = (r.results && r.results.products && r.results.products.items) || [];
      results = items.length
        ? `<ul class="hc-stock__list">${items.map((p) => `<li><a href="${esc(p.url)}">${esc(p.name)}</a><span class="hc-pill${p.inStock === false ? " hc-pill--out" : ""}">${p.inStock === false ? "Out of stock" : "In stock"}</span></li>`).join("")}</ul>`
        : `<p>Nothing found for “${esc(term)}”. Try another word.</p>`;
    } catch (error) {
      results = `<p>${esc(error.message)}</p>`;
    }
    asked.question = `Is it in stock? (${term})`;
    log[stockAt] = card(`${stockForm(term)}<div data-stock-out>${results}</div>`);
    if (stockAt === log.length - 1) log.push(helped());
    render();
  }

  /* ---------------------------------------------------------------- Views */
  function homeHtml() {
    const first = user ? ` ${esc(String(user.name).split(/\s+/)[0])}` : "";
    const open = thread && thread.status === "OPEN" && thread.messages.some((m) => m.from !== "system") && !["WAITING", "LIVE"].includes(liveState());
    return `${bubble("them", `Hi${first} 👋 What can we help you with? Tap a question for an instant answer.`, "FrameX Care")}
      ${open ? `<button type="button" class="hc-person hc-person--soft" data-thread>${icon("mail")}<span>Your conversation with FrameX Care${thread.unread ? ` <em>${thread.unread} new</em>` : ""}<small>See the answers and write again</small></span><i>›</i></button>` : ""}
      <p class="hc-label">Common questions</p>
      <div class="hc-qs">${QUESTIONS.map(([id, ic, label]) => `<button type="button" class="hc-q" data-q="${id}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div>
      <p class="hc-label">Need a person?</p>
      <button type="button" class="hc-person" data-connect>${icon("mail")}<span>Connect with FrameX Care<small>Chat live with our team · ${esc(careHours())}</small></span><i>›</i></button>`;
  }

  const answersHtml = () => `${log.join("")}<div class="hc-btns hc-btns--back">${btn("data-home", "← More questions")}</div>`;

  function threadHtml() {
    const msgs = (thread && thread.messages) || [];
    return `${msgs.map(messageHtml).join("") || bubble("them", "Write your message below. We answer here and by email.", "FrameX Care")}
      ${thread && thread.status === "CLOSED" ? `<p class="hc-day">This conversation was closed. Write below to start a new one.</p>` : ""}
      <div class="hc-btns hc-btns--back">${btn("data-home", "← Questions")}${btn("data-connect", "Connect with FrameX Care", "on")}</div>`;
  }

  function waitingHtml() {
    const l = thread && thread.live;
    // The FrameX film's logo part (the same as when a page opens, ui/welcome.js), over and over while waiting
    return `<div class="hc-wait"><div class="hc-film" aria-hidden="true"><video data-film muted playsinline preload="auto" disablepictureinpicture width="1920" height="1080" src="assets/video/FrameX-animation-2-landscape.mp4"></video><span class="hc-film__still">F<i></i></span></div><div class="hc-left" data-ring><i></i></div>
      <h3>Connecting you to FrameX Care…</h3><p data-wait-left>Usually within 2 minutes. Please keep this chat open.</p>
      ${l && l.question ? `<p class="hc-muted">About: <strong>${esc(l.question)}</strong></p>` : ""}
      ${btn("data-cancel", "Cancel")}</div>`;
  }

  function liveHtml() {
    const msgs = (thread && thread.messages) || [];
    const typing = Date.now() < typingUntil ? `<div class="hc-typing"><span><b></b><b></b><b></b></span> ${esc(thread.live.agentName || "FrameX Care")} is typing…</div>` : "";
    return msgs.map(messageHtml).join("") + typing;
  }

  function busyHtml() {
    const why =
      busyReason === "HOURS"
        ? `<h4>Our team is available ${esc(careHours())}</h4>Leave your message and we will answer here and by email${emailNote()}.`
        : busyReason === "TIMEOUT"
          ? `<h4>Sorry, everyone is busy</h4>Nobody could join within 2 minutes. Leave your message and we will answer here and by email${emailNote()}, usually within a few hours.`
          : `<h4>Sorry, everyone is busy right now</h4>Leave your message and we will answer here and by email${emailNote()}, usually within a few hours.`;
    const start = asked.question ? `${asked.question}${asked.orderNumber ? ` — order ${asked.orderNumber}` : ""}: ` : "";
    return `${card(why)}<form class="hc-box" data-leave><label for="hc-leave"><strong>Your message</strong></label>
      <textarea id="hc-leave" rows="4" maxlength="2000">${esc(start)}</textarea>
      <p class="hc-error" role="alert" hidden></p>
      <div class="hc-btns"><button type="submit" class="hc-b hc-b--on">Send message</button>${busyReason === "HOURS" ? "" : btn("data-connect", "Try connecting again")}</div></form>
      <div class="hc-btns hc-btns--back">${btn("data-home", "← Questions")}</div>`;
  }

  function endedHtml() {
    const msgs = (thread && thread.messages) || [];
    const who = thread && thread.live && thread.live.agentName ? ` with ${esc(thread.live.agentName)}` : "";
    return `${msgs.map(messageHtml).join("")}
      ${card(`How was your chat${who}?
        ${thread && thread.rating ? `<p class="hc-muted">Thank you for your feedback!</p>` : `<div class="hc-rate">${btn('data-rate="up" aria-label="Good"', "👍")}${btn('data-rate="down" aria-label="Not good"', "👎")}</div>`}
        <div class="hc-btns hc-btns--center">${btn("data-new", "Start a new chat")}</div>`, " hc-card--wide")}`;
  }

  const guestHtml = () => `<div class="hc-guest">${icon("lock")}<strong>Log in to chat with FrameX Care</strong>
      <span>So we can answer you by email and see your orders. It takes a minute to create an account.</span>
      <a class="btn btn--primary btn--sm" href="${esc(FrameX.auth.loginUrl())}">Log in or sign up</a>
      <a class="hc-link" href="contact.html">Or send us a message from the Contact page</a>
      ${btn("data-home", "← Back to questions")}</div>`;

  function headLine() {
    const c = cfg && cfg.care;
    if (view === "live" && thread && thread.live) return `<b class="hc-dot"></b>Live chat`;
    if (view === "waiting") return `<b class="hc-dot hc-dot--wait"></b>Finding someone from our team…`;
    if (c && c.online) return `<b class="hc-dot"></b>Quick answers any time · team online now`;
    return `<b class="hc-dot hc-dot--off"></b>Quick answers any time · team ${esc(careHours())}`;
  }

  const VIEWS = { home: homeHtml, answers: answersHtml, thread: threadHtml, waiting: waitingHtml, live: liveHtml, busy: busyHtml, ended: endedHtml, guest: guestHtml };

  function render() {
    if (!panel) return;
    clearInterval(countdown);
    sub.innerHTML = headLine();
    const showLive = view === "live" && thread && thread.live;
    const bar = $(".hc-live", panel);
    bar.hidden = !showLive;
    if (showLive) bar.innerHTML = `<b></b><span>Live · You're chatting with <strong>${esc(thread.live.agentName || "FrameX Care")}</strong></span>${btn("data-end", "End chat", "end")}`;
    body.innerHTML = VIEWS[view]();
    // The message box: while live and in a written conversation; the quick-answer views use buttons.
    form.hidden = !(view === "live" || view === "thread");
    input.placeholder = view === "live" ? `Write to ${thread.live.agentName || "FrameX Care"}…` : "Type your message…";
    $(".hc-attached", panel).innerHTML = view === "thread" && asked.orderNumber ? `${icon("package")} About order <strong>${esc(asked.orderNumber)}</strong>` : "";
    body.scrollTop = body.scrollHeight;
    if (view === "waiting") {
      tick();
      film();
    }
  }

  /** The logo is drawn (the first 1.72 s of the film, played 1.7× as on page load), held a moment, and drawn again. */
  function film() {
    const v = $("[data-film]", panel);
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const STOP_AT = 1.72;
    v.playbackRate = 1.7;
    const again = () => {
      if (!v.isConnected) return;
      v.currentTime = 0;
      v.playbackRate = 1.7;
      v.play().catch(() => {});
    };
    const watch = () => {
      if (!v.isConnected) return;
      if (v.currentTime >= STOP_AT) {
        v.pause();
        return setTimeout(again, 700);
      }
      requestAnimationFrame(watch);
    };
    v.addEventListener("playing", () => {
      v.closest(".hc-film").classList.add("is-playing");
      requestAnimationFrame(watch);
    });
    v.play().catch(() => {});
  }

  /** The waiting ring: how much of the 2 minutes is left. */
  function tick() {
    const l = thread && thread.live;
    if (!l || !l.waitUntil) return;
    const step = () => {
      const left = new Date(l.waitUntil).getTime() - Date.now();
      const ring = $("[data-ring]", panel);
      if (!ring) return clearInterval(countdown);
      ring.style.setProperty("--left", String(Math.max(0, Math.min(1, left / waitMs()))));
      ring.setAttribute("aria-hidden", "true");
      const s = Math.max(0, Math.ceil(left / 1000));
      $("[data-wait-left]", panel).textContent = `Usually within 2 minutes · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left. Please keep this chat open.`;
      if (left <= 0) {
        clearInterval(countdown);
        setTimeout(load, 1200); // the server marks it missed
      }
    };
    step();
    countdown = setInterval(step, 1000);
  }

  /** Which view the conversation calls for (after loading it or a live event). */
  function follow() {
    const s = liveState();
    if (s === "WAITING") view = "waiting";
    else if (s === "LIVE") view = "live";
    else if (s === "ENDED" && (view === "live" || view === "ended")) view = "ended";
    else if (s === "MISSED" && view === "waiting") {
      busyReason = "TIMEOUT";
      view = "busy";
    } else if (view === "waiting" || view === "live") view = "home";
  }

  /* ---------------------------------------------------------------- Server */
  async function load() {
    if (!user) return;
    try {
      thread = (await http().get("/support")).thread;
    } catch (error) {
      return;
    }
    follow();
    const reading = isOpen && (view === "live" || view === "thread" || view === "ended");
    if (reading && thread && thread.unread) http().post("/support/read").catch(() => {});
    setBadge(reading ? 0 : (thread && thread.unread) || 0);
    wantLive();
    if (isOpen || view === "live") render();
  }

  /** The live connection is open while the chat is open, or while the customer waits for / talks to someone. */
  function wantLive() {
    const need = Boolean(user) && (isOpen || ["WAITING", "LIVE"].includes(liveState()));
    if (need && !live) live = http().stream("/support/stream", { onEvent, onOpen: () => load() }); // (re)connected: catch up
    if (!need && live) {
      live.close();
      live = null;
    }
  }

  function onEvent(type, data) {
    if (type === "message") {
      if (!thread || thread.id !== data.threadId) return load();
      if (!thread.messages.some((m) => m.id === data.message.id)) thread.messages.push(data.message);
      typingUntil = 0;
      if (isOpen && (view === "live" || view === "thread")) http().post("/support/read").catch(() => {});
      else {
        thread.unread = (thread.unread || 0) + 1;
        setBadge(thread.unread);
      }
      if (isOpen) render();
    } else if (type === "typing") {
      typingUntil = Date.now() + 4000;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => view === "live" && render(), 4100);
      if (view === "live") render();
    } else if (type === "live") {
      if (data.state === "LIVE" && !isOpen) open();
      load();
    }
  }

  async function connect() {
    if (!user) {
      view = "guest";
      return render();
    }
    view = "waiting";
    thread = thread || { status: "OPEN", messages: [] };
    thread.live = { state: "WAITING", question: asked.question, waitUntil: new Date(Date.now() + waitMs()).toISOString() };
    render();
    try {
      const r = await http().post("/support/live", { question: asked.question, topic: asked.topic || undefined, orderNumber: asked.orderNumber || undefined });
      thread = r.thread;
      if (r.live.state === "NOBODY") {
        busyReason = r.live.reason;
        view = "busy";
      } else follow();
    } catch (error) {
      busyReason = "BUSY";
      view = "busy";
      FrameX.toast.show(error.message);
    }
    wantLive();
    render();
  }

  async function send(text, { orderNumber = "" } = {}) {
    thread = (await http().post("/support/messages", { body: text, orderNumber: orderNumber || undefined, topic: asked.topic || undefined })).thread;
  }

  /* ---------------------------------------------------------------- Build */
  function build() {
    root = document.createElement("div");
    root.className = "hc";
    root.innerHTML = `<button class="hc-btn" type="button" data-chat-open aria-haspopup="dialog" aria-expanded="false"><span class="hc-btn__icon">${icon("mail")}</span><span class="hc-btn__text">FrameX Care</span><em class="hc-btn__badge" data-chat-badge hidden>0</em></button>
      <section class="hc-panel" role="dialog" aria-modal="false" aria-labelledby="hc-title" hidden>
        <header class="hc-head"><img class="hc-dp" src="assets/img/brand/framex-care.png" alt="" width="40" height="40"><div><strong id="hc-title">FrameX Care</strong><span class="hc-sub" data-sub></span></div>
          <button class="hc-close" type="button" data-chat-close aria-label="Close the chat">${icon("close")}</button></header>
        <div class="hc-live" hidden></div>
        <div class="hc-body" aria-live="polite"></div>
        <form class="hc-form" novalidate>
          <p class="hc-attached"></p>
          <div class="hc-form__row"><label class="visually-hidden" for="hc-input">Your message</label><textarea id="hc-input" rows="1" maxlength="2000" placeholder="Type your message…"></textarea>
          <button class="hc-send" type="submit" aria-label="Send">${icon("arrow-right")}</button></div>
          <p class="hc-error" role="alert" hidden></p>
        </form>
      </section>`;
    document.body.appendChild(root);
    button = $(".hc-btn", root);
    panel = $(".hc-panel", root);
    body = $(".hc-body", panel);
    form = $(".hc-form", panel);
    input = $("#hc-input", panel);
    sub = $("[data-sub]", panel);

    button.addEventListener("click", () => (isOpen ? close() : open()));
    $("[data-chat-close]", panel).addEventListener("click", close);
    document.addEventListener("keydown", (e) => e.key === "Escape" && isOpen && close());

    panel.addEventListener("click", async (e) => {
      const t = e.target;
      const q = t.closest("[data-q]");
      if (q) return answer(q.dataset.q);
      if (t.closest("[data-connect]")) return connect();
      if (t.closest("[data-helped]")) {
        log.push(bubble("them", "Glad we could help! 😊", "FrameX Care"));
        view = "answers";
        return render();
      }
      if (t.closest("[data-home]")) {
        view = "home";
        return render();
      }
      if (t.closest("[data-thread]")) {
        view = "thread";
        http().post("/support/read").catch(() => {});
        if (thread) thread.unread = 0;
        setBadge(0);
        return render();
      }
      if (t.closest("[data-more-orders]")) {
        log.push(card(`<h4>Your recent orders</h4>${orders.map((o) => `<a class="hc-order-link" href="order.html?id=${encodeURIComponent(o.orderNumber)}">${orderRow(o)}</a>`).join("")}`));
        log.push(helped());
        return render();
      }
      if (t.closest("[data-cancel]")) {
        const r = await http().post("/support/live/cancel").catch(() => null);
        if (r) thread = r.thread;
        view = "home";
        wantLive();
        return render();
      }
      if (t.closest("[data-end]")) {
        const r = await http().post("/support/live/end").catch((error) => FrameX.toast.show(error.message));
        if (r) thread = r.thread;
        view = "ended";
        return render();
      }
      const rate = t.closest("[data-rate]");
      if (rate) {
        const r = await http().post("/support/live/rate", { rating: rate.dataset.rate }).catch(() => null);
        if (r) thread = r.thread;
        return render();
      }
      if (t.closest("[data-new]")) {
        log = [];
        stockAt = -1;
        asked = { question: "", topic: "", orderNumber: "" };
        view = "home";
        return render();
      }
    });
    panel.addEventListener("submit", async (e) => {
      if (e.target.matches("[data-stock]")) {
        e.preventDefault();
        return stockSearch($("[data-stock-q]", panel).value);
      }
      if (!e.target.matches("[data-leave]")) return;
      e.preventDefault();
      const box = $("#hc-leave", panel);
      const text = box.value.trim();
      const err = $("[data-leave] .hc-error", panel);
      if (!text) return box.focus();
      try {
        await send(text, { orderNumber: asked.orderNumber });
        view = "thread";
        FrameX.toast.show("Message sent. We will answer here and by email.");
        render();
      } catch (error) {
        err.textContent = error.status === 429 ? "You've sent a lot of messages. Please wait a few minutes." : error.fields ? Object.values(error.fields)[0] : error.message;
        err.hidden = false;
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      // "typing…" for the care person, at most every 3 seconds
      if (view === "live" && Date.now() - lastTypingSent > 3000) {
        lastTypingSent = Date.now();
        http().post("/support/typing").catch(() => {});
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (e.target !== form) return;
      const text = input.value.trim();
      const err = $(".hc-form > .hc-error", panel);
      if (!text) return;
      err.hidden = true;
      $(".hc-send", panel).disabled = true;
      try {
        await send(text, { orderNumber: view === "thread" ? asked.orderNumber : "" });
        input.value = "";
        input.style.height = "";
        if (view === "thread") asked.orderNumber = "";
        follow();
        render();
        input.focus();
      } catch (error) {
        err.textContent = error.status === 429 ? "You've sent a lot of messages. Please wait a few minutes." : error.fields ? Object.values(error.fields)[0] : error.message || "Your message couldn't be sent. Please try again.";
        err.hidden = false;
      } finally {
        $(".hc-send", panel).disabled = false;
      }
    });
  }

  /* ---------------------------------------------------------------- Open / close */
  async function open() {
    isOpen = true;
    panel.hidden = false;
    root.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    render();
    if (user) await load();
    wantLive();
    if (view === "live") input.focus();
  }

  function close() {
    isOpen = false;
    panel.hidden = true;
    root.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    clearInterval(countdown);
    wantLive();
    button.focus();
  }

  async function init() {
    if (NOT_HERE.includes(document.body.dataset.page) || !FrameX.http || !FrameX.http.enabled()) return;
    const s = FrameX.auth ? await FrameX.auth.ready : null;
    user = s && s.user ? s.user : null;
    if (user && user.role !== "CUSTOMER") return; // shops, artists, care and admins have their own pages
    build();
    cfg = await http().serverConfig();
    if (user) await load();
    if (FrameX.qs.param("chat")) open();
  }

  FrameX.helpChat = { init, open };
})((window.FrameX = window.FrameX || {}));
