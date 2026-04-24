// ============================================================
// HAWLA — rates.js
// Single source of truth for all exchange rate data.
// Used by the Express server (via require) AND embedded in
// the frontend HTML at build time.
//
// HOW TO UPDATE RATES:
//   1. Open this file
//   2. Change the "rate" numbers under each provider
//   3. Update LAST_UPDATED string at the top
//   4. Save — the server picks up changes on next cron tick
//   5. Refresh the frontend page to see new rates
//
// "rate" = units of foreign currency you get per 1 AED sent
// "fee"  = fixed AED fee charged per transfer (0 = free)
// ============================================================

const LAST_UPDATED = "Updated today at 9:00 AM UAE time";

const CORRIDORS = {
  INR: { name: "Indian Rupee",       flag: "🇮🇳", symbol: "₹",  label: { en: "India",       hi: "भारत",       tl: "India",      ur: "بھارت"     } },
  PHP: { name: "Philippine Peso",    flag: "🇵🇭", symbol: "₱",  label: { en: "Philippines", hi: "फिलीपींस",   tl: "Pilipinas",  ur: "فلپائن"    } },
  PKR: { name: "Pakistani Rupee",    flag: "🇵🇰", symbol: "₨",  label: { en: "Pakistan",    hi: "पाकिस्तान",  tl: "Pakistan",   ur: "پاکستان"   } },
  BDT: { name: "Bangladeshi Taka",   flag: "🇧🇩", symbol: "৳",  label: { en: "Bangladesh",  hi: "बांग्लादेश",  tl: "Bangladesh", ur: "بنگلہ دیش" } },
  NPR: { name: "Nepalese Rupee",     flag: "🇳🇵", symbol: "रू", label: { en: "Nepal",       hi: "नेपाल",      tl: "Nepal",      ur: "نیپال"     } },
  LKR: { name: "Sri Lankan Rupee",   flag: "🇱🇰", symbol: "Rs", label: { en: "Sri Lanka",   hi: "श्रीलंका",   tl: "Sri Lanka",  ur: "سری لنکا"  } },
  EGP: { name: "Egyptian Pound",     flag: "🇪🇬", symbol: "£",  label: { en: "Egypt",       hi: "मिस्र",      tl: "Egypt",      ur: "مصر"       } },
};

const PROVIDERS = [
  // ── EXCHANGE HOUSES ─────────────────────────────────────
  {
    id:        "al_ansari",
    name:      "Al Ansari Exchange",
    type:      "exchange_house",
    logo:      "AA",
    color:     "#1B4B8A",
    textColor: "#fff",
    link:      "https://alansariexchange.com",
    speed:     { en: "Same day", hi: "उसी दिन", tl: "Parehong araw", ur: "اسی دن" },
    rates: {
      INR: { rate: 23.75, fee: 0, feeNote: "No fee" },
      PHP: { rate: 14.61, fee: 0, feeNote: "No fee" },
      PKR: { rate: 76.20, fee: 0, feeNote: "No fee" },
      BDT: { rate: 30.10, fee: 0, feeNote: "No fee" },
      NPR: { rate: 38.05, fee: 0, feeNote: "No fee" },
      LKR: { rate: 82.40, fee: 0, feeNote: "No fee" },
      EGP: { rate: 13.82, fee: 0, feeNote: "No fee" },
    },
  },
  {
    id:        "lulu_exchange",
    name:      "LuLu Exchange",
    type:      "exchange_house",
    logo:      "LL",
    color:     "#E31837",
    textColor: "#fff",
    link:      "https://luluexchange.com",
    speed:     { en: "Same day", hi: "उसी दिन", tl: "Parehong araw", ur: "اسی دن" },
    rates: {
      INR: { rate: 23.72, fee: 0, feeNote: "No fee" },
      PHP: { rate: 14.58, fee: 0, feeNote: "No fee" },
      PKR: { rate: 76.00, fee: 0, feeNote: "No fee" },
      BDT: { rate: 30.05, fee: 0, feeNote: "No fee" },
      NPR: { rate: 37.95, fee: 0, feeNote: "No fee" },
      LKR: { rate: 82.10, fee: 0, feeNote: "No fee" },
      EGP: { rate: 13.78, fee: 0, feeNote: "No fee" },
    },
  },
  {
    id:        "al_fardan",
    name:      "Al Fardan Exchange",
    type:      "exchange_house",
    logo:      "AF",
    color:     "#006B3F",
    textColor: "#fff",
    link:      "https://alfardanexchange.com",
    speed:     { en: "Same day", hi: "उसी दिन", tl: "Parehong araw", ur: "اسی دن" },
    rates: {
      INR: { rate: 23.80, fee: 0, feeNote: "No fee" },
      PHP: { rate: 14.63, fee: 0, feeNote: "No fee" },
      PKR: { rate: 76.40, fee: 0, feeNote: "No fee" },
      BDT: { rate: 30.20, fee: 0, feeNote: "No fee" },
      NPR: { rate: 38.10, fee: 0, feeNote: "No fee" },
      LKR: { rate: 82.60, fee: 0, feeNote: "No fee" },
      EGP: { rate: 13.85, fee: 0, feeNote: "No fee" },
    },
  },
  {
    id:        "wall_street",
    name:      "Wall Street Exchange",
    type:      "exchange_house",
    logo:      "WS",
    color:     "#2C2C54",
    textColor: "#fff",
    link:      "https://wallstreetexchange.com",
    speed:     { en: "Same day", hi: "उसी दिन", tl: "Parehong araw", ur: "اسी دن" },
    rates: {
      INR: { rate: 23.70, fee: 0, feeNote: "No fee" },
      PHP: { rate: 14.56, fee: 0, feeNote: "No fee" },
      PKR: { rate: 75.80, fee: 0, feeNote: "No fee" },
      BDT: { rate: 29.95, fee: 0, feeNote: "No fee" },
      NPR: { rate: 37.88, fee: 0, feeNote: "No fee" },
      LKR: { rate: 81.90, fee: 0, feeNote: "No fee" },
      EGP: { rate: 13.74, fee: 0, feeNote: "No fee" },
    },
  },
  {
    id:        "sharaf",
    name:      "Sharaf Exchange",
    type:      "exchange_house",
    logo:      "SE",
    color:     "#8B4513",
    textColor: "#fff",
    link:      "https://sharafexchange.com",
    speed:     { en: "Same day", hi: "उसी दिन", tl: "Parehong araw", ur: "اسी دن" },
    rates: {
      INR: { rate: 23.68, fee: 0, feeNote: "No fee" },
      PHP: { rate: 14.54, fee: 0, feeNote: "No fee" },
      PKR: { rate: 75.70, fee: 0, feeNote: "No fee" },
      BDT: { rate: 29.90, fee: 0, feeNote: "No fee" },
      NPR: { rate: 37.82, fee: 0, feeNote: "No fee" },
      LKR: { rate: 81.70, fee: 0, feeNote: "No fee" },
      EGP: { rate: 13.71, fee: 0, feeNote: "No fee" },
    },
  },

  // ── DIGITAL APPS ─────────────────────────────────────────
  {
    id:        "wise",
    name:      "Wise",
    type:      "digital",
    logo:      "W",
    color:     "#9FE870",
    textColor: "#163300",
    link:      "https://wise.com",
    speed:     { en: "Instant–1 day", hi: "तुरंत–1 दिन", tl: "Instant–1 araw", ur: "فوری–1 دن" },
    rates: {
      INR: { rate: 23.88, fee: 0, feeNote: "~0.6% included" },
      PHP: { rate: 14.70, fee: 0, feeNote: "~0.6% included" },
      PKR: { rate: 76.60, fee: 0, feeNote: "~0.6% included" },
      BDT: { rate: 30.30, fee: 0, feeNote: "~0.6% included" },
      NPR: { rate: 38.20, fee: 0, feeNote: "~0.6% included" },
      LKR: { rate: 82.80, fee: 0, feeNote: "~0.6% included" },
      EGP: { rate: 13.90, fee: 0, feeNote: "~0.6% included" },
    },
  },
  {
    id:        "remitly",
    name:      "Remitly",
    type:      "digital",
    logo:      "R",
    color:     "#FF6B35",
    textColor: "#fff",
    link:      "https://remitly.com",
    speed:     { en: "Minutes–3 days", hi: "मिनट–3 दिन", tl: "Minuto–3 araw", ur: "منٹ–3 دن" },
    rates: {
      INR: { rate: 23.85, fee: 3.99, feeNote: "AED 3.99 fee" },
      PHP: { rate: 14.66, fee: 3.99, feeNote: "AED 3.99 fee" },
      PKR: { rate: 76.50, fee: 3.99, feeNote: "AED 3.99 fee" },
      BDT: { rate: 30.25, fee: 3.99, feeNote: "AED 3.99 fee" },
      NPR: { rate: 38.15, fee: 3.99, feeNote: "AED 3.99 fee" },
      LKR: { rate: 82.70, fee: 3.99, feeNote: "AED 3.99 fee" },
      EGP: { rate: 13.88, fee: 3.99, feeNote: "AED 3.99 fee" },
    },
  },
  {
    id:        "western_union",
    name:      "Western Union",
    type:      "digital",
    logo:      "WU",
    color:     "#FFDD00",
    textColor: "#333",
    link:      "https://westernunion.com",
    speed:     { en: "Minutes", hi: "मिनट में", tl: "Sa loob ng minuto", ur: "منٹوں میں" },
    rates: {
      INR: { rate: 23.60, fee: 5.00, feeNote: "AED 5 fee" },
      PHP: { rate: 14.50, fee: 5.00, feeNote: "AED 5 fee" },
      PKR: { rate: 75.50, fee: 5.00, feeNote: "AED 5 fee" },
      BDT: { rate: 29.80, fee: 5.00, feeNote: "AED 5 fee" },
      NPR: { rate: 37.70, fee: 5.00, feeNote: "AED 5 fee" },
      LKR: { rate: 81.50, fee: 5.00, feeNote: "AED 5 fee" },
      EGP: { rate: 13.68, fee: 5.00, feeNote: "AED 5 fee" },
    },
  },
];

// Export for Node.js (server), ignore in browser
if (typeof module !== "undefined") {
  module.exports = { CORRIDORS, PROVIDERS, LAST_UPDATED };
}
