/* ==========================================================================
   Help chat (owner, 2026-10-23): FrameX's own way to ask for help, on every
   customer page, instead of sending people to WhatsApp.

   - A button in the corner ("Help & chat"), with the number of FrameX answers
     not read yet. ?chat=1 in the address opens it (the reply email links there).
   - Logged-in customers write to FrameX (optionally about one of their recent
     orders, with a quick topic to start); the answers appear here and are
     emailed to them. While the chat is open it looks for new answers every
     15 seconds (only while the tab is in view).
   - Visitors who aren't logged in are asked to log in (so FrameX can answer
     them and see their orders), or to use the Contact page.
   - Not on the admin and seller dashboards; not for shop or artist accounts.
   The server side is backend/src/routes/support.js.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const NOT_HERE = ["admin", "shop-dashboard", "artist-dashboard", "login", "signup", "forgot-password", "reset-password"];
  const TOPICS = [
    ["order", "Track my order"],
    ["address", "Change address"],
    ["photo", "Photo & print help"],
    ["advice", "Size / frame advice"],
    ["other", "Something else"],
  ];
  const FIRST_LINE = { order: "Hi, I'd like to know where my order is.", address: "Hi, I'd like to change the delivery address of my order.", photo: "Hi, I have a question about my photo and how it will be printed.", advice: "Hi, can you help me choose the size or the frame?", other: "" };

  let root, button, panel, list, form, input;
  let thread = null;
  let state = "closed"; // closed | open
  let user = null;
  let picked = { topic: "", orderNumber: "" };
  let orders = [];
  let poll = 0;
  let busy = false;

  const http = () => FrameX.http;
  const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  function setBadge(n) {
    const b = $("[data-chat-badge]", button);
    b.textContent = n > 9 ? "9+" : String(n);
    b.hidden = !n;
    button.setAttribute("aria-label", n ? `Help and chat, ${n} new ${n === 1 ? "answer" : "answers"} from FrameX` : "Help and chat with FrameX");
  }

  /* ---------------------------------------------------------------- Drawing */
  function messagesHtml() {
    const msgs = (thread && thread.messages) || [];
    const hello = `<div class="hc-msg hc-msg--them">Hi${user ? ` ${esc(String(user.name).split(/\s+/)[0])}` : ""} 👋 How can we help you today?<small>FrameX Support</small></div>`;
    if (!msgs.length) return hello;
    let lastDay = "";
    return (
      hello +
      msgs
        .map((m) => {
          const d = day(m.at);
          const sep = d !== lastDay ? `<p class="hc-day">${esc(d)}</p>` : "";
          lastDay = d;
          return `${sep}<div class="hc-msg hc-msg--${m.from === "framex" ? "them" : "me"}">${m.orderNumber ? `<span class="hc-msg__order">${icon("package")} ${esc(m.orderNumber)}</span>` : ""}${esc(m.body).replace(/\n/g, "<br>")}<small>${m.from === "framex" ? "FrameX Support · " : ""}${esc(time(m.at))}</small></div>`;
        })
        .join("") +
      (thread.status === "CLOSED" ? `<p class="hc-day">This conversation was closed. Write below to start a new one.</p>` : "")
    );
  }

  function startersHtml() {
    const fresh = !thread || thread.status === "CLOSED" || !thread.messages.length;
    const topics = fresh ? `<div class="hc-quick" role="group" aria-label="What is it about?">${TOPICS.map(([id, label]) => `<button type="button" class="hc-chip${picked.topic === id ? " is-on" : ""}" data-topic="${id}" aria-pressed="${picked.topic === id}">${esc(label)}</button>`).join("")}</div>` : "";
    const ords = orders.length
      ? `<div class="hc-orders" role="group" aria-label="About one of your orders?">${orders
          .map((o) => `<button type="button" class="hc-order${picked.orderNumber === o.orderNumber ? " is-on" : ""}" data-order="${esc(o.orderNumber)}" aria-pressed="${picked.orderNumber === o.orderNumber}">${o.image ? `<img src="${esc(FrameX.http.asset(o.image))}" alt="" width="36" height="36">` : icon("package")}<span><strong>${esc(o.orderNumber)}</strong>${esc(o.title)}</span></button>`)
          .join("")}</div>`
      : "";
    return topics + ords;
  }

  function guestHtml() {
    return `<div class="hc-guest">${icon("lock")}<strong>Log in to chat with FrameX</strong>
      <span>So we can answer you by email and see your orders. It takes a minute to create an account.</span>
      <a class="btn btn--primary btn--sm" href="${esc(FrameX.auth.loginUrl())}">Log in or sign up</a>
      <a class="hc-link" href="contact.html">Or send us a message from the Contact page</a></div>`;
  }

  function render() {
    if (!panel) return;
    const body = $(".hc-body", panel);
    if (!user) {
      body.innerHTML = guestHtml();
      form.hidden = true;
      return;
    }
    body.innerHTML = messagesHtml() + startersHtml();
    form.hidden = false;
    $(".hc-attached", panel).innerHTML = picked.orderNumber ? `${icon("package")} About order <strong>${esc(picked.orderNumber)}</strong> <button type="button" data-unpick aria-label="Not about this order">${icon("close")}</button>` : "";
    body.scrollTop = body.scrollHeight;
  }

  function build() {
    root = document.createElement("div");
    root.className = "hc";
    root.innerHTML = `<button class="hc-btn" type="button" data-chat-open aria-haspopup="dialog" aria-expanded="false"><span class="hc-btn__icon">${icon("mail")}</span><span class="hc-btn__text">Help &amp; chat</span><em class="hc-btn__badge" data-chat-badge hidden>0</em></button>
      <section class="hc-panel" role="dialog" aria-modal="false" aria-labelledby="hc-title" hidden>
        <header class="hc-head"><span class="hc-head__logo" aria-hidden="true">F<i></i></span><div><strong id="hc-title">FrameX Support</strong><span>We usually answer within a few hours</span></div>
          <button class="hc-close" type="button" data-chat-close aria-label="Close the chat">${icon("close")}</button></header>
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
    list = $(".hc-body", panel);
    form = $(".hc-form", panel);
    input = $("#hc-input", panel);

    button.addEventListener("click", () => (state === "open" ? close() : open()));
    $("[data-chat-close]", panel).addEventListener("click", close);
    document.addEventListener("keydown", (e) => e.key === "Escape" && state === "open" && close());
    panel.addEventListener("click", (e) => {
      const t = e.target.closest("[data-topic]");
      if (t) {
        picked.topic = picked.topic === t.dataset.topic ? "" : t.dataset.topic;
        if (picked.topic && !input.value.trim()) input.value = FIRST_LINE[picked.topic] || "";
        render();
        input.focus();
        return;
      }
      const o = e.target.closest("[data-order]");
      if (o) {
        picked.orderNumber = picked.orderNumber === o.dataset.order ? "" : o.dataset.order;
        render();
        input.focus();
        return;
      }
      if (e.target.closest("[data-unpick]")) {
        picked.orderNumber = "";
        render();
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
    });
    form.addEventListener("submit", send);
  }

  /* ---------------------------------------------------------------- Talking to the server */
  async function load() {
    try {
      thread = (await http().get("/support")).thread;
      if (state === "open" && thread && thread.unread) await http().post("/support/read").catch(() => {});
      setBadge(state === "open" ? 0 : (thread && thread.unread) || 0);
    } catch (error) {
      /* keep what is shown */
    }
    render();
  }

  async function loadOrders() {
    try {
      const r = await http().get("/orders", { limit: 3 });
      orders = (r.items || []).slice(0, 3).map((o) => ({ orderNumber: o.orderNumber, title: o.firstItem ? o.firstItem.name : `${o.itemCount || ""} items`, image: o.firstItem ? o.firstItem.image : "" }));
    } catch (error) {
      orders = [];
    }
  }

  async function send(e) {
    e.preventDefault();
    const body = input.value.trim();
    const err = $(".hc-error", panel);
    if (!body || busy) return;
    busy = true;
    err.hidden = true;
    $(".hc-send", panel).disabled = true;
    try {
      thread = (await http().post("/support/messages", { body, orderNumber: picked.orderNumber || undefined, topic: picked.topic || undefined })).thread;
      input.value = "";
      input.style.height = "";
      picked = { topic: "", orderNumber: "" };
      render();
    } catch (error) {
      err.textContent = error.status === 429 ? "You've sent a lot of messages. Please wait a few minutes." : error.fields ? Object.values(error.fields)[0] : error.message || "Your message couldn't be sent. Please try again.";
      err.hidden = false;
    } finally {
      busy = false;
      $(".hc-send", panel).disabled = false;
    }
  }

  /* ---------------------------------------------------------------- Open / close */
  async function open() {
    state = "open";
    panel.hidden = false;
    root.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    render();
    if (user) {
      await Promise.all([load(), orders.length ? null : loadOrders()]);
      render();
      input.focus();
      clearInterval(poll);
      poll = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    }
  }

  function close() {
    state = "closed";
    panel.hidden = true;
    root.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    clearInterval(poll);
    button.focus();
  }

  async function init() {
    if (NOT_HERE.includes(document.body.dataset.page) || !FrameX.http || !FrameX.http.enabled()) return;
    const s = FrameX.auth ? await FrameX.auth.ready : null;
    user = s && s.user ? s.user : null;
    if (user && user.role !== "CUSTOMER") return; // shops, artists and admins have their dashboards
    build();
    if (user)
      http()
        .get("/support/unread")
        .then((r) => setBadge(r.unread))
        .catch(() => {});
    if (FrameX.qs.param("chat")) open();
  }

  FrameX.helpChat = { init, open };
})((window.FrameX = window.FrameX || {}));
