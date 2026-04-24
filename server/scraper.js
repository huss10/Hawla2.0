// ============================================================
// HAWLA — server/scraper.js
// ============================================================
// Strategy per provider:
//   Wise        → Public JSON API (reliable, always works)
//   Exchange houses → Try JSON API first, fall back to axios
//                     HTML fetch, then fallback rates
//   Remitly/WU  → Public rate pages via axios (no browser needed)
//
// We use axios for simple HTTP requests (faster, no bot detection)
// and only use Playwright as last resort.
// ============================================================

const axios  = require("axios");
const db     = require("./db");

const CORRIDORS = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];

const FALLBACK_RATES = {
  al_ansari:     { INR:23.75, PHP:14.61, PKR:76.20, BDT:30.10, NPR:38.05, LKR:82.40, EGP:13.82 },
  lulu_exchange: { INR:23.72, PHP:14.58, PKR:76.00, BDT:30.05, NPR:37.95, LKR:82.10, EGP:13.78 },
  al_fardan:     { INR:23.80, PHP:14.63, PKR:76.40, BDT:30.20, NPR:38.10, LKR:82.60, EGP:13.85 },
  wall_street:   { INR:23.70, PHP:14.56, PKR:75.80, BDT:29.95, NPR:37.88, LKR:81.90, EGP:13.74 },
  sharaf:        { INR:23.68, PHP:14.54, PKR:75.70, BDT:29.90, NPR:37.82, LKR:81.70, EGP:13.71 },
  wise:          { INR:23.88, PHP:14.70, PKR:76.60, BDT:30.30, NPR:38.20, LKR:82.80, EGP:13.90 },
  remitly:       { INR:23.85, PHP:14.66, PKR:76.50, BDT:30.25, NPR:38.15, LKR:82.70, EGP:13.88 },
  western_union: { INR:23.60, PHP:14.50, PKR:75.50, BDT:29.80, NPR:37.70, LKR:81.50, EGP:13.68 },
};

const CURRENCY_MAP = {
  INR: ["INR","INDIAN","INDIA"],
  PHP: ["PHP","PHILIPPINE","PESO"],
  PKR: ["PKR","PAKISTAN"],
  BDT: ["BDT","BANGLADESH","TAKA"],
  NPR: ["NPR","NEPAL"],
  LKR: ["LKR","SRI LANKA","SRI_LANKA"],
  EGP: ["EGP","EGYPT"],
};

// Standard browser-like headers for axios requests
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AE,en;q=0.9",
  "Cache-Control": "no-cache",
};

function parseRate(val) {
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val).replace(/[^\d.]/g, ""));
  return (!isNaN(n) && n >= 1 && n <= 500) ? n : null;
}

// Try to extract rates from plain HTML text
function extractFromText(text) {
  const results = {};
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const upper = line.toUpperCase();
    Object.entries(CURRENCY_MAP).forEach(([corridor, keywords]) => {
      if (results[corridor]) return;
      if (keywords.some(k => upper.includes(k))) {
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const nums = lines[j].match(/\d{2,3}\.\d{2,6}/g);
          if (nums) {
            const rate = parseRate(nums[0]);
            if (rate && rate > 5) { results[corridor] = rate; break; }
          }
        }
      }
    });
  });
  return results;
}

// ── WISE — public JSON API ──────────────────────────────────
// Most reliable — Wise publishes live mid-market rates via API
async function scrapeWise() {
  const results = {};
  const targets = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];

  for (const currency of targets) {
    try {
      // Wise public rates API
      const res = await axios.get(
        `https://wise.com/rates/live?source=AED&target=${currency}`,
        { headers: HEADERS, timeout: 10000 }
      );
      const rate = res.data?.value || res.data?.rate;
      if (rate) {
        // Apply ~0.6% Wise fee to get effective rate
        results[currency] = parseFloat((rate * 0.994).toFixed(4));
      }
    } catch {
      // Try alternate endpoint
      try {
        const res2 = await axios.get(
          `https://api.wise.com/v1/rates?source=AED&target=${currency}`,
          { headers: HEADERS, timeout: 10000 }
        );
        const data = Array.isArray(res2.data) ? res2.data[0] : res2.data;
        const rate = data?.rate;
        if (rate) results[currency] = parseFloat((rate * 0.994).toFixed(4));
      } catch {}
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`  Wise: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── AL ANSARI — axios HTML fetch ────────────────────────────
async function scrapeAlAnsari() {
  const results = {};
  const urls = [
    "https://alansariexchange.com/service/foreign-exchange/",
    "https://alansariexchange.com/exchange-rates/",
    "https://alansariexchange.com/wp-json/rates/v1/all", // common WP REST endpoint
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const data = res.data;

      // If JSON response
      if (typeof data === "object") {
        const rates = data?.rates || data?.data || data;
        if (Array.isArray(rates)) {
          rates.forEach(item => {
            const code = (item?.currency_code || item?.code || item?.currency || "").toUpperCase();
            if (CORRIDORS.includes(code)) {
              const rate = parseRate(item?.rate || item?.sell_rate || item?.buy_rate);
              if (rate) results[code] = rate;
            }
          });
        }
      }

      // If HTML response
      if (typeof data === "string") {
        const extracted = extractFromText(data);
        Object.assign(results, extracted);
      }

      if (Object.keys(results).length >= 3) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  Al Ansari: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── LULU EXCHANGE ───────────────────────────────────────────
async function scrapeLuLu() {
  const results = {};
  const urls = [
    "https://luluexchange.com/en/currency-exchange",
    "https://luluexchange.com/api/rates",
    "https://luluexchange.com/currency-rates",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const data = res.data;

      if (typeof data === "object") {
        const rates = data?.rates || data?.data || (Array.isArray(data) ? data : null);
        if (rates) {
          (Array.isArray(rates) ? rates : Object.entries(rates)).forEach(item => {
            const entry = Array.isArray(item) ? { code: item[0], rate: item[1] } : item;
            const code = (entry?.code || entry?.currency || entry?.currency_code || "").toUpperCase();
            if (CORRIDORS.includes(code)) {
              const rate = parseRate(entry?.rate || entry?.value);
              if (rate) results[code] = rate;
            }
          });
        }
      }

      if (typeof data === "string") {
        const extracted = extractFromText(data);
        Object.assign(results, extracted);
      }

      if (Object.keys(results).length >= 3) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  LuLu: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── AL FARDAN ───────────────────────────────────────────────
async function scrapeAlFardan() {
  const results = {};
  const urls = [
    "https://alfardanexchange.com",
    "https://alfardanexchange.com/rates",
    "https://alfardanexchange.com/api/rates",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const data = res.data;
      if (typeof data === "string") {
        // Look for JSON embedded in HTML
        const jsonMatch = data.match(/rates\s*[:=]\s*(\[[\s\S]{20,500}?\])/);
        if (jsonMatch) {
          try {
            const rates = JSON.parse(jsonMatch[1]);
            rates.forEach(item => {
              const code = (item?.code || item?.currency || "").toUpperCase();
              if (CORRIDORS.includes(code)) {
                const rate = parseRate(item?.rate || item?.sell);
                if (rate) results[code] = rate;
              }
            });
          } catch {}
        }
        if (Object.keys(results).length < 3) {
          const extracted = extractFromText(data);
          Object.assign(results, extracted);
        }
      }
      if (Object.keys(results).length >= 3) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  Al Fardan: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── WALL STREET EXCHANGE ────────────────────────────────────
async function scrapeWallStreet() {
  const results = {};
  const urls = [
    "https://wallstreetexchange.com",
    "https://wallstreetexchange.com/exchange-rates",
    "https://wallstreetexchange.com/api/rates",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const data = res.data;
      if (typeof data === "string") {
        const extracted = extractFromText(data);
        Object.assign(results, extracted);
      } else if (typeof data === "object") {
        const rates = data?.rates || data?.data || [];
        rates.forEach && rates.forEach(item => {
          const code = (item?.code || item?.currency || "").toUpperCase();
          if (CORRIDORS.includes(code)) {
            const rate = parseRate(item?.rate || item?.sell);
            if (rate) results[code] = rate;
          }
        });
      }
      if (Object.keys(results).length >= 3) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  Wall Street: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── SHARAF EXCHANGE ─────────────────────────────────────────
async function scrapeSharaf() {
  const results = {};
  const urls = [
    "https://sharafexchange.com/exchange-rates",
    "https://sharafexchange.com",
    "https://sharafexchange.com/api/rates",
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const data = res.data;
      if (typeof data === "string") {
        const extracted = extractFromText(data);
        Object.assign(results, extracted);
      }
      if (Object.keys(results).length >= 3) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  Sharaf: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── REMITLY — public rate pages ─────────────────────────────
async function scrapeRemitly() {
  const results = {};
  const targets = [
    { corridor:"INR", url:"https://www.remitly.com/ae/en/india?sourceAmount=1000&sourceCurrency=AED&targetCurrency=INR" },
    { corridor:"PHP", url:"https://www.remitly.com/ae/en/philippines?sourceAmount=1000&sourceCurrency=AED&targetCurrency=PHP" },
    { corridor:"PKR", url:"https://www.remitly.com/ae/en/pakistan?sourceAmount=1000&sourceCurrency=AED&targetCurrency=PKR" },
    { corridor:"BDT", url:"https://www.remitly.com/ae/en/bangladesh?sourceAmount=1000&sourceCurrency=AED&targetCurrency=BDT" },
    { corridor:"NPR", url:"https://www.remitly.com/ae/en/nepal?sourceAmount=1000&sourceCurrency=AED&targetCurrency=NPR" },
    { corridor:"LKR", url:"https://www.remitly.com/ae/en/sri-lanka?sourceAmount=1000&sourceCurrency=AED&targetCurrency=LKR" },
    { corridor:"EGP", url:"https://www.remitly.com/ae/en/egypt?sourceAmount=1000&sourceCurrency=AED&targetCurrency=EGP" },
  ];

  for (const t of targets) {
    try {
      const res = await axios.get(t.url, { headers: HEADERS, timeout: 15000 });
      const html = res.data;
      // Look for exchange rate in page source
      const match = html.match(/"exchangeRate"\s*[":]+\s*"?([\d.]+)"?/) ||
                    html.match(/data-exchange-rate="([\d.]+)"/) ||
                    html.match(/exchange_rate['":\s]+([\d.]+)/i);
      if (match) {
        const rate = parseRate(match[1]);
        if (rate) results[t.corridor] = rate;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`  Remitly: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── WESTERN UNION ───────────────────────────────────────────
async function scrapeWesternUnion() {
  const results = {};
  const targets = [
    { corridor:"INR", to:"IN", currency:"INR" },
    { corridor:"PHP", to:"PH", currency:"PHP" },
    { corridor:"PKR", to:"PK", currency:"PKR" },
    { corridor:"BDT", to:"BD", currency:"BDT" },
    { corridor:"NPR", to:"NP", currency:"NPR" },
    { corridor:"LKR", to:"LK", currency:"LKR" },
    { corridor:"EGP", to:"EG", currency:"EGP" },
  ];

  for (const t of targets) {
    try {
      const url = `https://www.westernunion.com/us/en/send-money/app/price-estimation?fromCountry=AE&toCountry=${t.to}&amount=1000&amountCurrencyCountry=AE&toCurrency=${t.currency}`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const data = res.data;
      if (typeof data === "object") {
        const rate = parseRate(data?.exchangeRate || data?.exchange_rate || data?.rate);
        if (rate) results[t.corridor] = rate;
      } else if (typeof data === "string") {
        const match = data.match(/"exchangeRate"\s*:\s*([\d.]+)/);
        if (match) {
          const rate = parseRate(match[1]);
          if (rate) results[t.corridor] = rate;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`  Western Union: ${Object.keys(results).join(", ") || "none"}`);
  return results;
}

// ── SAVE TO DB ─────────────────────────────────────────────
function saveResults(providerId, results, fee = 0) {
  const rows = [];
  const fallback = FALLBACK_RATES[providerId] || {};
  CORRIDORS.forEach(corridor => {
    const rate   = results[corridor] || fallback[corridor];
    const source = results[corridor] ? "scraper" : "fallback";
    if (rate) rows.push({ provider_id:providerId, corridor, rate, fee, source });
  });
  if (rows.length > 0) {
    db.saveRates(rows);
    const live = rows.filter(r => r.source === "scraper").length;
    const fall = rows.filter(r => r.source === "fallback").length;
    console.log(`  ✅ ${providerId}: ${live} live, ${fall} fallback`);
  }
}

// ── REGISTRY ───────────────────────────────────────────────
const SCRAPERS = [
  { id:"al_ansari",    name:"Al Ansari Exchange",  fee:0,    fn:scrapeAlAnsari    },
  { id:"lulu_exchange",name:"LuLu Exchange",        fee:0,    fn:scrapeLuLu        },
  { id:"al_fardan",   name:"Al Fardan Exchange",   fee:0,    fn:scrapeAlFardan    },
  { id:"wall_street",  name:"Wall Street Exchange", fee:0,    fn:scrapeWallStreet  },
  { id:"sharaf",       name:"Sharaf Exchange",      fee:0,    fn:scrapeSharaf      },
  { id:"wise",         name:"Wise",                 fee:0,    fn:scrapeWise        },
  { id:"remitly",      name:"Remitly",              fee:3.99, fn:scrapeRemitly     },
  { id:"western_union",name:"Western Union",        fee:5.00, fn:scrapeWesternUnion},
];

// ── MAIN ───────────────────────────────────────────────────
async function runAllScrapers() {
  console.log(`\n[${new Date().toISOString()}] Starting scrape run...`);

  for (const scraper of SCRAPERS) {
    console.log(`\n→ Scraping ${scraper.name}...`);
    try {
      const results = await scraper.fn();
      saveResults(scraper.id, results, scraper.fee);
    } catch (err) {
      console.log(`  ❌ ${scraper.name}: ${err.message.slice(0,80)}`);
      saveResults(scraper.id, {}, scraper.fee);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n✅ Scrape run complete\n`);
}

if (require.main === module) {
  runAllScrapers()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runAllScrapers };