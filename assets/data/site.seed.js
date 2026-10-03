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
      phone: "",       // e.g. "+91 98765 43210"  -> enables tel: link
      whatsapp: "919337169824", // country code + number, digits only -> WhatsApp link
      email: "support.framex@gmail.com"
    },
    social: {
      facebook: "",
      instagram: "",
      linkedin: ""
    },
    // Hero figures (e.g. { value: 500, label: "Happy Customers", suffix: "+", icon: "users" }).
    // Removed at the owner's request — add only figures you can back up.
    stats: []
  };
})((window.FrameX = window.FrameX || {}));
