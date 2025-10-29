(function () {
  const collectorUrl = "http://localhost:3000/track"; // Collector endpoint

  // Create global HerdTracker object
  window.HerdTracker = {
    /**
     * Track a user event and send it to the collector
     * @param {string} eventType - Type of event, e.g., 'view_product', 'add_to_cart'
     * @param {string} productId - Product identifier
     * @param {object} extra - Optional additional data (category, price, metadata)
     */
    trackEvent: function (eventType, productId, extra = {}) {
      const payload = {
        event_id:
          (window.crypto?.randomUUID?.() ??
            "id-" + Math.floor(Math.random() * 1e9)),
        event_type: eventType,
        user_id: "anon-" + Math.floor(Math.random() * 1e6),
        session_id: "sess-" + Date.now(),
        product_id: productId,
        category: extra.category ?? null,
        price: extra.price ?? null,
        timestamp: new Date().toISOString(),
        metadata: extra.metadata ?? {},
      };

      const body = JSON.stringify(payload);

      try {
        if (navigator.sendBeacon) {
          // Use sendBeacon for reliability on page unload
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(collectorUrl, blob);
        } else {
          // Fallback for olde