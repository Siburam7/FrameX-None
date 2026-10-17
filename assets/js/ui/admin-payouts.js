/* ==========================================================================
   Admin dashboard: payouts to shops and artists (admin.html #/payouts).

     #/payouts                      every shop and artist: what FrameX owes
                                    them now, their payout account (masked)
     #/payouts/<shop|artist>/<id>   one seller: their payout account IN FULL
                                    (to copy into the bank or UPI app; the
                                    look is written to the audit log), the
                                    orders in the amount, and "Record payout"

   FrameX pays outside the site (bank transfer or UPI), then records the
   payment here with the bank's reference. The backend works the amount out
   again when it is recorded and refuses if it changed meanwhile.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const forms = () => FrameX.forms;
  const P = () => FrameX.payoutPanel;

  const TYPE = { shop: "Shop", artist: "Artist" };
  const settingsNote = (r) => `Commission: shops ${esc(r.commissionPercent)}%, artists ${esc(r.artistCommissionPercent)}%; payout charge ${esc(r.feePercent)}%. Change them in <a href="#/settings">Settings</a>.`;
  const notReady = `<p class="wz-note">${icon("alert")}<span><strong>Payout accounts can't be saved yet.</strong> Set PAYOUT_ENCRYPTION_KEY on the server (see backend/README.md, Payouts), then restart it.</span></p>`;

  async function list(main, { head }) {
    const r = await http().get("/admin/payouts");
    const rs = P().rs;
    const owed = r.sellers.filter((s) => s.payable);
    main.innerHTML = `${head("Payouts", "What FrameX owes each shop and artist for delivered orders, and the payouts made.")}
      ${r.ready ? "" : notReady}
      <p class="sd-item__meta">${settingsNote(r)}</p>
      <section><h2 class="adm-subtitle">${owed.length ? `${owed.length} to pay` : "Nobody to pay right now"}</h2>
        <div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Seller</th><th scope="col">Payout account</th><th scope="col">Due now</th><th scope="col">Orders</th><th scope="col"></th></tr></thead><tbody>
        ${r.sellers
          .map(
            (s) => `<tr><td><strong>${esc(s.name)}</strong><br><span class="sd-item__meta">${TYPE[s.type]} · <code>${esc(s.code)}</code></span></td>
              <td>${s.account ? `${esc(P().METHOD[s.account.method][0])}<br><span class="sd-item__meta">${esc(s.account.hint)}</span>` : '<span class="sd-item__meta">Not added yet</span>'}</td>
              <td><strong${s.amount < 0 ? ' class="po-owes"' : ""}>${s.amount < 0 ? `Owes ${esc(rs(-s.amount))}` : esc(rs(s.amount))}</strong></td>
              <td>${s.orders}</td>
              <td><a class="iu-btn" href="#/payouts/${esc(s.type)}/${esc(s.id)}">${s.payable ? `${icon("wallet")} Pay` : "Open"}</a></td></tr>`
          )
          .join("")}
        </tbody></table></div>
      </section>
      <section><h2 class="adm-subtitle">Last payouts</h2>
        ${
          r.recent.length
            ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Payout</th><th scope="col">Seller</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Reference</th></tr></thead><tbody>
          ${r.recent.map((p) => `<tr><td><code>${esc(p.number)}</code></td><td><a href="#/payouts/${esc(p.seller.type)}/${esc(p.seller.id)}">${esc(p.seller.name)}</a></td><td>${esc(P().when(p.paidAt))}</td><td><strong>${esc(rs(p.amount))}</strong></td><td><code>${esc(p.reference)}</code></td></tr>`).join("")}
          </tbody></table></div>`
            : `<p class="sd-item__meta">No payouts recorded yet.</p>`
        }
      </section>`;
  }

  /** One value to copy into the bank or UPI app. */
  const copyRow = (label, value) =>
    value ? `<div><span class="sd-item__meta">${esc(label)}</span><code>${esc(value)}</code><button class="iu-btn" type="button" data-copy-value="${esc(value)}">${icon("copy")} Copy</button></div>` : "";

  function accountHtml(a) {
    if (!a) return `<p>This seller hasn't added a payout account yet. Ask them to add one in their dashboard, under Payouts.</p>`;
    if (!a.readable) return `<p class="wz-note">${icon("alert")}<span>The account (${esc(a.hint)}) can't be read with the server's PAYOUT_ENCRYPTION_KEY. Ask the seller to enter it again.</span></p>`;
    const d = a.details;
    return `<div class="po-reveal">
        <p class="po-account-now__method">${icon(P().METHOD[a.method][1])} <strong>${esc(P().METHOD[a.method][0])}</strong></p>
        ${copyRow("Name", a.holderName)}
        ${a.method === "UPI" ? copyRow("UPI ID", d.upiId) : `${copyRow("Account number", d.accountNumber)}${copyRow("IFSC", d.ifsc)}${copyRow("Bank", d.bankName)}`}
        <p class="sd-item__meta">Saved ${esc(P().when(a.updatedAt))}. Opening this page is written to the activity log.</p>
      </div>`;
  }

  async function detail(main, type, id, { head }) {
    const r = await http().get(`/admin/payouts/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
    render(main, r, { head, type, id });
  }

  function render(main, r, ctx) {
    const { seller, account, due: d } = r;
    const rs = P().rs;
    const canPay = d.payable && account && account.readable;
    main.innerHTML = `<a class="wz-back" href="#/payouts">${icon("chev-left")} All payouts</a>
      ${ctx.head(seller.name, `${TYPE[seller.type]} · <code>${esc(seller.code)}</code>${seller.phone ? ` · ${esc(seller.phone)}` : ""}`)}
      <div class="po-grid">
        <section class="sd-card po-due"><h2>Due now</h2>
          <p class="sd-card__big${d.amount < 0 ? " po-owes" : ""}">${d.amount < 0 ? `Owes ${esc(rs(-d.amount))}` : esc(rs(d.amount))}</p>
          ${d.amount < 0 ? "<p>FrameX's commission on their Cash on Delivery sales is more than the online money FrameX holds for them. It is taken from their next online sales.</p>" : ""}
          ${d.sales ? P().rowsHtml(d, d.amount < 0 ? "They owe" : "Pay them") : "<p>No delivered orders waiting.</p>"}
          ${
            d.orders.length
              ? `<details class="po-orders"><summary>${d.orders.length} ${d.orders.length === 1 ? "order" : "orders"}</summary><ul class="sd-item__meta">${d.orders.map((o) => `<li><a href="#/${o.kind === "PAINTING" ? "paintings" : "orders"}/${esc(o.ref)}">${esc(o.ref)}</a> · ${o.payment === "COD" ? "Cash on Delivery" : "Online"} · ${esc(rs(o.sales))}</li>`).join("")}</ul></details>`
              : ""
          }
        </section>
        <section class="sd-card po-account"><h2>Payout account</h2>${r.ready ? "" : notReady}${accountHtml(account)}</section>
      </div>
      <section><h2 class="adm-subtitle">Record a payout</h2>
        ${
          canPay
            ? `<form class="form-grid" data-record novalidate>
            <p>Send exactly <strong>${esc(rs(d.amount))}</strong> to the account above from FrameX's bank or UPI app. Then enter the reference the bank gave you and record it.</p>
            ${forms().field("reference", "Payment reference (UTR / UPI reference)", { prefix: "pr", required: true, maxlength: 60, autocomplete: "off" })}
            ${forms().field("note", "Note (the seller sees it)", { prefix: "pr", maxlength: 300, placeholder: "e.g. Week of 12 October" })}
            <div class="form-status" role="status" aria-live="polite"></div>
            <div><button class="btn btn--primary" type="submit">${icon("check")} Record payout of ${esc(rs(d.amount))}</button></div>
          </form>`
            : `<p class="sd-item__meta">${!account ? "They need a payout account first." : !account.readable ? "Their payout account can't be read: they need to enter it again." : d.amount < 0 ? "Nothing to pay: they owe FrameX for now." : "Nothing to pay right now."}</p>`
        }
      </section>
      <section><h2 class="adm-subtitle">Payouts made</h2>
        ${
          r.payouts.length
            ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Payout</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Sent to</th><th scope="col">Reference</th></tr></thead><tbody>
          ${r.payouts.map((p) => `<tr><td><code>${esc(p.number)}</code><details class="po-orders"><summary>Details</summary>${P().rowsHtml(p, "Sent")}<p class="sd-item__meta">Orders: ${esc(p.refs.join(", "))}</p></details></td><td>${esc(P().when(p.paidAt))}</td><td><strong>${esc(rs(p.amount))}</strong></td><td><span class="sd-item__meta">${esc(p.accountHint)}</span></td><td><code>${esc(p.reference)}</code></td></tr>`).join("")}
          </tbody></table></div>`
            : `<p class="sd-item__meta">None yet.</p>`
        }
      </section>`;

    main.onclick = async (e) => {
      const btn = e.target.closest("[data-copy-value]");
      if (!btn) return;
      try {
        await navigator.clipboard.writeText(btn.dataset.copyValue);
        FrameX.toast.show("Copied.");
      } catch (error) {
        const code = btn.previousElementSibling;
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        FrameX.toast.show("Selected: copy it with Ctrl+C.");
      }
    };
    const form = $("[data-record]", main);
    if (form)
      forms().handle(form, {
        busyLabel: "Recording…",
        send: (v) => http().post(`/admin/payouts/${encodeURIComponent(ctx.type)}/${encodeURIComponent(ctx.id)}`, { expectedAmount: d.amount, reference: v.reference.trim(), note: v.note.trim() }),
        async onSuccess(result) {
          FrameX.toast.show(`Payout ${result.payout.number} recorded. ${seller.name} was emailed.`);
          await detail(main, ctx.type, ctx.id, ctx);
        },
      });
  }

  FrameX.adminPayouts = { list, detail };
})((window.FrameX = window.FrameX || {}));
