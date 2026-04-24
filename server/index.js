// ============================================================
// HAWLA — Backend Server (server/index.js)
// ============================================================
// What this does:
//   1. Serves the frontend (public/ folder)
//   2. Accepts alert subscriptions via POST /api/alerts
//   3. Stores subscribers in memory (upgrade to DB later)
//   4. Runs a cron job every 30 min to check if rates changed
//      and WhatsApps any subscriber whose corridor rate improved
//
// HOW TO RUN:
//   1. cp .env.example .env  (fill in your Twilio keys)
//   2. npm install
//   3. npm run dev            (development, auto-restarts)
//   4. npm start              (production)
//
// TWILIO SETUP (free sandbox works fine to start):
//   1. Sign up at twilio.com
//   2. Go to Messaging > Try it Out > Send a WhatsApp message
//   3. Follow the sandbox instructions
//   4. Paste your SID, Auth Token, and sandbox number into .env
// ============================================================

require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const cron    = require("node-cron");
const path    = require("path");
const twilio  = require("twilio");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Twilio client (only if keys are set) ──────────────────
const twilioEnabled =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_ACCOUNT_SID.startsWith("AC") &&
  process.env.TWILIO_AUTH_TOKEN;

const twilioClient = twilioEnabled
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

if (!twilioEnabled) {
  console.log("⚠  Twilio not configured — WhatsApp alerts will be logged only.");
  console.log("   Add keys to .env to enable real messages.\n");
}

// ── In-memory subscriber store ────────────────────────────
// Shape: [{ phone, corridor, amount, bestRateAtSignup, lang, createdAt }]
// TODO: Replace with SQLite or PostgreSQL when you have 100+ subscribers
const subscribers = [];

// ── Snapshot of "last seen" rates per corridor ────────────
// Used to detect when a rate improves so we only alert on changes
const lastRates = {}; // { INR: 23.75, PHP: 14.61, ... }

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname, "../public")));

// ============================================================
// API ROUTES
// ============================================================

// GET /api/rates — returns current rates (for future auto-update)
app.get("/api/rates", (req, res) => {
  // Require rates.js from the public folder
  // We use delete require.cache so changes are picked up without restart
  delete require.cache[require.resolve("../public/rates.js")];
  const { PROVIDERS, CORRIDORS, LAST_UPDATED } = require("../public/rates.js");
  res.json({ PROVIDERS, CORRIDORS, LAST_UPDATED });
});

// POST /api/alerts — subscribe a phone number to rate alerts
app.post("/api/alerts", (req, res) => {
  const { phone, corridor, amount, bestRate, lang } = req.body;

  // ── Validation ──
  if (!phone || !corridor) {
    return res.status(400).json({ error: "phone and corridor are required" });
  }

  const clean = phone.replace(/\s/g, "");
  if (!/^\+\d{7,15}$/.test(clean)) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }

  const validCorridors = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];
  if (!validCorridors.includes(corridor)) {
    return res.status(400).json({ error: "Invalid corridor" });
  }

  // ── Deduplicate (same phone + corridor) ──
  const exists = subscribers.find(
    s => s.phone === clean && s.corridor === corridor
  );

  if (exists) {
    console.log(`ℹ  Existing subscriber updated: ${clean} (${corridor})`);
    exists.amount           = amount;
    exists.bestRateAtSignup = bestRate;
    exists.lang             = lang || "en";
  } else {
    subscribers.push({
      phone:           clean,
      corridor,
      amount:          amount || 1000,
      bestRateAtSignup: bestRate,
      lang:            lang || "en",
      createdAt:       new Date().toISOString(),
    });
    console.log(`✅ New subscriber: ${clean} → ${corridor} (total: ${subscribers.length})`);
  }

  // ── Send confirmation WhatsApp ──
  sendWhatsApp(
    clean,
    buildConfirmationMessage(clean, corridor, bestRate, lang || "en")
  );

  res.json({ ok: true, total: subscribers.length });
});

// GET /api/subscribers — admin view of all subscribers
// TODO: Protect this with a secret key before going public
app.get("/api/subscribers", (req, res) => {
  res.json({
    count: subscribers.length,
    subscribers: subscribers.map(s => ({
      phone:     maskPhone(s.phone),
      corridor:  s.corridor,
      createdAt: s.createdAt,
    })),
  });
});

app.get("/api/test-whatsapp", async (req, res) => {
  const testPhone = process.env.TEST_PHONE;

  if (!testPhone) {
    return res.status(400).json({
      error: "TEST_PHONE not set in .env",
      fix: "Add TEST_PHONE=+971500000000 to your .env file"
    });
  }

  const message = `✅ *Hawla test message*\n\nYour WhatsApp alerts are working!\n\nServer time: ${new Date().toISOString()}\nSubscribers so far: ${subscribers.length}\n\n🚀 Ready to launch.`;

  await sendWhatsApp(testPhone, message);

  res.json({
    ok: true,
    sentTo: maskPhone(testPhone),
    message: "Check your WhatsApp — message sent!"
  });
});

// ── Catch-all: serve index.html for any unknown route ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ============================================================
// WHATSAPP HELPERS
// ============================================================

async function sendWhatsApp(to, message) {
  if (!twilioClient) {
    console.log(`📱 [WhatsApp would send to ${maskPhone(to)}]:\n${message}\n`);
    return;
  }

  try {
    const msg = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   `whatsapp:${to}`,
      body: message,
    });
    console.log(`✅ WhatsApp sent to ${maskPhone(to)} [SID: ${msg.sid}]`);
  } catch (err) {
    console.error(`❌ WhatsApp failed to ${maskPhone(to)}:`, err.message);
  }
}

function buildConfirmationMessage(phone, corridor, rate, lang) {
  const msgs = {
    en: `🏦 *Hawla* — You're now subscribed!\n\nWe'll message you when the *AED → ${corridor}* rate improves above ${rate ? rate.toFixed(2) : "today's best"}.\n\nReply STOP to unsubscribe.`,
    hi: `🏦 *Hawla* — आपका सब्सक्रिप्शन हो गया!\n\nजब *AED → ${corridor}* रेट ${rate ? rate.toFixed(2) : "आज के सबसे अच्छे"} से ऊपर जाएगा, हम WhatsApp करेंगे।\n\nबंद करने के लिए STOP लिखें।`,
    tl: `🏦 *Hawla* — Naka-subscribe ka na!\n\nIpapadala namin ang mensahe kapag bumuti ang *AED → ${corridor}* rate.\n\nI-reply ang STOP para mag-unsubscribe.`,
    ur: `🏦 *Hawla* — آپ کی سبسکرپشن ہو گئی!\n\n*AED → ${corridor}* ریٹ بہتر ہونے پر ہم آپ کو WhatsApp کریں گے۔\n\nبند کرنے کے لیے STOP لکھیں۔`,
  };
  return msgs[lang] || msgs.en;
}

function buildAlertMessage(sub, newRate, oldRate, corridor) {
  const improvement = ((newRate - oldRate) / oldRate * 100).toFixed(2);
  const nowReceives = Math.round(sub.amount * newRate);

  const msgs = {
    en: `📈 *Hawla Rate Alert!*\n\nAED → ${corridor} just improved!\n\n• Old rate: ${oldRate.toFixed(2)}\n• New rate: *${newRate.toFixed(2)}* (+${improvement}%)\n• Send AED ${sub.amount} → receive *~${nowReceives.toLocaleString()}*\n\nCheck best provider: https://hawla.ae\n\nReply STOP to unsubscribe.`,
    hi: `📈 *Hawla रेट अलर्ट!*\n\nAED → ${corridor} रेट बेहतर हुआ!\n\n• पुराना रेट: ${oldRate.toFixed(2)}\n• नया रेट: *${newRate.toFixed(2)}* (+${improvement}%)\n• AED ${sub.amount} भेजें → *~${nowReceives.toLocaleString()}* मिलेगा\n\nhttps://hawla.ae\n\nSTOP लिखें बंद करने के लिए।`,
    tl: `📈 *Hawla Rate Alert!*\n\nAED → ${corridor} bumuti na!\n\n• Dati: ${oldRate.toFixed(2)}\n• Bago: *${newRate.toFixed(2)}* (+${improvement}%)\n• Magpadala ng AED ${sub.amount} → tatanggap ng *~${nowReceives.toLocaleString()}*\n\nhttps://hawla.ae`,
    ur: `📈 *Hawla ریٹ الرٹ!*\n\nAED → ${corridor} ریٹ بہتر ہوا!\n\n• پرانا ریٹ: ${oldRate.toFixed(2)}\n• نیا ریٹ: *${newRate.toFixed(2)}* (+${improvement}%)\n• AED ${sub.amount} بھیجیں → *~${nowReceives.toLocaleString()}* ملے گا\n\nhttps://hawla.ae`,
  };
  return msgs[sub.lang] || msgs.en;
}

function maskPhone(phone) {
  return phone.slice(0, 4) + "****" + phone.slice(-3);
}

// ============================================================
// CRON JOB — Rate change detection & alert dispatch
// Runs every 30 minutes. Checks current rates against last
// seen rates. If a corridor improved, alerts all subscribers.
// ============================================================

function getBestRateForCorridor(corridor) {
  // Reload rates fresh each time (picks up manual updates)
  delete require.cache[require.resolve("../public/rates.js")];
  const { PROVIDERS } = require("../public/rates.js");

  let best = 0;
  PROVIDERS.forEach(p => {
    const rd = p.rates?.[corridor];
    if (rd) {
      // Effective rate = (1000 - fee) * rate / 1000 — normalised to 1 AED
      const effective = (1000 - rd.fee) * rd.rate / 1000;
      if (effective > best) best = effective;
    }
  });
  return best;
}

function checkAndAlert() {
  const corridors = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];

  corridors.forEach(corridor => {
    const current = getBestRateForCorridor(corridor);
    const previous = lastRates[corridor];

    if (previous === undefined) {
      // First run — just record, don't alert
      lastRates[corridor] = current;
      return;
    }

    // Rate improved by at least 0.05% — alert subscribers
    const improvement = (current - previous) / previous;
    if (improvement >= 0.0005) {
      console.log(`📈 Rate improved for ${corridor}: ${previous.toFixed(4)} → ${current.toFixed(4)}`);

      const affected = subscribers.filter(s => s.corridor === corridor);
      if (affected.length === 0) return;

      console.log(`   Notifying ${affected.length} subscriber(s)...`);

      affected.forEach(sub => {
        const msg = buildAlertMessage(sub, current, previous, corridor);
        sendWhatsApp(sub.phone, msg);
        // Update their reference rate so they don't get spammed
        sub.bestRateAtSignup = current;
      });

      lastRates[corridor] = current;
    } else {
      // Rate same or worse — just update snapshot
      lastRates[corridor] = current;
    }
  });
}

// Run every 30 minutes: "*/30 * * * *"
// Run every minute for testing: "* * * * *"
cron.schedule("*/30 * * * *", () => {
  console.log(`[${new Date().toISOString()}] Checking rates...`);
  checkAndAlert();
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Hawla server running at http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   Rates API: http://localhost:${PORT}/api/rates`);
  console.log(`   Subscribers: http://localhost:${PORT}/api/subscribers\n`);

  // Initial rate snapshot
  checkAndAlert();
});
