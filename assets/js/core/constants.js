/* ==========================================================================
   Domain constants shared by UI and (later) the backend contract.
   The backend is the source of truth for status changes; the frontend only
   displays them.
   ========================================================================== */
(function (FrameX) {
  /** Happy path, in order. */
  const ORDER_FLOW = [
    "placed",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
  ];

  const ORDER_STATUS = {
    placed: { label: "Order placed" },
    confirmed: { label: "Confirmed" },
    preparing: { label: "Preparing" },
    ready: { label: "Ready" },
    out_for_delivery: { label: "Out for delivery" },
    delivered: { label: "Delivered" },
    // Terminal / exceptional states
    cancelled: { label: "Cancelled", terminal: true },
    refunded: { label: "Refunded", terminal: true },
    failed: { label: "Failed", terminal: true },
  };

  /** Pickup orders skip "out for delivery" and use pickup wording. */
  function orderStatusLabel(status, fulfilment) {
    if (fulfilment === "pickup") {
      if (status === "ready") return "Ready for pickup";
      if (status === "delivered") return "Collected";
    }
    return (ORDER_STATUS[status] || { label: status }).label;
  }

  /**
   * Fulfilment options. `enabled: false` methods are part of the data model
   * but are not offered to customers (FrameX does not assume its own riders).
   */
  const FULFILMENT_METHODS = {
    pickup: {
      label: "Pickup",
      icon: "store",
      summary: "Collect your order from the shop you choose.",
      enabled: true,
    },
    shop_delivery: {
      label: "Shop delivery",
      icon: "truck",
      summary: "The shop delivers to you, where it offers delivery.",
      enabled: true,
    },
    delivery_partner: {
      label: "Delivery partner",
      icon: "package",
      summary: "A third-party courier brings it to your door, where offered.",
      enabled: true,
    },
    platform_delivery: {
      label: "FrameX delivery",
      icon: "truck",
      summary: "Delivered by a FrameX team.",
      enabled: false,
    },
  };

  FrameX.constants = {
    ORDER_FLOW,
    ORDER_STATUS,
    orderStatusLabel,
    FULFILMENT_METHODS,
  };
})((window.FrameX = window.FrameX || {}));
