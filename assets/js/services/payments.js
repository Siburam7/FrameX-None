/* ==========================================================================
   Online payment in the browser (FrameX.payments).

   The backend decides the amount and creates the payment with the gateway.
   This file only opens the gateway's own checkout window with what the
   backend sent, and afterwards asks the BACKEND what happened; the backend
   asks the gateway. Nothing here can mark anything as paid:

     const result = await FrameX.payments.pay(session, orderNumber);
     // { outcome: "paid" | "failed" | "cancelled" | "pending", order, message? }

     const result = await FrameX.payments.payPainting(session, requestNumber);
     // { outcome: ..., request, message? }   (the advance or the remaining amount of a custom painting)

   `session` comes from the backend (POST /api/checkout/orders,
   POST /api/orders/:n/payments, POST /api/paintings/:n/payments):
     Cashfree  { provider: "cashfree", mode, paymentSessionId, gatewayOrderId, amount, ... }
     Razorpay  { provider: "razorpay", keyId, mode, gatewayOrderId, amount, ... }
   A payment session id names one order and its amount; a Razorpay key id is
   the gateway's public key. No secret ever reaches the browser.

   Card numbers, UPI ids and bank logins are typed into the gateway's window,
   never into a FrameX page.

   Another gateway = one more entry in GATEWAYS with { script, open(session) }.
   ========================================================================== */
(function (FrameX) {
  const http = FrameX.http;

  const scripts = new Map();
  /** Load a gateway's checkout script once. */
  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(
        src,
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = src;
          s.onload = resolve;
          s.onerror = () => {
            scripts.delete(src);
            reject(new Error("load"));
          };
          document.head.appendChild(s);
        }),
      );
    }
    return scripts.get(src);
  }

  /* Each gateway opens its checkout and resolves to what happened IN THE WINDOW:
       { result: "returned", proof: { gatewayOrderId, gatewayPaymentId, signature } }   a signed result (Razorpay)
       { result: "completed" }      the customer went through the window (Cashfree gives no proof)
       { result: "failed", gatewayPaymentId }
       { result: "dismissed" }                                                           */
  const GATEWAYS = {
    cashfree: {
      script: "https://sdk.cashfree.com/js/v3/cashfree.js",
      async open(session) {
        if (!session.paymentSessionId) return { result: "dismissed" };
        const cashfree = window.Cashfree({ mode: session.mode === "live" ? "production" : "sandbox" });
        try {
          // Cashfree's own window, on top of this page. It answers when the window closes.
          const r = await cashfree.checkout({ paymentSessionId: session.paymentSessionId, redirectTarget: "_modal" });
          if (r && r.error) return { result: "dismissed" };
          return { result: "completed" };
        } catch (error) {
          return { result: "dismissed" };
        }
      },
    },
    razorpay: {
      script: "https://checkout.razorpay.com/v1/checkout.js",
      open(session) {
        return new Promise((resolve) => {
          let settled = false;
          const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          const checkout = new window.Razorpay({
            key: session.keyId,
            order_id: session.gatewayOrderId, // carries the amount the backend fixed
            amount: session.amount,
            currency: session.currency,
            name: session.name,
            description: session.description,
            // The way to pay chosen on the FrameX page opens first.
            prefill: Object.assign({}, session.prefill, session.method ? { method: session.method } : {}),
            notes: { reference: session.orderNumber || session.requestNumber },
            theme: { color: "#de832e" },
            // One try per opening: a failure comes back to FrameX, which records it and offers "Retry payment".
            retry: { enabled: false },
            handler: (r) =>
              done({
                result: "returned",
                proof: {
                  gatewayOrderId: r.razorpay_order_id,
                  gatewayPaymentId: r.razorpay_payment_id,
                  signature: r.razorpay_signature,
                },
              }),
            modal: { ondismiss: () => done({ result: "dismissed" }) },
          });
          checkout.on("payment.failed", (r) => {
            const meta = (r && r.error && r.error.metadata) || {};
            done({ result: "failed", gatewayPaymentId: meta.payment_id || "" });
            try {
              checkout.close();
            } catch (error) {
              /* already closed */
            }
          });
          checkout.open();
        });
      },
    },
  };

  /** Open the gateway's window for a session, then tell the backend (at `base`) what the window said. */
  async function run(session, base) {
    const gatewayUi = GATEWAYS[session.provider];
    if (!gatewayUi) return { answer: null, message: "This payment method isn't available here." };
    try {
      await loadScript(gatewayUi.script);
    } catch (error) {
      return { answer: null, message: "The payment window couldn't be loaded. Check your connection and try again." };
    }
    const shown = await gatewayUi.open(session);
    try {
      if (shown.result === "returned") return { answer: await http.post(`${base}/verify`, shown.proof) };
      // Everything else is only what the window said. The backend asks the gateway what really happened.
      return {
        answer: await http.post(`${base}/outcome`, {
          reason: shown.result === "completed" ? "returned" : shown.result === "failed" ? "failed" : "dismissed",
          gatewayPaymentId: shown.gatewayPaymentId || "",
        }),
      };
    } catch (error) {
      // The backend couldn't confirm it just now. Nothing is lost: the page keeps checking.
      return { answer: null, message: error.message };
    }
  }

  /* ---------------------------------------------------------------- Orders */

  const orderBase = (orderNumber) => `/orders/${encodeURIComponent(orderNumber)}/payments`;

  function outcomeOf(order) {
    if (order.paymentStatus === "PAID") return "paid";
    if (order.paymentStatus === "FAILED") return "failed";
    if (order.paymentStatus === "CANCELLED") return "cancelled";
    return "pending";
  }

  /** Ask the backend (which asks the gateway) whether the money has arrived. */
  async function refresh(orderNumber) {
    const r = await http.post(`${orderBase(orderNumber)}/refresh`);
    return { outcome: outcomeOf(r.order), order: r.order };
  }

  /** Open the gateway's checkout for an order and report what the BACKEND concluded. */
  async function pay(session, orderNumber) {
    const { answer, message } = await run(session, orderBase(orderNumber));
    if (!answer) return { outcome: "pending", order: null, message };
    return { outcome: outcomeOf(answer.order), order: answer.order };
  }

  /** "Retry payment" for an order that is waiting: a new attempt on the same order. */
  async function retry(orderNumber, paymentChannel) {
    const r = await http.post(orderBase(orderNumber), paymentChannel ? { paymentChannel } : {});
    if (!r.payment) return { outcome: outcomeOf(r.order), order: r.order }; // it turned out to be paid already
    return pay(r.payment, orderNumber);
  }

  /* ---------------------------------------------------------------- Custom paintings */

  const paintingBase = (number) => `/paintings/${encodeURIComponent(number)}/payments`;

  /** What happened to the stage that was being paid, judged from the request the backend returned. */
  function paintingOutcome(request, stage) {
    // The request moved on (ADVANCE_PAID, READY_FOR_DISPATCH): only a verified payment does that.
    if (request.payable !== stage) return request.status === "CANCELLED" ? "cancelled" : "paid";
    const last = (request.payments || []).filter((p) => p.stage === stage).pop();
    if (last && last.status === "FAILED") return "failed";
    if (last && last.status === "CANCELLED") return "cancelled";
    return "pending";
  }

  /**
   * Pay what is due now on a custom painting (the advance, or the remaining amount).
   * The backend decides which, and how much.
   */
  async function payPainting(number, paymentChannel) {
    const started = await http.post(paintingBase(number), paymentChannel ? { paymentChannel } : {});
    if (!started.payment) return { outcome: "paid", request: started.request }; // it turned out to be paid already
    const { answer, message } = await run(started.payment, paintingBase(number));
    if (!answer) return { outcome: "pending", request: started.request, message };
    return { outcome: paintingOutcome(answer.request, started.payment.stage), request: answer.request };
  }

  async function refreshPainting(number) {
    return (await http.post(`${paintingBase(number)}/refresh`)).request;
  }

  FrameX.payments = { pay, retry, refresh, payPainting, refreshPainting };
})((window.FrameX = window.FrameX || {}));
