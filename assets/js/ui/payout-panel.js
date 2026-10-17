/* ==========================================================================
   "Payouts" in a seller's dashboard (shop-dashboard.html #/payouts and
   artist-dashboard.html #/payouts):

     - what is due to them now, and how it is worked out (their sales, of which
       paid online, their part of delivery / gift wrap / tax, FrameX's
       commission, the payout charge); a seller with only Cash on Delivery
       sales owes FrameX its commission instead;
     - where FrameX sends their money: a bank account or a UPI ID. Saving or
       changing it needs their password; the page only ever shows a masked
       hint (the backend never sends the full number back);
     - every payout so far, with its reference.

   The numbers all come from the backend (GET <base>/payouts), which works
   them out; this page only shows them.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const forms = () => FrameX.forms;

  const rs = (n) => (Number(n) < 0 ? "−₹" : "₹") + Math.abs(Number(n)).toLocaleString("en-IN");
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
  const METHOD = { BANK: ["Bank account", "bank"], UPI: ["UPI", "phone"] };

  /** The sums as label / amount rows (shared with the admin's payout page). */
  function rows(d) {
    const pct = (n) => `${Number(n).toLocaleString("en-IN")}%`;
    return [
      ["Your sales (delivered, not paid out yet)", rs(d.sales)],
      ["   of which paid online (FrameX holds this)", rs(d.onlineSales), "sub"],
      ["   Cash on Delivery (the cash is with you)", rs(d.codSales), "sub"],
      ["+ Your part of delivery, gift wrap and tax (online orders)", rs(d.extras)],
      [`− FrameX commission (${pct(d.commissionPercent)} of all your sales)`, rs(-d.commission)],
      [`− Payout charge (${pct(d.feePercent)})`, rs(-d.fee)],
    ];
  }
  const rowsHtml = (d, total) =>
    `<dl class="po-rows">${rows(d)
      .map(([label, value, kind]) => `<div${kind ? ` class="po-rows__${kind}"` : ""}><dt>${esc(label.trim())}</dt><dd>${esc(value)}</dd></div>`)
      .join("")}<div class="po-rows__total"><dt>${esc(total)}</dt><dd>${esc(rs(d.amount))}</dd></div></dl>`;

  const ordersHtml = (orders) =>
    orders.length
      ? `<details class="po-orders"><summary>${orders.length} ${orders.length === 1 ? "order" : "orders"} in this amount</summary>
          <div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Order</th><th scope="col">Delivered</th><th scope="col">Payment</th><th scope="col">Your sale</th></tr></thead><tbody>
          ${orders.map((o) => `<tr><td><code>${esc(o.ref)}</code>${o.kind === "PAINTING" ? ' <span class="sd-item__meta">custom painting</span>' : ""}</td><td>${esc(when(o.date))}</td><td>${o.payment === "COD" ? "Cash on Delivery" : "Online"}</td><td>${esc(rs(o.sales))}${o.extras ? ` <span class="sd-item__meta">+ ${esc(rs(o.extras))}</span>` : ""}</td></tr>`).join("")}
          </tbody></table></div></details>`
      : "";

  function dueCard(d) {
    let big;
    let lead;
    if (d.amount > 0) {
      big = rs(d.amount);
      lead = "FrameX sends this to your payout account in the next payout.";
    } else if (d.amount < 0) {
      big = `You owe ${rs(-d.amount)}`;
      lead = "This is FrameX's commission on your Cash on Delivery sales (that cash is with you). It is taken from your next online sales.";
    } else {
      big = rs(0);
      lead = d.sales ? "Nothing to send yet." : "Orders count here once they are delivered.";
    }
    return `<section class="sd-card po-due" aria-labelledby="po-due-title">
      <h2 id="po-due-title">Due to you now</h2>
      <p class="sd-card__big${d.amount < 0 ? " po-owes" : ""}">${esc(big)}</p>
      <p>${esc(lead)}</p>
      ${d.sales ? rowsHtml(d, d.amount < 0 ? "You owe FrameX" : "You get") : ""}
      ${ordersHtml(d.orders || [])}
    </section>`;
  }

  function accountSummary(a) {
    const [label, ic] = METHOD[a.method] || [a.method, "wallet"];
    return `<div class="po-account-now">
        <p class="po-account-now__method">${icon(ic)} <strong>${esc(label)}</strong></p>
        <p><span class="sd-item__meta">Name</span><br>${esc(a.holderName)}</p>
        <p><span class="sd-item__meta">${a.method === "UPI" ? "UPI ID" : "IFSC and account"}</span><br><code>${esc(a.hint)}</code></p>
        <p class="sd-item__meta">Saved ${esc(when(a.updatedAt))}</p>
      </div>`;
  }

  function formHtml(a) {
    const f = forms().field;
    const o = { prefix: "po" };
    const upi = a && a.method === "UPI";
    return `<form class="form-grid" data-payout-form novalidate>
      <fieldset class="po-method"><legend>How you get paid</legend>
        <label class="po-choice"><input type="radio" name="method" value="BANK"${upi ? "" : " checked"}><span>${icon("bank")} Bank account</span></label>
        <label class="po-choice"><input type="radio" name="method" value="UPI"${upi ? " checked" : ""}><span>${icon("phone")} UPI</span></label>
      </fieldset>
      ${f("holderName", "Account holder's name", { ...o, required: true, maxlength: 80, autocomplete: "name", value: a ? a.holderName : "", hint: "As the bank or UPI app has it." })}
      <div class="form-grid" data-bank${upi ? " hidden" : ""}>
        ${f("accountNumber", "Account number", { ...o, required: true, inputmode: "numeric", maxlength: 24, autocomplete: "off" })}
        ${f("confirmAccountNumber", "Account number again", { ...o, required: true, inputmode: "numeric", maxlength: 24, autocomplete: "off" })}
        <div class="form-grid form-grid--2">
          ${f("ifsc", "IFSC", { ...o, required: true, maxlength: 11, autocomplete: "off", placeholder: "HDFC0001234", hint: "On your passbook or cheque book." })}
          ${f("bankName", "Bank name", { ...o, maxlength: 80, placeholder: "e.g. State Bank of India" })}
        </div>
      </div>
      <div class="form-grid" data-upi${upi ? "" : " hidden"}>
        ${f("upiId", "UPI ID", { ...o, required: true, maxlength: 120, autocomplete: "off", placeholder: "9876543210@ybl", hint: "In your UPI app (Google Pay, PhonePe, Paytm…) under your profile." })}
      </div>
      ${f("password", "Your password", { ...o, required: true, type: "password", toggle: true, autocomplete: "current-password", hint: "Changes need your password. We email you every time your payout account changes." })}
      <div class="form-status" role="status" aria-live="polite"></div>
      <div class="po-actions"><button class="btn btn--primary" type="submit">Save payout account</button>${a ? '<button class="btn btn--outline" type="button" data-cancel>Cancel</button>' : ""}</div>
    </form>`;
  }

  function accountCard(data) {
    const a = data.account;
    const notReady = `<p class="wz-note">${icon("alert")}<span>Payout accounts can't be saved yet: FrameX is still setting this up. Please try again later.</span></p>`;
    return `<section class="sd-card po-account" aria-labelledby="po-account-title" data-account>
      <h2 id="po-account-title">Payout account</h2>
      ${a ? accountSummary(a) : `<p>Where should FrameX send your money? Add a bank account or a UPI ID.</p>`}
      ${a ? `<div class="po-actions"><button class="btn btn--outline btn--sm" type="button" data-change>${icon("edit")} Change</button></div>` : ""}
      <div data-form-slot>${a ? "" : data.ready ? formHtml(null) : notReady}</div>
      <p class="sd-item__meta po-terms">FrameX keeps ${esc(data.due.commissionPercent)}% commission on each sale and takes a ${esc(data.due.feePercent)}% payout charge from each payout.</p>
    </section>`;
  }

  function historyHtml(payouts) {
    return `<section class="po-history" aria-labelledby="po-history-title">
      <h2 id="po-history-title">Payouts so far</h2>
      ${
        payouts.length
          ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Payout</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Sent to</th><th scope="col">Reference</th></tr></thead><tbody>
            ${payouts
              .map(
                (p) => `<tr><td><code>${esc(p.number)}</code><details class="po-orders"><summary>Details</summary>${rowsHtml(p, "Sent")}<p class="sd-item__meta">Orders: ${esc(p.refs.join(", "))}</p>${p.note ? `<p class="sd-item__meta">Note: ${esc(p.note)}</p>` : ""}</details></td>
                  <td>${esc(when(p.paidAt))}</td><td><strong>${esc(rs(p.amount))}</strong></td><td>${esc((METHOD[p.method] || [p.method])[0])}<br><span class="sd-item__meta">${esc(p.accountHint)}</span></td><td><code>${esc(p.reference)}</code></td></tr>`
              )
              .join("")}
            </tbody></table></div>`
          : `<div class="sd-empty">${icon("wallet")}<strong>No payouts yet</strong><span>Each payout FrameX sends you appears here, with how it was worked out.</span></div>`
      }
    </section>`;
  }

  function render(main, data, ctx) {
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Payouts</h1><p class="sd-lead">What is due to you, where FrameX sends it, and every payout so far.</p></div></header>
      <div class="po-grid">${dueCard(data.due)}${accountCard(data)}</div>
      ${historyHtml(data.payouts || [])}`;
    const card = $("[data-account]", main);
    const slot = $("[data-form-slot]", card);
    const wire = () => {
      const form = $("[data-payout-form]", slot);
      if (!form) return;
      const sync = () => {
        const upi = form.elements.method.value === "UPI";
        $("[data-bank]", form).hidden = upi;
        $("[data-upi]", form).hidden = !upi;
      };
      $$('input[name="method"]', form).forEach((r) => r.addEventListener("change", sync));
      const cancel = $("[data-cancel]", form);
      if (cancel) cancel.addEventListener("click", () => render(main, data, ctx));
      forms().handle(form, {
        busyLabel: "Saving…",
        send: (v) => http().put(`${ctx.base}/payout-account`, v),
        onSuccess(result) {
          render(main, result, ctx);
          FrameX.toast.show(data.account ? "Payout account changed. We emailed you about it." : "Payout account saved.");
        },
      });
    };
    const change = $("[data-change]", card);
    if (change)
      change.addEventListener("click", () => {
        slot.innerHTML = data.ready ? formHtml(data.account) : `<p class="wz-note">${icon("alert")}<span>Payout accounts can't be changed right now: FrameX is still setting this up.</span></p>`;
        change.hidden = true;
        wire();
        const first = $("input:not([type=radio])", slot);
        if (first) first.focus();
      });
    wire();
  }

  /** main: the dashboard's section; base: the API path ("/shops/FRX-SHOP-1001" or "/artist"). */
  async function show(main, { base }) {
    const data = await http().get(`${base}/payouts`);
    render(main, data, { base });
  }

  FrameX.payoutPanel = { show, rows, rowsHtml, rs, when, METHOD };
})((window.FrameX = window.FrameX || {}));
