/* ==========================================================================
   Admin: messages sent from the Contact page  (#/messages[?status=NEW|READ])

   Every message a visitor sends is kept on the server and listed here, newest
   first, whether or not the alert email could be sent. "Reply by email" opens
   the admin's own email app addressed to the sender; nothing here sends mail.
   Only an ADMIN can read these: the backend checks on every request.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;

  const FILTERS = [["", "All"], ["NEW", "New"], ["READ", "Read"]];
  // What happened to the alert email of a message, in plain words.
  const ALERT = {
    SENT: "Alert email sent",
    PENDING: "Alert email is being sent",
    DEV: "Alert email not sent (development mailbox)",
    NOT_CONFIGURED: "Alert email not sent: no email provider is configured",
    NO_RECIPIENT: "Alert email not sent: no admin address to send it to",
    FAILED: "Alert email not sent: the email provider refused it",
    LIMIT: "Alert email not sent: too many messages this hour",
  };
  const when = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const replyLink = (m) => `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("Re: " + m.subject)}`;

  const row = (m) => `<li class="sd-item ad-item" data-message="${esc(m.id)}">
      <div class="sd-item__main">
        <strong>${esc(m.subject)} ${m.status === "NEW" ? `<span class="sd-status sd-status--pending_review">New</span>` : ""}</strong>
        <span class="sd-item__meta">${esc(m.name)} · <a href="${esc(replyLink(m))}">${esc(m.email)}</a>${m.phone ? ` · <a href="tel:${esc(m.phone.replace(/[^\d+]/g, ""))}">${esc(m.phone)}</a>` : ""}${m.hasAccount ? " · has a FrameX account" : ""} · ${esc(when(m.createdAt))}</span>
        <p style="margin:8px 0 6px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.message)}</p>
        <span class="sd-item__meta">${esc(ALERT[m.alert] || "")}</span>
      </div>
      <div class="sd-item__actions">
        <a class="iu-btn iu-btn--go" href="${esc(replyLink(m))}">${icon("mail")} Reply by email</a>
        <button class="iu-btn" type="button" data-to="${m.status === "NEW" ? "READ" : "NEW"}">${m.status === "NEW" ? "Mark as read" : "Mark as new"}</button>
        <button class="iu-btn iu-btn--danger" type="button" data-delete>${icon("trash")} Delete</button>
      </div></li>`;

  async function list(main, params, { head }) {
    const status = ["NEW", "READ"].includes(params.get("status")) ? params.get("status") : "";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const r = await http().get("/admin/messages", { status, page });
    const link = (p) => `#/messages?${new URLSearchParams({ ...(status ? { status } : {}), page: p })}`;
    const pages = Math.ceil(r.total / r.limit);
    main.innerHTML = `${head("Messages", "What visitors sent from the Contact page. Each one is also emailed to the FrameX admin address; reply from your own email.")}
      <div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter">${FILTERS.map(([id, label]) => `<a class="chip" href="#/messages${id ? `?status=${id}` : ""}" aria-pressed="${status === id}">${esc(label)}${id === "NEW" && r.unread ? ` (${r.unread})` : ""}</a>`).join("")}</div></div>
      ${r.items.length
        ? `<ul class="sd-list">${r.items.map(row).join("")}</ul>`
        : `<div class="sd-empty">${icon("mail")}<strong>${status === "NEW" ? "No new messages" : "No messages yet"}</strong><span>Messages sent from the Contact page appear here.</span></div>`}
      ${pages > 1 ? `<div class="ad-actions" style="margin-top:16px">${page > 1 ? `<a class="btn btn--outline btn--sm" href="${link(page - 1)}">Newer</a>` : ""}<span class="sd-item__meta">Page ${page} of ${pages}</span>${page < pages ? `<a class="btn btn--outline btn--sm" href="${link(page + 1)}">Older</a>` : ""}</div>` : ""}`;
    main.onclick = async (e) => {
      const item = e.target.closest("[data-message]");
      if (!item) return;
      const to = e.target.closest("[data-to]");
      const del = e.target.closest("[data-delete]");
      if (!to && !del) return;
      if (del && !window.confirm("Delete this message for good? This can't be undone.")) return;
      try {
        if (to) await http().post(`/admin/messages/${item.dataset.message}/status`, { status: to.dataset.to });
        else await http().delete(`/admin/messages/${item.dataset.message}`);
        await list(main, params, { head });
        badge();
      } catch (error) {
        FrameX.toast.show(error.message, { duration: 6000 });
      }
    };
  }

  /** The number of new messages, next to "Messages" in the admin menu. */
  async function badge() {
    try {
      const { unread } = await http().get("/admin/messages", { status: "NEW", limit: 1 });
      const label = $('#admin-root .sd-nav a[href="#/messages"] span');
      if (label) label.textContent = unread ? `Messages (${unread})` : "Messages";
    } catch (error) {
      /* the menu simply shows no number */
    }
  }

  FrameX.adminMessages = { list, badge };
})((window.FrameX = window.FrameX || {}));
