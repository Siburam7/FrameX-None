/* SEED DATA — customer reviews. Stand-in for GET /api/v1/reviews.
   Text and names are the site owner's original content. `dateLabel` is the
   original relative wording; a backend should return an ISO `createdAt`. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};
  const a = (n) => "assets/img/reviews/avatar-" + n + ".webp";

  FrameX.seed.reviews = [
    { id: "r-001", name: "Rahul Sahoo", avatar: a(1), rating: 5, isVerified: true, productName: "Premium Wooden Frame", dateLabel: "2 weeks ago", text: "Amazing quality and premium finish. The frame looks beautiful in my living room. Really happy with my purchase!" },
    { id: "r-002", name: "Rajesh Chandra K", avatar: a(2), rating: 5, isVerified: true, productName: "Collage Frame", dateLabel: "1 month ago", text: "The print quality exceeded my expectations. Packaging was very secure and delivery was right on time." },
    { id: "r-003", name: "Amit Kumar Beura", avatar: a(3), rating: 5, isVerified: true, productName: "Luxury Gold Frame", dateLabel: "3 weeks ago", text: "Perfect anniversary gift for my wife. The frame design and finish looked absolutely premium." },
    { id: "r-004", name: "Sneha Patel", avatar: a(4), rating: 5, isVerified: true, productName: "Custom Photo Frame", dateLabel: "5 days ago", text: "Customer support was excellent and the final product looked exactly as shown on the website." }
  ];
})((window.FrameX = window.FrameX || {}));
