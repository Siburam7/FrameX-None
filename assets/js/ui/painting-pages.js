/* ==========================================================================
   A customer's custom painting requests.

     paintings.html          the requests you sent
     painting.html?id=CP-…   one request: where it stands, what is due, its
                             history, your reference photos, and (after it is
                             delivered) your review of the artist

   The page shows what the backend says. What is payable, and how much, is
   decided there from the request's status: this page only offers the button.
   After the payment window closes the page asks the backend what happened;
   it never treats the window's own answer as proof of payment.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const view = () => FrameX.artView;
  const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

  const STATUS = {
    PENDING_ARTIST_RESPONSE: "Waiting for the artist",
    DECLINED: "Declined by the artist",
    ADVANCE_PAYMENT_PENDING: "Accepted: advance to pay",
    ADVANCE_PAID: "Advance paid",
    PAINTING_IN_PROGRESS: "Painting in progress",
    REMAINING_PAYMENT_PENDING: "Completed: remaining amount to pay",
    READY_FOR_DISPATCH: "Fully paid: getting ready to dispatch",
    SHIPPED: "Dispatched",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
  };
  const TONE = { PENDING_ARTIST_RESPONSE: "pending_review", ADVANCE_PAYMENT_PENDING: "pending_review", REMAINING_PAYMENT_PENDING: "pending_review", ADVANCE_PAID: "published", PAINTING_IN_PROGRESS: "published", READY_FOR_DISPATCH: "published", SHIPPED: "published", DELIVERED: "published", DECLINED: "unpublished", CANCELLED: "unpublished" };
  const badge = (status) => `<span class="sd-status sd-status--${TONE[status] || "draft"}">${esc(STATUS[status] || status)}</span>`;
  // The steps a request goes through, in order (a declined or cancelled request stops where it was).
  const TRACK = [
    ["PENDING_ARTIST_RESPONSE", "Request sent"],
    ["ADVANCE_PAYMENT_PENDING", "Accepted by the artist"],
    ["ADVANCE_PAID", "Advance paid"],
    ["PAINTING_IN_PROGRESS", "Painting in progress"],
    ["REMAINING_PAYMENT_PENDING", "Painting completed"],
    ["READY_FOR_DISPATCH", "Fully paid"],
    ["SHIPPED", "Dispatched"],
    ["DELIVERED", "Delivered"],
  ];

  /* ====================================================================== paintings.html */

  async function list() {
    const root = $("#paintings-root");
    if (!root) return;
    const user = await FrameX.auth.guard(["CUSTOMER", "ADMIN", "ARTIST", "SHOP"]);
    if (!user) return;
    root.innerHTML = `<div class="skeleton" style="height:220px"></div>`;
    try {
      const r = await http().get("/paintings", { limit: 50 });
      root.innerHTML = r.items.length
        ? r.items
            .map(
              (p) => `<a class="cp-row" href="${esc(FrameX.qs.paintingUrl(p.requestNumber))}">
              ${view().photo(p.artist)}
              <span><strong>${esc(p.service.size)} ${esc(p.service.artType)}</strong> by ${esc(p.artist.name)}<br><span class="cp-row__meta">${esc(p.requestNumber)} · ${esc(when(p.createdAt))} · ${rupees(p.price)}${p.amountPaid ? ` · ${rupees(p.amountPaid)} paid` : ""}</span></span>
              ${badge(p.status)}
            </a>`,
            )
            .join("")
        : `<div class="state-message"><strong>You haven't asked for a custom painting yet</strong><span>Find an artist, choose a size and type, and send your reference photo. You pay nothing until the artist accepts.</span><a class="btn btn--primary btn--sm" href="art.html">Meet the artists</a></div>`;
    } catch (error) {
      FrameX.templates.showError(root, "Your requests couldn't be loaded.", list);
    }
  }

  /* ====================================================================== painting.html */

  function statusBox(r) {
    const pay = r.payable;
    const tone = pay ? "cp-status--pay" : r.status === "DELIVERED" ? "cp-status--done" : ["DECLINED", "CANCELLED"].includes(r.status) ? "cp-status--closed" : "";
    const actions = [];
    if (pay) actions.push(`<button class="btn btn--primary" type="button" data-pay>${pay === "ADVANCE" ? `Pay the ${r.advancePercent}% advance: ${rupees(r.amountDue)}` : `Pay the remaining ${100 - r.advancePercent}%: ${rupees(r.amountDue)}`}</button>`);
    if (r.canConfirmDelivery) actions.push(`<button class="btn btn--dark" type="button" data-delivered>I have received it</button>`);
    if (r.canCancel) actions.push(`<button class="btn btn--outline" type="button" data-cancel>Cancel this request</button>`);
    const extra = r.status === "DECLINED" && r.declineReason ? `<span>The artist said: “${esc(r.declineReason)}”</span>` : r.status === "CANCELLED" && r.cancelReason ? `<span>${esc(r.cancelReason)}</span>` : r.status === "SHIPPED" && r.dispatchNote ? `<span>${esc(r.dispatchNote)}</span>` : "";
    const refund = r.refundStatus === "REFUND_PENDING" ? `<span>FrameX will contact you about the ${rupees(r.amountPaid)} you paid.</span>` : r.refundStatus === "REFUNDED" ? `<span>Your payment was refunded by FrameX.</span>` : "";
    return `<div class="cp-status ${tone}" role="status"><strong>${esc(r.nextStep)}</strong>${extra}${refund}
      ${pay ? `<span class="pp-muted">You pay in Cashfree's or your bank's own window. FrameX never sees your card or UPI details.</span>` : ""}
      ${actions.length ? `<div class="cp-status__actions">${actions.join("")}</div>` : ""}
      <div class="form-status" data-pay-status role="status" aria-live="polite"></div></div>`;
  }

  function track(r) {
    const closed = ["DECLINED", "CANCELLED"].includes(r.status);
    const at = TRACK.findIndex(([s]) => s === r.status);
    const reached = new Set(r.history.map((h) => h.status).filter(Boolean));
    return `<ol class="cp-track">${TRACK.map(([s, label], i) => {
      const done = closed ? reached.has(s) : i < at || r.status === "DELIVERED";
      const now = !closed && i === at && r.status !== "DELIVERED";
      return `<li class="${done ? "is-done" : now ? "is-now" : ""}">${esc(label)}</li>`;
    }).join("")}${closed ? `<li class="is-now">${esc(STATUS[r.status])}</li>` : ""}</ol>`;
  }

  function splitBox(r) {
    const paid = (stage) => r.payments.some((p) => p.stage === stage && p.status === "PAID");
    return `<div class="cp-split">
      <div class="is-total"><span>${esc(r.service.size)} ${esc(r.service.artType)}</span><strong>${rupees(r.price)}</strong></div>
      <div class="${paid("ADVANCE") ? "is-done" : ""}"><span>Advance (${r.advancePercent}%)</span><strong>${rupees(r.advanceAmount)}</strong></div>
      <div class="${paid("BALANCE") ? "is-done" : ""}"><span>When finished (${100 - r.advancePercent}%)</span><strong>${rupees(r.balanceAmount)}</strong></div>
      <div><span>Paid so far</span><strong>${rupees(r.amountPaid)}</strong></div>
    </div>`;
  }

  async function reviewBox(r) {
    if (r.status !== "DELIVERED") return "";
    let mine = null;
    try {
      const items = (await http().get("/reviews/mine", { sourceType: "PAINTING", sourceId: r.requestNumber })).items;
      mine = items[0] ? items[0].review : null;
    } catch (error) {
      return "";
    }
    const star = (n) => `<input type="radio" name="rating" id="rv-${n}" value="${n}"${mine && mine.rating === n ? " checked" : ""}><label for="rv-${n}" aria-label="${n} ${n === 1 ? "star" : "stars"}">${icon("star")}</label>`;
    return `<section class="art-panel" aria-labelledby="rv-h"><h2 id="rv-h">${mine ? "Your review" : `How was your painting by ${esc(r.artist.name)}?`}</h2>
      <form class="rev-form" data-review novalidate>
        <div class="rev-stars" role="radiogroup" aria-label="Your rating">${[5, 4, 3, 2, 1].map(star).join("")}</div>
        <textarea class="input" name="body" rows="3" maxlength="1500" placeholder="Tell other customers about the painting (optional).">${esc(mine ? mine.body : "")}</textarea>
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--dark btn--sm" type="submit">${mine ? "Update review" : "Post review"}</button></div>
      </form></section>`;
  }

  async function detail() {
    const root = $("#painting-root");
    if (!root) return;
    const user = await FrameX.auth.guard(["CUSTOMER", "ADMIN", "ARTIST", "SHOP"]);
    if (!user) return;
    const number = FrameX.qs.param("id") || "";
    const forms = FrameX.forms;

    async function render(r) {
      document.title = `Painting request ${r.requestNumber} — FrameX`;
      const a = r.deliverTo || {};
      const review = await reviewBox(r);
      root.innerHTML = `<header class="sd-head"><div><h1 class="pp-title">Custom painting ${esc(r.requestNumber)}</h1><p class="sd-lead">${esc(r.service.size)} ${esc(r.service.artType)} by <a href="${esc(FrameX.qs.artistUrl(r.artist))}">${esc(r.artist.name)}</a> · sent ${esc(when(r.createdAt))}</p></div>${badge(r.status)}</header>
        ${FrameX.qs.param("sent") && r.status === "PENDING_ARTIST_RESPONSE" ? `<p class="cp-note" style="margin-bottom:14px">${icon("check")}<span>Your custom painting request has been sent to the artist. We'll tell you here and by email when they answer.</span></p>` : ""}
        ${statusBox(r)}
        <div class="cp-layout" style="margin-top:var(--grid-gap)">
          <div style="display:grid;gap:var(--grid-gap)">
            <section class="art-panel" aria-labelledby="cp-what"><h2 id="cp-what">Your request</h2>
              <dl class="art-facts">
                <div><dt>Artist</dt><dd>${esc(r.artist.name)} (@${esc(r.artist.username)})</dd></div>
                <div><dt>Service</dt><dd>${esc([r.service.title, r.service.medium].filter(Boolean).join(" · "))}</dd></div>
                <div><dt>Size</dt><dd>${esc(r.service.size)}</dd></div>
                ${r.service.estDays ? `<div><dt>Usually takes</dt><dd>About ${r.service.estDays} days after the advance</dd></div>` : ""}
                <div><dt>Your instructions</dt><dd>${r.instructions ? esc(r.instructions) : "None"}</dd></div>
                <div><dt>Deliver to</dt><dd>${esc([a.fullName, a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", "))}</dd></div>
              </dl>
            </section>
            <section class="art-panel" aria-labelledby="cp-photos"><h2 id="cp-photos">Your reference ${r.referencePhotos.length === 1 ? "photo" : "photos"}</h2>
              <ul class="cp-history">${r.referencePhotos.map((p) => `<li><strong>${esc(p.name)}</strong><small>${p.width} × ${p.height} px · ${(p.bytes / 1048576).toFixed(1)} MB · kept exactly as you uploaded it</small><span><button class="iu-btn" type="button" data-photo="${esc(p.id)}">${icon("eye")} View</button></span></li>`).join("")}</ul>
            </section>
            ${review}
          </div>
          <aside style="display:grid;gap:var(--grid-gap)">
            <section class="art-panel" aria-labelledby="cp-price"><h2 id="cp-price">Price</h2>${splitBox(r)}</section>
            <section class="art-panel" aria-labelledby="cp-steps"><h2 id="cp-steps">Progress</h2>${track(r)}</section>
            <section class="art-panel" aria-labelledby="cp-hist"><h2 id="cp-hist">History</h2><ul class="cp-history">${r.history.slice().reverse().map((h) => `<li><span>${esc(h.detail || STATUS[h.status] || "")}</span><small>${esc(when(h.at))}</small></li>`).join("")}</ul></section>
          </aside>
        </div>`;
      wire(r);
    }

    function wire(r) {
      const say = (kind, text) => forms.status($("[data-pay-status]", root), kind, esc(text));
      const payBtn = $("[data-pay]", root);
      if (payBtn)
        payBtn.addEventListener("click", async () => {
          forms.busy(payBtn, true, "Opening the payment window…");
          try {
            const result = await FrameX.payments.payPainting(r.requestNumber);
            if (result.outcome === "paid") return render(result.request);
            forms.busy(payBtn, false);
            if (result.request) await render(result.request);
            const box = $("[data-pay-status]", root);
            const text = result.outcome === "failed" ? "The payment didn't go through. Nothing was charged: you can try again." : result.outcome === "cancelled" ? "The payment window was closed before paying. Nothing was charged." : result.message || "We're still confirming your payment with the bank. This page will update: please don't pay again.";
            if (box) forms.status(box, result.outcome === "pending" ? "info" : "error", esc(text));
          } catch (error) {
            forms.busy(payBtn, false);
            say("error", error.message);
          }
        });
      const cancel = $("[data-cancel]", root);
      if (cancel)
        cancel.addEventListener("click", async () => {
          if (!cancel.classList.contains("is-confirming")) {
            cancel.classList.add("is-confirming");
            cancel.textContent = "Tap again to cancel the request";
            return;
          }
          try {
            render((await http().post(`/paintings/${encodeURIComponent(r.requestNumber)}/cancel`, { reason: "Cancelled by the customer." })).request);
          } catch (error) {
            say("error", error.message);
          }
        });
      const got = $("[data-delivered]", root);
      if (got)
        got.addEventListener("click", async () => {
          try {
            render((await http().post(`/paintings/${encodeURIComponent(r.requestNumber)}/delivered`)).request);
          } catch (error) {
            say("error", error.message);
          }
        });
      root.querySelectorAll("[data-photo]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          try {
            const { link } = await http().post(`/paintings/${encodeURIComponent(r.requestNumber)}/photos/${btn.dataset.photo}/link`, { download: false });
            window.open(http().fileUrl(link.path), "_blank", "noopener");
          } catch (error) {
            FrameX.toast.show(error.message);
          }
        }),
      );
      const reviewForm = $("[data-review]", root);
      if (reviewForm)
        reviewForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const box = $(".form-status", reviewForm);
          const rating = Number(new FormData(reviewForm).get("rating"));
          if (!rating) return forms.status(box, "error", "Choose 1 to 5 stars.");
          try {
            await http().post("/reviews", { targetType: "ARTIST", targetId: r.artist.artistCode, sourceType: "PAINTING", sourceId: r.requestNumber, rating, body: reviewForm.body.value });
            forms.status(box, "success", "Thank you. Your review is on the artist's profile.");
          } catch (error) {
            forms.status(box, "error", esc(error.message));
          }
        });
    }

    root.innerHTML = `<div class="skeleton" style="height:320px"></div>`;
    try {
      let r = (await http().get(`/paintings/${encodeURIComponent(number)}`)).request;
      // Coming back from the bank's page, or reloading while a payment is being confirmed: ask the server.
      if (r.payable) r = await FrameX.payments.refreshPainting(r.requestNumber).catch(() => r);
      await render(r);
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      root.innerHTML = `<div class="not-found">${icon("alert")}<h1 class="section-title">We couldn't find that request</h1><p class="section-lead">Check the link, or look at all your requests.</p><a class="btn btn--dark" href="paintings.html">Your painting requests</a></div>`;
    }
  }

  FrameX.paintingsPage = { init: list };
  FrameX.paintingPage = { init: detail };
  FrameX.paintingView = { STATUS, TONE, badge, when, rupees };
})((window.FrameX = window.FrameX || {}));
