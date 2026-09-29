/* ==========================================================================
   SEED DATA — site content
   Stand-in for GET /api/v1/site. Edit here until the Admin Panel exists.
   Empty contact/social values are intentional: the UI shows a "coming soon"
   notice instead of linking to something that does not exist.
   ========================================================================== */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  FrameX.seed.site = {
    brand: { name: "FrameX" },
    contact: {
      phone: "", // e.g. "+91 98765 43210"  -> enables tel: link
      whatsapp: "9337169824", // e.g. "919876543210"     -> enables WhatsApp link
      email: "siburam.n7@gmail.com", // e.g. "hello@framex.example"
    },
    social: {
      facebook: "",
      instagram: "https://www.instagram.com/cbuxrn?stkn=Ynk5Y2I3Znoyd2Zy",
      linkedin: "",
    },
    // Marketing figures supplied by the site owner (not computed).
    stats: [
      { value: 500, label: "Happy Customers", suffix: "+" },
      { value: 1200, label: "Frames Delivered", suffix: "+" },
      { value: 30, label: "Unique Designs", suffix: "+" },
    ],
  };
})((window.FrameX = window.FrameX || {}));
