/* ==========================================================================
   The FrameX Care desk (admin panel -> Live chats, #/live; owner, 2026-10-24):
   where care people (and admins) answer customers.

   - "Available" / "Away": while Available with this page open, every new
     "Connect with FrameX Care" request pops up here with a sound; the first
     person to press Accept gets the chat, and the customer sees their first
     name. A request nobody accepts in 2 minutes goes back to the customer as
     "leave a message".
   - Lists: requests waiting, my live chats, other people's live chats,
     messages left (answered later; the customer is emailed), all chats.
   - Everything arrives over one live connection (FrameX.http.stream on
     /api/care/stream): no page asks every second.
   Care logins see only Live chats and Orders in the admin panel; admins make
   them in Admin -> Care team. FrameX.careDesk.mount(el, me) -> destroy().
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const money = (n) => (FrameX.pricing && FrameX.pricing.formatPrice ? FrameX.pricing.formatPrice(n) : `₹${n}`);
  const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const ORDER_STATUS = { PENDING_PAYMENT: "Waiting for payment", PLACED: "Placed", CONFIRMED: "Confirmed", PROCESSING: "Being made", SHIPPED: "Shipped", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", RETURNED: "Returned" };
  const QUICK = ["Let me check that for you, one minute please.", "Your order is on its way.", "Is there anything else I can help you with?", "Thank you for contacting FrameX Care!"];
  const TABS = [
    ["waiting", "Waiting"],
    ["mine", "My live chats"],
    ["messages", "Messages left"],
    ["all", "All chats"],
  ];

  let root, me;
  let q = { waiting: [], mine: [], others: [], messages: [], status: {} };
  let all = null;
  let tab = "waiting";
  let current = null; // the open conversation (GET /care/threads/:id)
  let typingUntil = 0;
  let typingTimer = 0;
  let lastTypingSent = 0;
  let dismissed = new Set(); // requests the person pressed "Later" on
  let tickTimer = 0;
  let refreshTimer = 0;
  let audio = null;
  let connected = false;

  const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "FrameX";

  /* ---------------------------------------------------------------- Sound: two short tones (no file to load) */
  function ding() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      [0, 0.22].forEach((at, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, audio.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.2);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + at);
        o.stop(audio.currentTime + at + 0.22);
      });
    } catch (error) {
      /* no sound on this browser */
    }
  }

  /* ---------------------------------------------------------------- Drawing */
  const waitLeft = (t) => {
    const until = t.live && t.live.waitUntil ? new Date(t.live.waitUntil).getTime() : 0;
    const s = Math.max(0, Math.round((until - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function shell() {
    root.innerHTML = `<div class="cd">
      <aside class="cd-side">
        <div class="cd-avail" data-avail></div>
        <p class="cd-conn" data-conn></p>
      </aside>
      <section class="cd-list" aria-label="Chats">
        <div class="cd-tabs" role="tablist" data-tabs></div>
        <div class="cd-items" data-items></div>
      </section>
      <section class="cd-conv" data-conv aria-live="polite"></section>
      <aside class="cd-info" data-info></aside>
    </div>
    <div class="cd-pop" data-pop hidden></div>`;
  }

  function drawStatus() {
    const s = q.status || {};
    const on = Boolean(s.available);
    $("[data-avail]", root).innerHTML = `<strong>Your status</strong>
      <div class="cd-toggle" role="group" aria-label="Your status"><button type="button" data-presence="1" aria-pressed="${on}" class="${on ? "is-on" : ""}">Available</button><button type="button" data-presence="0" aria-pressed="${!on}" class="${on ? "" : "is-off"}">Away</button></div>
      <small>${on ? "New chat requests pop up here with a sound." : "You get no new requests while Away."}${s.open === false ? ` Outside the team's hours (${esc(s.hours || "")}): customers are asked to leave a message.` : ""}</small>`;
    $("[data-conn]", root).innerHTML = connected ? `<b class="hc-dot"></b> Connected — new messages arrive at once` : `<b class="hc-dot hc-dot--wait"></b> Connecting…`;
  }

  function drawTabs() {
    const n = { waiting: q.waiting.length, mine: q.mine.length, messages: q.messages.filter((x) => x.unread).length, all: 0 };
    $("[data-tabs]", root).innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}">${esc(label)}${n[id] ? ` <em>${n[id]}</em>` : ""}</button>`).join("");
    document.title = `${n.waiting ? `(${n.waiting}) ` : ""}FrameX Care desk`;
  }

  function itemHtml(t, kind) {
    const on = current && current.id === t.id ? " is-on" : "";
    const right =
      kind === "waiting"
        ? `<span class="cd-wait">⏱ ${esc(waitLeft(t))}</span><button type="button" class="btn btn--primary btn--sm" data-accept="${esc(t.id)}">Accept</button>`
        : kind === "others"
          ? `<span class="cd-tag">${esc((t.live && t.live.agentName) || "")}</span>`
          : t.unread
            ? `<em class="cd-new">${t.unread}</em>`
            : "";
    const line = kind === "waiting" ? t.question || "Wants to talk to FrameX Care" : t.lastMessage || t.question || "";
    return `<div class="cd-item${on}"><button type="button" class="cd-item__main" data-open="${esc(t.id)}"><strong>${esc(kind === "waiting" ? t.customer.short : t.customer.name)}</strong><small>${esc(line.slice(0, 90))}${t.orderNumber ? ` · ${esc(t.orderNumber)}` : ""}</small></button>${right}</div>`;
  }

  function drawList() {
    drawTabs();
    const box = $("[data-items]", root);
    let html = "";
    if (tab === "waiting") html = q.waiting.length ? q.waiting.map((t) => itemHtml(t, "waiting")).join("") : empty("No one is waiting", q.status.available ? "New requests appear here and pop up with a sound." : "Switch to Available to get new requests.");
    if (tab === "mine") html = (q.mine.length ? q.mine.map((t) => itemHtml(t, "mine")).join("") : empty("No live chats", "Accept a waiting request to start one.")) + (q.others.length ? `<p class="cd-sub">Other live chats</p>${q.others.map((t) => itemHtml(t, "others")).join("")}` : "");
    if (tab === "messages") html = q.messages.length ? q.messages.map((t) => itemHtml(t, "messages")).join("") : empty("No messages left", "Messages customers leave when nobody is free appear here.");
    if (tab === "all") html = all ? (all.items.length ? all.items.map((t) => itemHtml({ ...t, customer: { ...t.customer, short: t.customer.name } }, "all")).join("") : empty("No chats yet", "")) : `<p class="cd-sub">Loading…</p>`;
    box.innerHTML = html;
  }

  const empty = (title, line) => `<div class="cd-empty">${icon("mail")}<strong>${esc(title)}</strong><span>${esc(line)}</span></div>`;

  function messageHtml(m) {
    if (m.from === "system") return `<p class="hc-day">${esc(m.body)} · ${esc(time(m.at))}</p>`;
    const staff = m.from === "framex";
    const order = m.orderNumber ? `<span class="hc-msg__order">${icon("package")} ${esc(m.orderNumber)}</span>` : "";
    return `<div class="hc-msg hc-msg--${staff ? "me" : "them"}">${order}${esc(m.body).replace(/\n/g, "<br>")}<small>${staff ? `${esc(m.name || "FrameX")} · ` : `${esc(current.customer.name)} · `}${esc(time(m.at))}</small></div>`;
  }

  function drawConv() {
    const box = $("[data-conv]", root);
    root.querySelector(".cd").classList.toggle("has-conv", Boolean(current));
    if (!current) {
      box.innerHTML = `<div class="cd-empty cd-empty--big">${icon("mail")}<strong>Choose a chat</strong><span>Accept a waiting request, or open a conversation from the list.</span></div>`;
      $("[data-info]", root).innerHTML = "";
      return;
    }
    const t = current;
    const l = t.live;
    const mine = l && l.state === "LIVE" && t.agentId === me.id;
    const otherLive = l && l.state === "LIVE" && t.agentId !== me.id;
    const waiting = l && l.state === "WAITING";
    const typing = mine && Date.now() < typingUntil ? `<div class="hc-typing"><span><b></b><b></b><b></b></span> ${esc(firstName(t.customer.name))} is typing…</div>` : "";
    const note = waiting
      ? `<p class="hc-day"><strong>${esc(t.customer.name)}</strong> is waiting for someone · ${esc(waitLeft(t))} left</p>`
      : l && l.question
        ? `<p class="hc-day">Asked <strong>“${esc(l.question)}”</strong> and saw the quick answer, then asked for a person.</p>`
        : "";
    const canWrite = !waiting && !otherLive;
    box.innerHTML = `<header class="cd-conv__head"><button type="button" class="cd-back" data-close-conv aria-label="Back to the list">${icon("chev-left")}</button>
        ${mine ? `<span class="cd-live"><b></b> Live</span>` : waiting ? `<span class="cd-wait">Waiting</span>` : l && l.state === "ENDED" ? `<span class="cd-tag">Ended</span>` : ""}
        <div><strong>${esc(t.customer.name)}</strong><small>${mine ? `You appear as “${esc(firstName(me.name))}”` : otherLive ? `${esc(l.agentName || "Someone")} is chatting with this customer` : t.status === "CLOSED" ? "Closed" : "Answered later · the customer is emailed"}</small></div>
        <span class="cd-conv__acts">${waiting ? `<button type="button" class="btn btn--primary btn--sm" data-accept="${esc(t.id)}">Accept</button>` : ""}${mine ? `<button type="button" class="btn btn--outline btn--sm" data-end>End chat</button>` : ""}${!l || !["WAITING", "LIVE"].includes(l.state) ? `<button type="button" class="btn btn--outline btn--sm" data-status="${t.status === "OPEN" ? "CLOSED" : "OPEN"}">${t.status === "OPEN" ? "Close" : "Open again"}</button>` : ""}</span></header>
      <div class="cd-log" data-log>${note}${t.messages.map(messageHtml).join("")}${typing}</div>
      ${canWrite ? `<div class="cd-quick">${QUICK.map((x) => `<button type="button" data-quick>${esc(x)}</button>`).join("")}</div>
      <form class="cd-form" data-reply><label class="visually-hidden" for="cd-input">Your answer</label><textarea id="cd-input" rows="1" maxlength="2000" placeholder="Write to ${esc(firstName(t.customer.name))}…"></textarea><button class="hc-send" type="submit" aria-label="Send">${icon("arrow-right")}</button></form>` : ""}`;
    const log = $("[data-log]", box);
    log.scrollTop = log.scrollHeight;
    $("[data-info]", root).innerHTML = `<h3>Customer</h3><p><strong>${esc(t.customer.name)}</strong></p><p class="cd-muted">${esc(t.customer.email || "")}${t.customer.phone ? `<br>${esc(t.customer.phone)}` : ""}</p>
      <h4>Recent orders</h4>${t.recentOrders.length ? t.recentOrders.map((o) => `<a href="#/orders/${esc(o.orderNumber)}" class="hc-order" title="Open the order: change size or address, cancel, refund"><span><strong>${esc(o.orderNumber)}</strong><span class="hc-pill">${esc(ORDER_STATUS[o.status] || o.status)}</span><br><small>${esc(money(o.total))} · ${esc(when(o.createdAt))}</small></span></a>`).join("") : `<p class="cd-muted">No orders yet.</p>`}
      ${t.rating ? `<p class="cd-muted">Rated the chat ${t.rating > 0 ? "👍" : "👎"}</p>` : ""}`;
  }

  /** The popup for the newest request this person hasn't put off. */
  function drawPop() {
    const pop = $("[data-pop]", root);
    const t = q.status.available ? q.waiting.find((x) => !dismissed.has(x.id)) : null;
    pop.hidden = !t;
    if (!t) return;
    pop.innerHTML = `<header><span>🔔</span>New chat request<small>⏱ ${esc(waitLeft(t))} left</small></header>
      <p><strong>${esc(t.customer.short)}</strong> wants to talk to FrameX Care</p>
      ${t.question ? `<p class="cd-muted">Asked: “${esc(t.question)}”${t.orderNumber ? ` · order ${esc(t.orderNumber)}` : ""}</p>` : ""}
      <div class="cd-pop__acts"><button type="button" class="btn btn--sm cd-btn--green" data-accept="${esc(t.id)}">Accept</button><button type="button" class="btn btn--outline btn--sm" data-later="${esc(t.id)}">Later</button></div>`;
  }

  function drawAll() {
    drawStatus();
    drawList();
    drawConv();
    drawPop();
  }

  /* ---------------------------------------------------------------- Server */
  async function loadQueue() {
    const before = new Set(q.waiting.map((x) => x.id));
    q = await http().get("/care/queue");
    if (tab === "all") all = await http().get("/care/threads");
    const fresh = q.waiting.filter((x) => !before.has(x.id) && !dismissed.has(x.id));
    if (fresh.length && q.status.available) ding();
    drawStatus();
    drawList();
    drawPop();
  }
  const soon = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => loadQueue().catch(() => {}), 250);
  };

  async function openThread(id) {
    current = (await http().get(`/care/threads/${encodeURIComponent(id)}`)).thread;
    typingUntil = 0;
    drawList();
    drawConv();
    drawPop();
    const box = $("#cd-input", root);
    if (box) box.focus();
  }

  async function accept(id) {
    try {
      dismissed.add(id);
      current = (await http().post(`/care/threads/${encodeURIComponent(id)}/accept`)).thread;
      tab = "mine";
      FrameX.toast.show(`You're now chatting with ${firstName(current.customer.name)}.`);
    } catch (error) {
      FrameX.toast.show(error.message);
    }
    await loadQueue().catch(() => {});
    drawConv();
    const box = $("#cd-input", root);
    if (box) box.focus();
  }

  function onEvent(type, data) {
    if (type === "request") {
      soon();
      if (current && current.id === data.threadId) openThread(current.id).catch(() => {}); // it shows Accept
    } else if (type === "queue") {
      soon();
      if (current && current.id === data.threadId && data.state) openThread(current.id).catch(() => {});
    } else if (type === "message") {
      if (current && current.id === data.threadId) {
        if (!current.messages.some((m) => m.id === data.message.id)) current.messages.push(data.message);
        typingUntil = 0;
        drawConv();
        // marks it read, then the lists (so it doesn't show as new)
        http().get(`/care/threads/${encodeURIComponent(current.id)}`).catch(() => {}).then(soon);
        return;
      }
      ding();
      soon();
    } else if (type === "typing") {
      if (current && current.id === data.threadId) {
        typingUntil = Date.now() + 4000;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(drawConv, 4100);
        drawConv();
        const box = $("#cd-input", root);
        if (box && document.activeElement !== box) return;
      }
    }
  }

  /* ---------------------------------------------------------------- Events */
  function wire() {
    root.addEventListener("click", async (e) => {
      const t = e.target;
      const presence = t.closest("[data-presence]");
      if (presence) {
        ding(); // also lets the browser play sounds later (it needs a first click)
        q.status = { ...q.status, ...(await http().post("/care/presence", { available: presence.dataset.presence === "1" })) };
        drawStatus();
        drawPop();
        return;
      }
      const tb = t.closest("[data-tab]");
      if (tb) {
        tab = tb.dataset.tab;
        if (tab === "all") {
          all = null;
          drawList();
          all = await http().get("/care/threads");
        }
        return drawList();
      }
      const acc = t.closest("[data-accept]");
      if (acc) return accept(acc.dataset.accept);
      const later = t.closest("[data-later]");
      if (later) {
        dismissed.add(later.dataset.later);
        return drawPop();
      }
      const op = t.closest("[data-open]");
      if (op) return openThread(op.dataset.open);
      if (t.closest("[data-close-conv]")) {
        current = null;
        return drawAll();
      }
      if (t.closest("[data-end]")) {
        try {
          current = (await http().post(`/care/threads/${encodeURIComponent(current.id)}/end`)).thread;
          FrameX.toast.show("Chat ended.");
        } catch (error) {
          FrameX.toast.show(error.message);
        }
        await loadQueue();
        return drawConv();
      }
      const st = t.closest("[data-status]");
      if (st) {
        try {
          current = (await http().post(`/care/threads/${encodeURIComponent(current.id)}/status`, { status: st.dataset.status })).thread;
        } catch (error) {
          FrameX.toast.show(error.message);
        }
        await loadQueue();
        return drawConv();
      }
      const quick = t.closest("[data-quick]");
      if (quick) {
        const box = $("#cd-input", root);
        box.value = quick.textContent;
        box.focus();
      }
    });
    root.addEventListener("submit", async (e) => {
      if (!e.target.matches("[data-reply]")) return;
      e.preventDefault();
      const box = $("#cd-input", root);
      const body = box.value.trim();
      if (!body) return box.focus();
      const send = $("[data-reply] [type=submit]", root);
      send.disabled = true;
      try {
        current = (await http().post(`/care/threads/${encodeURIComponent(current.id)}/reply`, { body })).thread;
        drawConv();
        $("#cd-input", root).focus();
      } catch (error) {
        FrameX.toast.show(error.message);
        send.disabled = false;
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.target.id === "cd-input" && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.target.form.requestSubmit();
      }
    });
    root.addEventListener("input", (e) => {
      if (e.target.id !== "cd-input") return;
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
      const live = current && current.live && current.live.state === "LIVE" && current.agentId === me.id;
      if (live && Date.now() - lastTypingSent > 3000) {
        lastTypingSent = Date.now();
        http().post(`/care/threads/${encodeURIComponent(current.id)}/typing`).catch(() => {});
      }
    });
  }

  let live = null;
  /** Put the desk into el (the admin panel's main area). The returned function stops it (live connection, timers). */
  async function mount(el, user) {
    me = user;
    root = document.createElement("div");
    root.className = "cd-wrap";
    el.innerHTML = "";
    el.appendChild(root);
    q = { waiting: [], mine: [], others: [], messages: [], status: {} };
    current = null;
    all = null;
    shell();
    wire();
    drawAll();
    await loadQueue().catch(() => {});
    drawAll();
    live = http().stream("/care/stream", {
      onEvent,
      onOpen() {
        connected = true;
        drawStatus();
        soon(); // (re)connected: catch up
        if (current) openThread(current.id).catch(() => {});
      },
      onDown() {
        connected = false;
        drawStatus();
      },
    });
    // The waiting times on the list and the popup count every second.
    tickTimer = setInterval(() => {
      if (!q.waiting.length) return;
      $$("[data-items] .cd-wait", root).forEach((el, i) => q.waiting[i] && (el.textContent = `⏱ ${waitLeft(q.waiting[i])}`));
      const pop = $("[data-pop] small", root);
      const shown = q.waiting.find((x) => !dismissed.has(x.id));
      if (pop && shown) pop.textContent = `⏱ ${waitLeft(shown)} left`;
    }, 1000);
    return function destroy() {
      if (live) live.close();
      live = null;
      clearInterval(tickTimer);
      clearTimeout(refreshTimer);
      clearTimeout(typingTimer);
      document.title = "FrameX admin";
    };
  }

  FrameX.careDesk = { mount };
})((window.FrameX = window.FrameX || {}));
