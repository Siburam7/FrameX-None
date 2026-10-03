/* SEED DATA — customer reviews. Stand-in for GET /api/v1/reviews.
   Text and names are the site owner's original content. `dateLabel` is the
   original relative wording; a backend should return an ISO `createdAt`. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};
  const a = (n) => "assets/img/reviews/avatar-" + n + ".webp";

  // Only add reviews from real customers who ordered through FrameX.
  // While this list is empty the home page shows a "No reviews yet" message.
  FrameX.seed.reviews = [
    // Optional `photo`: the customer's own picture of their frame (shown on customer-gallery.html),
    //   e.g. photo: "assets/img/reviews/customer-1.webp"
    // ADD REAL REVIEWS HERE, e.g.
    // { id: "r-001", name: "Customer name", avatar: a(1), rating: 5, isVerified: true, productName: "Product they ordered", dateLabel: "March 2027", text: "What they wrote." }
  ];

  // The entries below were shown on the site labelled "Sample reviews". They are
  // kept here, switched off, in case they are the owner's genuine customer
  // feedback — move them into the list above only if they are real.
  //  { id: "r-001", name: "Rahul Sahoo", avatar: a(1), rating: 5, isVerified: true, productName: "Premium Wooden Frame", dateLabel: "2 weeks ago", text: "Amazing quality and premium finish. The frame looks beautiful in my living room. Really happy with my purchase!" },
  //  { id: "r-002", name: "Rajesh Chandra K", avatar: a(2), rating: 5, isVerified: true, productName: "Collage Frame", dateLabel: "1 month ago", text: "The print quality exceeded my expectations. Packaging was very secure and delivery was right on time." },
  //  { id: "r-003", name: "Amit Kumar Beura", avatar: a(3), rating: 5, isVerified: true, productName: "Luxury Gold Frame", dateLabel: "3 weeks ago", text: "Perfect anniversary gift for my wife. The frame design and finish looked absolutely premium." },
  //  { id: "r-004", name: "Sneha Patel", avatar: a(4), rating: 5, isVerified: true, productName: "Custom Photo Frame", dateLabel: "5 days ago", text: "Customer support was excellent and the final product looked exactly as shown on the website." }

})((window.FrameX = window.FrameX || {}));
