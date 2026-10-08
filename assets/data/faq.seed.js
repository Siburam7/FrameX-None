/* SEED DATA — FAQ. Stand-in for GET /api/v1/faq.
   Policies (cancellation before production, 7-day damage claims) are carried
   over from the original FrameX site. Delivery times, COD and payments are
   deliberately NOT promised: they depend on each shop and are not connected yet.
   Answers describe what the site does TODAY (photo preview on the device, cart
   saved with the customer's account, checkout with online payment or Cash on
   Delivery where the backend offers them). Update them when that changes.
   Please confirm every answer with the business before launch. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};
  FrameX.seed.faq = [
    { id: "about", title: "About FrameX", items: [
      { q: "What is FrameX?", a: "FrameX is a photo-frame marketplace. You browse frames from local shops, choose a size and frame colour, and place a request to pick it up or, where the shop offers it, have it delivered." },
      { q: "Can I order from different local shops?", a: "Yes. Every product shows which shop sells it, and your cart can hold frames from more than one shop. Items from different shops are ordered separately, and each shop handles its own pickup or delivery." }
    ]},
    { id: "photo", title: "Your photo", items: [
      { q: "Do I have to add my own photo?", a: "For a photo frame, yes. A photo frame is made with your picture printed and fitted in it, so the product page asks for it under \"Your photo\" before you can add the frame to your cart or buy it. The pictures in the product gallery are samples. A set of frames needs one photo for each frame, and a template needs one for each photo space. Ready-made Home Decor and wall art need no photo at all." },
      { q: "What photo resolution should I use?", a: "Use the original, full-size photo from your camera or phone rather than a screenshot or a copy forwarded through a messaging app, which is usually compressed. As a rule of thumb, aim for about 300 pixels for every inch of the print — roughly 2400 × 3000 pixels for an 8 × 10 in frame. Larger frames are viewed from further away, so a little less is usually fine. 4K and other high-resolution photos are welcome: JPG, PNG or WebP." },
      { q: "Does FrameX improve or enhance my photo?", a: "No. Your uploaded image will be printed in the same original quality you provide. We do not artificially enhance or improve the image quality: nothing is sharpened, upscaled or retouched, and the file is kept exactly as you uploaded it. For the best print result, please upload a high-quality image." },
      { q: "How do I add my photo?", a: "On the product page, tap \"Photo 1\" under \"Your photo\" and choose a picture (or drop one on it). You see its name and size straight away, and for a single frame a small preview of how it fits the size you picked: drag it to move it, and use the slider to zoom. To crop it or add a border, a mat or text with a live preview, choose \"Customize This Product\" to open FrameX Studio. You can replace or remove a photo at any time before you order." },
      { q: "Where does my photo go, and who can see it?", a: "When you order, your original file is uploaded to FrameX and kept with that order. It is private: there is no public link to it. Only you, FrameX and the shop that makes your order can open it, each through a link that works for a few minutes. Another shop, or another customer, can't. A photo that never becomes part of an order is deleted automatically after a while." }
    ]},
    { id: "frames", title: "Frames and sizes", items: [
      { q: "What frame sizes are available?", a: "Available sizes are shown on each product page. Most featured styles come in Small (8 × 10 in), Medium (12 × 16 in), Large (16 × 20 in) and Extra Large (20 × 24 in), with a size comparison to help you picture them. If a product shows a single size, that is the only size the shop currently lists." },
      { q: "Can I customize the frame?", a: "You can choose the size and, where the shop offers it, the frame colour, and add a note for the shop. The frame design itself belongs to the product, so changing colour or size never swaps it for a different frame. For more (cropping, a printed border, a mat, text), choose \"Customize This Product\" to design it in FrameX Studio. Custom sizes are not available yet; ask us on WhatsApp or by email." }
    ]},
    { id: "decor", title: "Home Decor and wall art", items: [
      { q: "What is a multi-panel frame?", a: "One picture printed across two, three, four or five separate frames. You hang them in a row with a small gap between them, so the picture runs across the wall. Each product page shows the set straight on, in a room, and the size of every panel." },
      { q: "Can I split my own photo across several frames?", a: "Yes. Open Home Decor, choose \"Custom photo wall art\" and add one photo. You see it divided across 2, 3, 4 or 5 panels straight away, side by side or stacked. Drag the picture to position it, zoom in if you like, then pick the size, frame colour, frame thickness, spacing and matte or glossy finish. The photo is printed in the same original quality you provide, so a large, sharp original gives the best result." },
      { q: "Is my photo uploaded when I use the wall-art customiser?", a: "The preview is made on your own device. When you add the set to your cart or buy it, your original file is uploaded to FrameX exactly as it is, never resized or changed, and kept with your order together with the layout you chose. It is private: only you, FrameX and the shop that makes the order can open it." },
      { q: "Where does the artwork come from?", a: "Most designs are original FrameX artwork. A small number are famous paintings that are in the public domain; each of those names the artist and the museum that released the image for free use. No film, game, anime, car-brand or sports-team artwork is used." }
    ]},
    { id: "delivery", title: "Pickup and delivery", items: [
      { q: "Is pickup available?", a: "It depends on the shop. Shops that offer pickup show a \"Pickup\" label on their shop card and shop page." },
      { q: "Is delivery available?", a: "It depends on the shop. Some shops deliver themselves, some use a delivery partner, and some offer pickup only. The options are shown on each shop card and shop page." },
      { q: "How does delivery work?", a: "You enter your delivery address at checkout. Any delivery charge is shown in your total before you pay. After you order, the shop confirms the order and the delivery time with you." },
      { q: "Can my order be gift wrapped?", a: "Yes, for most orders. At checkout you are asked \"Would you like to gift wrap this order?\". If you choose Yes, the gift-wrapping charge is added as its own line in the price before you pay, and it is recorded with your order. A few products and shops don't offer gift wrapping; if one of them is in your order, the option is switched off and the page says why." }
    ]},
    { id: "orders", title: "Orders, cancellation and refunds", items: [
      { q: "Can I place an order online?", a: "Yes. Log in or create a free account, add frames to your cart and press Checkout, or press \"Buy Now\" on a frame to order just that one straight away. Enter your delivery address, check the total, then pay with one of the options shown at checkout. You get an order number straight away and a confirmation by email." },
      { q: "How can I pay?", a: "Checkout shows the ways to pay that are available for your order. Online payment (UPI, credit or debit card, net banking and other methods) happens in the payment gateway's own secure window: FrameX never sees or stores your card number, CVV or UPI PIN. Cash on Delivery is offered where it is available; if a fee applies it is shown before you place the order. An online order is confirmed only after the payment gateway confirms your payment." },
      { q: "My payment failed or I closed the payment window. What now?", a: "Your order is kept for a short while, waiting for its payment. Open it under Your orders and press \"Retry payment\"; you can use the same or another payment method. You are not charged twice. If money left your account for a payment that did not complete, your bank or payment app normally returns it automatically." },
      { q: "Do I need an account?", a: "Not to browse: you can look at every frame, shop, template and price without one. You need a free account to add something to your cart. The first time you press \"Add to cart\" we ask you to log in or sign up, and the frame you chose is added straight after. Your cart is saved with your account, so it is still there when you come back or use another phone or computer." },
      { q: "How will I follow my order?", a: "Open Your orders from your account. Each order shows its status (placed, confirmed, being made, shipped, out for delivery, delivered) and, separately, its payment status. We also email you when your order is placed, shipped, delivered or cancelled." },
      { q: "Can I cancel an order?", a: "Orders can be cancelled only before production begins: on the order's page, press \"Cancel order\" while it is still placed or confirmed. If you paid online, the refund is sent back to the payment method you used. Once a custom frame is in production, changes or cancellations may not be possible." },
      { q: "What happens if my product arrives damaged?", a: "Please contact us within 7 days of receiving it. A replacement or refund is arranged after the issue is verified." }
    ]}
  ];
})((window.FrameX = window.FrameX || {}));
