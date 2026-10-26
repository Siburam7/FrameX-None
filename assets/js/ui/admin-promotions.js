/* ==========================================================================
   Admin -> Promotions (owner, 2026-10-26): the home page's picture banners
   and the promotion strips (backend services/promotion-service.js).

     #/promotions             every place, its promotions in order: on / off,
                              up / down, edit, delete
     #/promotions/new?place=  a new one
     #/promotions/<id>        change one

   A promotion is a picture with its words and button drawn in (made in
   Canva or similar): a laptop picture and, if wanted, a phone picture.
   The server turns an upload into a WebP no wider than the place needs.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const forms = () => FrameX.forms;
  const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif,.avif";

  const STATE = { LIVE: ["Live", "badge--open"], OFF: ["Off", "badge--muted"], SCHEDULED: ["Starts later", "badge--accent"], ENDED: ["Ended", "badge--muted"], NO_PICTURE: ["No picture yet", "badge--closed"] };
  const dayText = (iso) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  const days = (p) => (p.startsOn && p.endsOn ? `${dayText(p.startsOn)} – ${dayText(p.endsOn)}` : p.startsOn ? `From ${dayText(p.startsOn)}` : p.endsOn ? `Until ${dayText(p.endsOn)}` : "Always");
  const hideText = (p) => (p.hideWhen.startsWith("COUPON:") ? `Hides when coupon ${esc(p.hideWhen.slice(7))} ends` : p.hideWhen === "FIRST_ORDER_FREE" ? "Hides when first-order free delivery is off" : "");
  const src = (path) => esc(http().asset(path));
  const sizeText = (place) => `laptop ${place.laptop[0]} × ${place.laptop[1]} · phone ${place.phone[0]} × ${place.phone[1]}`;

  /* ---------------------------------------------------------------- The list */
  async function list(main, { head }) {
    const draw = ({ items, placements }) => {
      const count = (s) => items.filter((p) => p.state === s).length;
      main.innerHTML = `${head("Promotions", "The banners and strips on the website. Each one is a picture with its words drawn in, a link, and where it is shown. Changes show on the website within a minute.", `<a class="btn btn--primary btn--sm" href="#/promotions/new">${icon("plus")} New promotion</a>`)}
        <div class="pr-sum"><span>${count("LIVE")} live</span><span>${count("SCHEDULED")} start later</span><span>${count("OFF") + count("ENDED") + count("NO_PICTURE")} not shown</span></div>
        ${Object.entries(placements)
          .map(([id, place]) => {
            const mine = items.filter((p) => p.placement === id);
            return `<section class="account-card pr-group">
              <div class="pr-group__head"><h2>${esc(place.label)} <span class="badge badge--muted">${mine.length}</span><small>Picture size: ${sizeText(place)}</small></h2>
                <a class="btn btn--outline btn--sm" href="#/promotions/new?place=${encodeURIComponent(id)}">${icon("plus")} Add here</a></div>
              ${mine.length ? mine.map((p, i) => row(p, i, mine.length)).join("") : `<p class="pp-muted pr-empty">Nothing here: this place is empty on the website.</p>`}
            </section>`;
          })
          .join("")}`;
    };
    const row = (p, i, n) => {
      const [label, tone] = STATE[p.state] || STATE.OFF;
      return `<div class="pr-row${p.state === "LIVE" ? "" : " pr-row--off"}" data-promo="${esc(p.id)}">
        <div class="pr-thumb pr-thumb--${esc(p.kind)}">${p.laptop ? `<img src="${src(p.laptop)}" alt="" loading="lazy">` : `<span>${icon("image")}</span>`}</div>
        <div class="pr-info"><span class="badge ${tone}">${label}</span><strong>${esc(p.title)}</strong>
          <div class="pr-meta"><span>Link: <code>${esc(p.link || "none")}</code></span><span>Days: ${days(p)}</span>${hideText(p) ? `<span>${hideText(p)}</span>` : ""}${p.hasPhonePicture ? "" : "<span>Phone: uses the laptop picture</span>"}</div></div>
        <div class="pr-acts">
          <button class="pr-ic" type="button" data-act="up" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button>
          <button class="pr-ic" type="button" data-act="down" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>↓</button>
          <a class="btn btn--outline btn--sm" href="#/promotions/${esc(p.id)}">Edit</a>
          <button class="btn btn--outline btn--sm" type="button" data-act="toggle" data-on="${p.active ? "0" : "1"}">${p.active ? "Switch off" : "Switch on"}</button>
          <button class="btn btn--outline btn--sm pr-del" type="button" data-act="delete">Delete</button>
        </div>
      </div>`;
    };
    draw(await http().get("/admin/promotions"));
    main.onclick = async (e) => {
      const button = e.target.closest("[data-act]");
      const card = button && button.closest("[data-promo]");
      if (!card) return;
      const id = card.dataset.promo;
      const act = button.dataset.act;
      try {
        if (act === "up" || act === "down") draw(await http().post(`/admin/promotions/${encodeURIComponent(id)}/move`, { direction: act }));
        if (act === "toggle") {
          await http().patch(`/admin/promotions/${encodeURIComponent(id)}`, { active: button.dataset.on === "1" });
          draw(await http().get("/admin/promotions"));
          FrameX.toast.show(button.dataset.on === "1" ? "Switched on." : "Switched off: it no longer shows on the website.");
        }
        if (act === "delete") {
          if (!window.confirm("Delete this promotion and its pictures? This can't be undone. (To hide it for now, use Switch off.)")) return;
          draw(await http().delete(`/admin/promotions/${encodeURIComponent(id)}`));
          FrameX.toast.show("Deleted.");
        }
      } catch (error) {
        FrameX.toast.show(error.message || "That didn't work. Please try again.");
      }
    };
  }

  /* ---------------------------------------------------------------- New / change */
  async function edit(main, id, params, { head }) {
    const { items, placements } = await http().get("/admin/promotions");
    const p = id ? items.find((x) => x.id === id) : null;
    if (id && !p) throw Object.assign(new Error("not found"), { status: 404 });
    const place = p ? p.placement : placements[params.get("place")] ? params.get("place") : "home-after-banners";
    const rule = p ? p.hideWhen : "";
    const coupon = rule.startsWith("COUPON:") ? rule.slice(7) : "";
    main.innerHTML = `${head(p ? "Change promotion" : "New promotion", "Make the picture with its words and button drawn in (Canva or similar works), then upload it here.", `<a class="btn btn--outline btn--sm" href="#/promotions">← Back to Promotions</a>`)}
      <div class="pr-form">
        <form class="account-card form-grid" id="promo-form" novalidate>
          <div class="form-field"><label for="pr-place">Where is it shown?</label>
            <select class="input" id="pr-place" name="placement"${p ? " disabled" : ""}>${Object.entries(placements).map(([k, v]) => `<option value="${k}"${k === place ? " selected" : ""}>${esc(v.label)} (${sizeText(v)})</option>`).join("")}</select>
            ${p ? `<small class="pp-muted">To show it somewhere else, make a new promotion there.</small>` : ""}</div>
          ${picker("laptop", "Laptop picture", p && p.laptop, !p)}
          ${picker("phone", "Phone picture", p && p.hasPhonePicture ? p.phone : null, false)}
          ${forms().field("title", "What the picture says", { required: true, maxlength: 200, prefix: "pr", value: p ? p.title : "", hint: "Customers don't see this text; screen readers and Google read it. Write what is on the picture." })}
          ${forms().field("link", "Opens when clicked", { prefix: "pr", value: p ? p.link : "", placeholder: "shop.html", hint: "A page of the website (shop.html, studio.html, shop-detail.html?id=FRX-SHOP-1001) or a full https:// address." })}
          <div class="pr-days">
            ${forms().field("startsOn", "First day", { type: "date", prefix: "pr", value: p && p.startsOn ? p.startsOn : "" })}
            ${forms().field("endsOn", "Last day", { type: "date", prefix: "pr", value: p && p.endsOn ? p.endsOn : "" })}
          </div>
          <fieldset class="form-field pr-radio" data-hide><legend>Hide it by itself</legend>
            <label><input type="radio" name="hide" value=""${!rule ? " checked" : ""}> Never</label>
            <label><input type="radio" name="hide" value="COUPON"${coupon ? " checked" : ""}> When this coupon ends: <input class="input" type="text" name="coupon" maxlength="40" value="${esc(coupon)}" placeholder="XUSE10" aria-label="Coupon code"></label>
            <label><input type="radio" name="hide" value="FIRST_ORDER_FREE"${rule === "FIRST_ORDER_FREE" ? " checked" : ""}> When “free delivery on the first order” is switched off</label>
            <p class="form-field__error">${icon("alert")}<span></span></p>
          </fieldset>
          <label class="wz-check"><input type="checkbox" name="active"${!p || p.active ? " checked" : ""}> On: shown on the website</label>
          <div class="form-status" role="status" aria-live="polite"></div>
          <div class="pr-buttons"><button class="btn btn--primary" type="submit">${p ? "Save changes" : "Save promotion"}</button><a class="btn btn--outline" href="#/promotions">Cancel</a></div>
        </form>
        <div class="account-card pr-prev"><h2>How it looks</h2>
          <h3>Laptop</h3><div class="pr-laptop"><img data-prev="laptop" alt=""${p && p.laptop ? ` src="${src(p.laptop)}"` : ""}></div>
          <h3>Phone</h3><div class="pr-phone"><img data-prev="phone" alt=""${p && p.phone ? ` src="${src(p.phone)}"` : ""}></div>
          <p class="pp-muted" data-prev-note></p>
        </div>
      </div>`;

    const form = $("#promo-form", main);
    const chosen = { laptop: null, phone: null };
    const currentPlace = () => placements[form.elements.placement.value];
    const note = () => {
      const f = form.elements;
      const when = f.startsOn.value && f.endsOn.value ? `from ${dayText(f.startsOn.value)} to ${dayText(f.endsOn.value)}` : f.startsOn.value ? `from ${dayText(f.startsOn.value)}` : f.endsOn.value ? `until ${dayText(f.endsOn.value)}` : "every day";
      const hide = f.hide.value === "COUPON" && f.coupon.value.trim() ? `, and only while coupon ${esc(f.coupon.value.trim().toUpperCase())} can be used` : f.hide.value === "FIRST_ORDER_FREE" ? ", and only while first-order free delivery is on" : "";
      $("[data-prev-note]", main).innerHTML = f.active.checked ? `Shown in “${esc(currentPlace().label)}”, ${when}${hide}.` : "Off: not shown on the website.";
    };
    const shapes = () => {
      const pl = currentPlace();
      $("[data-prev=laptop]", main).style.aspectRatio = `${pl.laptop[0]} / ${pl.laptop[1]}`;
      $("[data-prev=phone]", main).style.aspectRatio = `${pl.phone[0]} / ${pl.phone[1]}`;
      main.querySelectorAll("[data-size-for]").forEach((s) => (s.textContent = `${pl[s.dataset.sizeFor][0]} × ${pl[s.dataset.sizeFor][1]} px`));
    };
    shapes();
    note();
    form.addEventListener("input", note);
    form.addEventListener("change", (e) => {
      if (e.target.name === "placement") shapes();
      if (e.target.name === "coupon") form.querySelector('[name=hide][value="COUPON"]').checked = true;
      const which = e.target.dataset.pick;
      if (!which) return note();
      const file = e.target.files[0];
      chosen[which] = file || null;
      const facts = $(`[data-facts=${which}]`, main);
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const want = currentPlace()[which];
        const right = Math.abs(img.naturalWidth / img.naturalHeight - want[0] / want[1]) / (want[0] / want[1]) <= 0.08;
        facts.innerHTML = `${esc(file.name)} · ${img.naturalWidth} × ${img.naturalHeight} ${right ? "✓ right shape" : `· this place is ${want[0]} × ${want[1]}: the edges may be cut off`}`;
        $(`[data-prev=${which}]`, main).src = url;
        if (which === "laptop" && !chosen.phone && !(p && p.hasPhonePicture)) $("[data-prev=phone]", main).src = url;
      };
      img.onerror = () => (facts.textContent = `${file.name} · the preview can't be shown here (HEIC); it is converted when saved`);
      img.src = url;
    });

    forms().handle(form, {
      busyLabel: "Saving…",
      aliases: { hideWhen: "coupon" },
      async send(v) {
        if (!p && !chosen.laptop) throw new FrameX.http.ApiError("Please check the highlighted fields.", { fields: { laptop: "Choose the laptop picture." } });
        const hide = v.hide === "COUPON" ? "COUPON:" + String(v.coupon || "").trim().toUpperCase() : v.hide || "";
        const body = { title: v.title, link: v.link, startsOn: v.startsOn || "", endsOn: v.endsOn || "", hideWhen: hide === "COUPON:" ? "COUPON:" : hide, active: form.elements.active.checked };
        const saved = p ? (await http().patch(`/admin/promotions/${encodeURIComponent(p.id)}`, body)).promotion : (await http().post("/admin/promotions", { ...body, placement: form.elements.placement.value })).promotion;
        const warnings = [];
        for (const which of ["laptop", "phone"]) {
          if (!chosen[which]) continue;
          const r = await http().upload(`/admin/promotions/${encodeURIComponent(saved.id)}/picture/${which}`, chosen[which], { name: chosen[which].name });
          if (r.warning) warnings.push(r.warning);
        }
        return { warnings, created: !p };
      },
      onSuccess({ warnings, created }) {
        FrameX.toast.show(warnings.length ? warnings[0] : created ? "Promotion saved. It shows on the website within a minute." : "Saved.");
        window.location.hash = "#/promotions";
      },
    });
  }

  function picker(which, label, current, required) {
    return `<div class="form-field" data-field="${which}"><label for="pr-${which}">${label} <small>(<span data-size-for="${which}"></span> · JPG, PNG, WebP or HEIC${which === "phone" ? " · optional" : ""})</small></label>
      <label class="pr-drop">
        ${current ? `<img src="${src(current)}" alt="">` : ""}
        <input id="pr-${which}" name="${which}" type="file" accept="${ACCEPT}" data-pick="${which}"${required ? " required" : ""}>
        <small data-facts="${which}">${current ? "Choose a new file to replace it." : which === "phone" ? "Leave empty to use the laptop picture." : "Choose the picture."}</small>
      </label>
      <p class="form-field__error">${icon("alert")}<span></span></p></div>`;
  }

  FrameX.adminPromotions = { list, edit };
})((window.FrameX = window.FrameX || {}));
