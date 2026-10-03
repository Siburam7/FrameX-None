/* SEED DATA — FAQ. Stand-in for GET /api/v1/faq.
   Policies (cancellation before production, 7-day damage claims) are carried
   over from the original FrameX site. Delivery times, COD and payments are
   deliberately NOT promised: they depend on each shop and are not connected yet.
   Answers describe what the site does TODAY (photo preview on the device, cart
   saved on the device, no online checkout). Update them when that changes.
   Please confirm every answer with the business before launch. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};
  FrameX.seed.faq = [
    { id: "about", title: "About FrameX", items: [
      { q: "What is FrameX?", a: "FrameX is a photo-frame marketplace. You browse frames from local shops, choose a size and frame colour, and place a request to pick it up or, where the shop offers it, have it delivered." },
      { q: "Can I order from different local shops?", a: "Yes. Every product shows which shop sells it, and your cart can hold frames from more than one shop. Items from different shops are ordered separately, and each shop handles its own pickup or delivery." }
    ]},
    { id: "photo", title: "Your photo", items: [
      { q: "What photo resolution should I use?", a: "Use the original, full-size photo from your camera or phone rather than a screenshot or a copy forwarded through a messaging app, which is usually compressed. As a rule of thumb, aim for about 300 pixels for every inch of the print — roughly 2400 × 3000 pixels for an 8 × 10 in frame. Larger frames are viewed from further away, so a little less is usually fine. The shop preparing your frame can tell you whether a photo is sharp enough." },
      { q: "Can I upload my own photo?", a: "Yes, as a preview. On a product page choose \"Try With Your Own Image\" to see your photo inside that exact frame, then zoom and reposition it. The photo stays on your device: it is not sent to FrameX or to the shop, and it disappears when you leave the page. To have it printed, share it with the shop on WhatsApp or by email when you order." }
    ]},
    { id: "frames", title: "Frames and sizes", items: [
      { q: "What frame sizes are available?", a: "Available sizes are shown on each product page. Most featured styles come in Small (8 × 10 in), Medium (12 × 16 in), Large (16 × 20 in) and Extra Large (20 × 24 in), with a size comparison to help you picture them. If a product shows a single size, that is the only size the shop currently lists." },
      { q: "Can I customize the frame?", a: "You can choose the size and, where the shop offers it, the frame colour, and add a note for the shop. The frame design itself belongs to the product, so changing colour or size never swaps it for a different frame. Custom sizes and personalised frames are coming soon; until then, ask us on WhatsApp or by email." }
    ]},
    { id: "delivery", title: "Pickup and delivery", items: [
      { q: "Is pickup available?", a: "It depends on the shop. Shops that offer pickup show a \"Pickup\" label on their shop card and shop page." },
      { q: "Is delivery available?", a: "It depends on the shop. Some shops deliver themselves, some use a delivery partner, and some offer pickup only. The options are shown on each shop card and shop page." },
      { q: "How does delivery work?", a: "Each shop sets its own delivery area, fee and time, and these are confirmed with you before your order is prepared. Online checkout is coming soon; for now, send your order on WhatsApp and we'll confirm the delivery details with you." }
    ]},
    { id: "orders", title: "Orders, cancellation and refunds", items: [
      { q: "Can I place an order online?", a: "Yes. Add frames to your cart, then choose \"Order on WhatsApp\" to send us your order. We confirm availability, pickup or delivery and the total with you. Online checkout and payment are coming soon." },
      { q: "How will I follow my order?", a: "Live order tracking is coming soon. Each order will move through: order placed, confirmed, preparing, ready, out for delivery (delivery orders only) and delivered or collected." },
      { q: "Can I cancel an order?", a: "Orders can be cancelled or modified only before production begins. Once a custom frame is in production, changes or cancellations may not be possible." },
      { q: "What happens if my product arrives damaged?", a: "Please contact us within 7 days of receiving it. A replacement or refund is arranged after the issue is verified." }
    ]}
  ];
})((window.FrameX = window.FrameX || {}));
