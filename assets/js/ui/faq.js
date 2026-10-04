/* FAQ: renders from data, wires an accessible accordion (several panels may
   stay open). Full grouped list on faq.html, a short preview on the home page
   (#faq-root[data-preview="4"]). */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  let uid = 0;

  const item = ({ q, a }) => {
    const n = ++uid;
    return `<div class="faq-item">
      <h3><button class="faq-item__button" type="button" id="faq-btn-${n}" aria-expanded="false" aria-controls="faq-${n}"><span>${esc(q)}</span><span class="faq-item__icon">${icon("plus")}</span></button></h3>
      <div class="faq-item__panel" id="faq-${n}" role="region" aria-labelledby="faq-btn-${n}"><div><p class="faq-item__answer">${esc(a)}</p></div></div>
    </div>`;
  };

  function wire(root) {
    $$(".faq-item", root).forEach((el) => {
      const button = $(".faq-item__button", el);
      button.addEventListener("click", () => {
        const open = !el.classList.contains("is-open");
        el.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", String(open));
      });
    });
  }

  async function init() {
    const root = $("#faq-root");
    if (!root) return;
    try {
      const groups = await FrameX.api.getFaq();
      const preview = Number(root.dataset.preview) || 0;
      if (preview) {
        const items = groups.flatMap((g) => g.items).slice(0, preview);
        root.innerHTML = `<div class="faq-column">${items.map(item).join("")}</div>`;
      } else {
        root.innerHTML = groups
          .map(
            (
              g,
            ) => `<section class="faq-group" id="faq-${esc(g.id)}" aria-labelledby="faq-title-${esc(g.id)}">
              <h2 class="faq-group__title" id="faq-title-${esc(g.id)}">${esc(g.title)}</h2>
              <div class="faq-column">${g.items.map(item).join("")}</div></section>`,
          )
          .join("");
      }
      wire(root);
    } catch (error) {
      console.error("FAQ failed to load", error);
      FrameX.templates.showError(root, "Questions couldn't be loaded.", init);
    }
  }

  FrameX.faq = { init };
})((window.FrameX = window.FrameX || {}));
