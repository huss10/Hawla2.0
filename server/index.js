// ============================================================
// HAWLA — server/index.js
// ============================================================
require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const cron     = require("node-cron");
const path     = require("path");
const twilio   = require("twilio");
const db       = require("./db");
const { runAllScrapers } = require("./scraper");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Twilio ─────────────────────────────────────────────────
const twilioEnabled =
  process.env.TWILIO_ACCOUNT_SID?.startsWith("AC") &&
  process.env.TWILIO_AUTH_TOKEN;

const twilioClient = twilioEnabled
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

if (!twilioEnabled) {
  console.log("⚠  Twilio not configured — alerts will be logged only.");
}

// ── Provider metadata ──────────────────────────────────────
const PROVIDER_META = {
  al_ansari:     { name:"Al Ansari Exchange",  logo:"AA", color:"#1B4B8A", textColor:"#fff", link:"https://alansariexchange.com",  type:"exchange_house", speed:{en:"Same day",      hi:"उसी दिन",    tl:"Parehong araw", ur:"اسی دن"    }},
  lulu_exchange: { name:"LuLu Exchange",        logo:"LL", color:"#E31837", textColor:"#fff", link:"https://luluexchange.com",       type:"exchange_house", speed:{en:"Same day",      hi:"उसी दिन",    tl:"Parehong araw", ur:"اسی دن"    }},
  al_fardan:     { name:"Al Fardan Exchange",   logo:"AF", color:"#006B3F", textColor:"#fff", link:"https://alfardanexchange.com",   type:"exchange_house", speed:{en:"Same day",      hi:"उसी दिन",    tl:"Parehong araw", ur:"اسی دن"    }},
  wall_street:   { name:"Wall Street Exchange", logo:"WS", color:"#2C2C54", textColor:"#fff", link:"https://wallstreetexchange.com", type:"exchange_house", speed:{en:"Same day",      hi:"उसी दिन",    tl:"Parehong araw", ur:"اسی دن"    }},
  sharaf:        { name:"Sharaf Exchange",      logo:"SE", color:"#7B3F00", textColor:"#fff", link:"https://sharafexchange.com",    type:"exchange_house", speed:{en:"Same day",      hi:"उसी दिन",    tl:"Parehong araw", ur:"اسی دن"    }},
  wise:          { name:"Wise",                  logo:"W",  color:"#9FE870", textColor:"#163300", link:"https://wise.com",          type:"digital",        speed:{en:"Instant–1 day", hi:"तुरंत–1 दिन", tl:"Instant–1 araw",ur:"فوری–1 دن"  }},
  remitly:       { name:"Remitly",              logo:"R",  color:"#FF6B35", textColor:"#fff", link:"https://remitly.com",           type:"digital",        speed:{en:"Minutes–3 days",hi:"मिनट–3 दिन",  tl:"Minuto–3 araw", ur:"منٹ–3 دن"   }},
  western_union: { name:"Western Union",        logo:"WU", color:"#FFDD00", textColor:"#333", link:"https://westernunion.com",      type:"digital",        speed:{en:"Minutes",       hi:"मिनट में",   tl:"Sa loob ng minuto",ur:"منٹوں میں"}},
};

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ============================================================
// API ROUTES
// ============================================================

// GET /api/rates
app.get("/api/rates", (req, res) => {
  try {
    const rows = db.getAllLatestRates();
    const byCorridors = {};
    rows.forEach(row => {
      if (!byCorridors[row.corridor]) byCorridors[row.corridor] = [];
      const meta = PROVIDER_META[row.provider_id] || {};
      byCorridors[row.corridor].push({
        provider_id: row.provider_id,
        ...meta,
        rate:       row.rate,
        fee:        row.fee,
        scraped_at: row.scraped_at,
      });
    });
    const lastRow     = rows[rows.length - 1];
    const lastUpdated = lastRow
      ? new Date(lastRow.scraped_at).toLocaleString("en-AE", { timeZone:"Asia/Dubai" })
      : "Not yet scraped";
    res.json({ ok:true, lastUpdated, corridors: byCorridors });
  } catch (err) {
    res.status(500).json({ ok:false, error: err.message });
  }
});

// POST /api/alerts
app.post("/api/alerts", (req, res) => {
  const { phone, corridor, amount, bestRate, lang } = req.body;
  if (!phone || !corridor) return res.status(400).json({ error:"phone and corridor required" });
  const clean = phone.replace(/\s/g, "");
  if (!/^\+\d{7,15}$/.test(clean)) return res.status(400).json({ error:"Invalid phone" });
  const valid = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];
  if (!valid.includes(corridor)) return res.status(400).json({ error:"Invalid corridor" });
  db.upsertSubscriber(clean, corridor, amount||1000, bestRate, lang||"en");
  console.log(`✅ Subscriber: ${maskPhone(clean)} → ${corridor}`);
  sendWhatsApp(clean, buildConfirmMessage(corridor, bestRate, lang||"en"));
  res.json({ ok:true });
});

// GET /api/subscribers
app.get("/api/subscribers", (req, res) => {
  const all = db.getAllSubscribers();
  res.json({ count:all.length, subscribers:all.map(s=>({ phone:maskPhone(s.phone), corridor:s.corridor, createdAt:s.created_at })) });
});

// GET /api/test-whatsapp
app.get("/api/test-whatsapp", async (req, res) => {
  const testPhone = process.env.TEST_PHONE;
  if (!testPhone) return res.status(400).json({ error:"TEST_PHONE not set" });
  const subs = db.getAllSubscribers().length;
  await sendWhatsApp(testPhone, `✅ *Hawla test*\n\nEverything working!\nSubscribers: ${subs}\nTime: ${new Date().toISOString()}`);
  res.json({ ok:true, sentTo:maskPhone(testPhone) });
});

// GET /api/scrape — manually trigger scrape
app.get("/api/scrape", async (req, res) => {
  res.json({ ok:true, message:"Scrape started — check server logs" });
  runAllScrapers().then(checkAndAlert).catch(console.error);
});

// Catch-all
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ============================================================
// WHATSAPP HELPERS
// ============================================================
async function sendWhatsApp(to, message) {
  if (!twilioClient) {
    console.log(`📱 [WhatsApp → ${maskPhone(to)}]:\n${message}\n`);
    return;
  }
  try {
    const msg = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   `whatsapp:${to}`,
      body: message,
    });
    console.log(`✅ WhatsApp sent [${msg.sid}]`);
  } catch (err) {
    console.error(`❌ WhatsApp failed: ${err.message}`);
  }
}

function buildConfirmMessage(corridor, rate, lang) {
  const msgs = {
    en: `🏦 *Hawla* — You're subscribed!\n\nWe'll alert you when AED → ${corridor} improves above ${rate?.toFixed(2)||"today's best"}.\n\nReply STOP to unsubscribe.`,
    hi: `🏦 *Hawla* — सब्सक्रिप्शन हो गया!\n\nAED → ${corridor} रेट बेहतर होने पर WhatsApp करेंगे।\n\nSTOP लिखें बंद करने के लिए।`,
    tl: `🏦 *Hawla* — Naka-subscribe ka!\n\nWhatsApp ka namin kapag bumuti ang AED → ${corridor}.\n\nI-reply STOP para mag-unsubscribe.`,
    ur: `🏦 *Hawla* — سبسکرپشن ہو گئی!\n\nAED → ${corridor} ریٹ بہتر ہونے پر WhatsApp کریں گے۔\n\nSTOP لکھیں بند کرنے کے لیے۔`,
  };
  return msgs[lang]||msgs.en;
}

function buildAlertMessage(sub, newRate, oldRate) {
  const pct      = ((newRate-oldRate)/oldRate*100).toFixed(2);
  const receives = Math.round(sub.amount*newRate);
  const msgs = {
    en: `📈 *Hawla Rate Alert!*\n\nAED → ${sub.corridor} improved!\n• Old: ${oldRate.toFixed(2)}\n• New: *${newRate.toFixed(2)}* (+${pct}%)\n• AED ${sub.amount} → *~${receives.toLocaleString()}*\n\nhttps://hawla.ae`,
    hi: `📈 *Hawla रेट अलर्ट!*\n\nAED → ${sub.corridor} बेहतर!\n• पुराना: ${oldRate.toFixed(2)}\n• नया: *${newRate.toFixed(2)}* (+${pct}%)\n• AED ${sub.amount} → *~${receives.toLocaleString()}*\n\nhttps://hawla.ae`,
    tl: `📈 *Hawla Alert!*\n\nAED → ${sub.corridor} bumuti!\n• Dati: ${oldRate.toFixed(2)}\n• Bago: *${newRate.toFixed(2)}* (+${pct}%)\n• AED ${sub.amount} → *~${receives.toLocaleString()}*\n\nhttps://hawla.ae`,
    ur: `📈 *Hawla الرٹ!*\n\nAED → ${sub.corridor} بہتر!\n• پرانا: ${oldRate.toFixed(2)}\n• نیا: *${newRate.toFixed(2)}* (+${pct}%)\n• AED ${sub.amount} → *~${receives.toLocaleString()}*\n\nhttps://hawla.ae`,
  };
  return msgs[sub.lang]||msgs.en;
}

function maskPhone(p) { return p.slice(0,4)+"****"+p.slice(-3); }

// ============================================================
// ALERT CHECKER
// ============================================================
async function checkAndAlert() {
  const bestRates = db.getBestRatePerCorridor();
  for (const { corridor, effective_rate } of bestRates) {
    const snapshot = db.getSnapshot(corridor);
    if (!snapshot) { db.saveSnapshot(corridor, effective_rate); continue; }
    const improvement = (effective_rate - snapshot.best_rate) / snapshot.best_rate;
    if (improvement >= 0.0005) {
      console.log(`📈 ${corridor}: ${snapshot.best_rate.toFixed(4)} → ${effective_rate.toFixed(4)}`);
      const subs = db.getSubscribersByCorridors([corridor]);
      for (const sub of subs) {
        await sendWhatsApp(sub.phone, buildAlertMessage(sub, effective_rate, snapshot.best_rate));
        db.updateSubscriberRate(sub.phone, corridor, effective_rate);
      }
    }
    db.saveSnapshot(corridor, effective_rate);
  }
}

// ============================================================
// CRON — every 30 minutes
// ============================================================
cron.schedule("*/30 * * * *", async () => {
  console.log(`[${new Date().toISOString()}] Cron scrape starting...`);
  try { await runAllScrapers(); await checkAndAlert(); }
  catch (err) { console.error("Cron error:", err.message); }
});

// ============================================================
// START
// ============================================================
app.listen(PORT, async () => {
  console.log(`\n🚀 Hawla running at http://localhost:${PORT}`);
  console.log(`   /api/rates · /api/scrape · /api/test-whatsapp · /api/subscribers\n`);
  try { await runAllScrapers(); await checkAndAlert(); }
  catch (err) { console.error("Initial scrape error:", err.message); }
});