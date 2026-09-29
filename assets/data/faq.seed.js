/* SEED DATA — FAQ. Stand-in for GET /api/v1/faq.
   Policies (cancellation before production, 7-day damage claims) are carried
   over from the original FrameX site. Delivery times, COD and payments are
   deliberately NOT promised: they depend on each shop and are not connected yet.
   Please confirm every answer with the business before launch. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};
  FrameX.seed.faq = [
    { id: "about", title: "About FrameX", items: [
      { q: "What is FrameX?", a: "FrameX is a photo-frame marketplace. You browse frames from local shops, choose a size and place a request to pick it up or, where the shop offers it, have it delivered." },
      { q: "Is FrameX one shop or many?", a: "The site is built for several local shops. Each shop lists its own frames, and the shop name is shown on every product." }
    ]},
    { id: "customization", title: "Customization", items: [
      { q: "Can I customize my frame?", a: "Frame styles and sizes are set by each shop. Custom sizes and personalised frames are planned; until they are connected, please contact the shop directly through the Contact page." }
    ]},
    { id: "sizes", title: "Product sizes", items: [
      { q: "What frame sizes are available?", a: "Available sizes are shown on each product page. If a product shows a single size, that is the only size the shop currently lists." }
    ]},
    { id: "orders", title: "Orders", items: [
      { q: "Can I place an order online?", a: "You can build a cart on this site. Online checkout and payment are not connected yet, so orders cannot be completed here at the moment." },
      { q: "How will I follow my order?", a: "Once ordering is live, each order will move through: order placed, confirmed, preparing, ready, out for delivery (delivery orders only) and delivered or collected." }
    ]},
    { id: "delivery", title: "Pickup and delivery", items: [
      { q: "Do you deliver?", a: "Each shop chooses whether it offers pickup, its own delivery, or a delivery partner. Open a shop page to see what it offers. Delivery fees and times are set by the shop and confirmed at checkout." }
    ]},
    { id: "cancellation", title: "Cancellation and refund", items: [
      { q: "Can I cancel or modify my order?", a: "Orders can be cancelled or modified only before production begins. Once a custom frame is in production, changes or cancellations may not be possible." },
      { q: "What if my frame arrives damaged or incorrect?", a: "Please contact us within 7 days of receiving it. A replacement or refund is arranged after the issue is verified." }
    ]},
    { id: "upload", title: "Photo upload", items: [
      { q: "How do I send my photo?", a: "Photo upload is not connected yet. The product page includes a preview tool so you can see how your photo looks, but the photo is not uploaded or saved. For now, share your photo with the shop through the Contact page." }
    ]}
  ];
})((window.FrameX = window.FrameX || {}));
