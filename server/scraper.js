// ============================================================
// HAWLA — server/scraper.js
// ============================================================
const { chromium } = require("playwright");
const db           = require("./db");

const CORRIDORS = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];

// Fallback rates — used when scraper fails
// Update these manually once a week as a safety net
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

// Currency keyword map — used by all table scrapers
const CURRENCY_MAP = {
  INR: ["INR","INDIAN","INDIA"],
  PHP: ["PHP","PHILIPPINE","PESO","FILIPINO"],
  PKR: ["PKR","PAKISTAN","PAKISTANI"],
  BDT: ["BDT","BANGLADESH","BANGLADESHI","TAKA"],
  NPR: ["NPR","NEPAL","NEPALESE"],
  LKR: ["LKR","SRI LANKA","SRI LANKAN"],
  EGP: ["EGP","EGYPT","EGYPTIAN"],
};

// ── HELPERS ────────────────────────────────────────────────

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-AE,en;q=0.9,ar;q=0.8",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  });
  // Block images/fonts/css to speed up scraping
  await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,css}", r => r.abort());
  return page;
}

function parseRate(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[^\d.]/g, "");
  const val = parseFloat(cleaned);
  // Rates should be between 1 and 500 to be valid
  return (!isNaN(val) && val >= 1 && val <= 500) ? val : null;
}

// Generic table scraper — works for most exchange house sites
async function scrapeTable(page, url) {
  const results = {};
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Wait a bit for JS-rendered content
    await page.waitForTimeout(3000);

    // Try to get all text content and find rates near currency names
    const bodyText = await page.evaluate(() => document.body.innerText);
    const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);

    lines.forEach((line, i) => {
      const upper = line.toUpperCase();
      Object.entries(CURRENCY_MAP).forEach(([corridor, keywords]) => {
        if (results[corridor]) return; // already found
        if (keywords.some(k => upper.includes(k))) {
          // Look at this line and next 3 lines for a valid rate
          for (let j = i; j < Math.min(i + 4, lines.length); j++) {
            const rate = parseRate(lines[j]);
            if (rate && rate > 5) { // Rates should be > 5
              results[corridor] = rate;
              break;
            }
          }
        }
      });
    });

    // Also try table cells directly
    if (Object.keys(results).length < 3) {
      const tableData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("tr"));
        return rows.map(row => ({
          cells: Array.from(row.querySelectorAll("td,th")).map(c => c.innerText.trim())
        }));
      });

      tableData.forEach(({ cells }) => {
        if (cells.length < 2) return;
        const label = cells[0].toUpperCase();
        Object.entries(CURRENCY_MAP).forEach(([corridor, keywords]) => {
          if (results[corridor]) return;
          if (keywords.some(k => label.includes(k))) {
            for (let i = 1; i < cells.length; i++) {
              const rate = parseRate(cells[i]);
              if (rate && rate > 5) { results[corridor] = rate; break; }
            }
          }
        });
      });
    }
  } catch (err) {
    console.log(`    Table scrape error: ${err.message.slice(0, 80)}`);
  }
  return results;
}

// ── SCRAPERS ───────────────────────────────────────────────

async function scrapeAlAnsari(browser) {
  const page = await newPage(browser);
  let results = {};
  try {
    results = await scrapeTable(page, "https://alansariexchange.com/service/foreign-exchange/");
    // Try alternate URL if main fails
    if (Object.keys(results).length < 3) {
      results = await scrapeTable(page, "https://alansariexchange.com/exchange-rates/");
    }
    console.log(`  Al Ansari: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  Al Ansari error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

async function scrapeLuLu(browser) {
  const page = await newPage(browser);
  let results = {};
  try {
    results = await scrapeTable(page, "https://luluexchange.com/en/currency-exchange");
    if (Object.keys(results).length < 3) {
      results = await scrapeTable(page, "https://luluexchange.com/currency-rates");
    }
    console.log(`  LuLu: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  LuLu error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

async function scrapeAlFardan(browser) {
  const page = await newPage(browser);
  let results = {};
  try {
    results = await scrapeTable(page, "https://alfardanexchange.com");
    console.log(`  Al Fardan: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  Al Fardan error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

async function scrapeWallStreet(browser) {
  const page = await newPage(browser);
  let results = {};
  try {
    results = await scrapeTable(page, "https://wallstreetexchange.com");
    console.log(`  Wall Street: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  Wall Street error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

async function scrapeSharaf(browser) {
  const page = await newPage(browser);
  let results = {};
  try {
    results = await scrapeTable(page, "https://sharafexchange.com/exchange-rates");
    if (Object.keys(results).length < 3) {
      results = await scrapeTable(page, "https://sharafexchange.com");
    }
    console.log(`  Sharaf: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  Sharaf error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

// ── WISE — uses public API endpoint (most reliable) ────────
async function scrapeWise(browser) {
  const page = await newPage(browser);
  const results = {};
  const pairs = [
    { corridor:"INR", to:"INR" }, { corridor:"PHP", to:"PHP" },
    { corridor:"PKR", to:"PKR" }, { corridor:"BDT", to:"BDT" },
    { corridor:"NPR", to:"NPR" }, { corridor:"LKR", to:"LKR" },
    { corridor:"EGP", to:"EGP" },
  ];
  try {
    for (const pair of pairs) {
      try {
        // Wise public comparison API — returns JSON
        const url = `https://wise.com/rates/live?source=AED&target=${pair.to}`;
        const response = await page.goto(url, { waitUntil:"domcontentloaded", timeout:15000 });
        const text = await page.evaluate(() => document.body.innerText);
        const data = JSON.parse(text);
        // Apply ~0.6% fee to get effective rate
        const rate = data?.value || data?.rate || data?.mid;
        if (rate) results[pair.corridor] = parseFloat((rate * 0.994).toFixed(4));
      } catch {
        // Try alternate URL
        try {
          const url2 = `https://wise.com/gb/currency-converter/aed-to-${pair.to.toLowerCase()}-rate?amount=1`;
          await page.goto(url2, { waitUntil:"domcontentloaded", timeout:15000 });
          const content = await page.content();
          const match = content.match(/"rate"\s*:\s*([\d.]+)/) ||
                        content.match(/([\d]{2,3}\.[\d]{2,6})/);
          if (match) {
            const rate = parseRate(match[1]);
            if (rate) results[pair.corridor] = parseFloat((rate * 0.994).toFixed(4));
          }
        } catch {}
      }
      await page.waitForTimeout(800);
    }
    console.log(`  Wise: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  Wise error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

// ── REMITLY ────────────────────────────────────────────────
async function scrapeRemitly(browser) {
  const page = await newPage(browser);
  const results = {};
  const targets = [
    { corridor:"INR", country:"india",       currency:"INR" },
    { corridor:"PHP", country:"philippines", currency:"PHP" },
    { corridor:"PKR", country:"pakistan",    currency:"PKR" },
    { corridor:"BDT", country:"bangladesh",  currency:"BDT" },
    { corridor:"NPR", country:"nepal",       currency:"NPR" },
    { corridor:"LKR", country:"sri-lanka",   currency:"LKR" },
    { corridor:"EGP", country:"egypt",       currency:"EGP" },
  ];
  try {
    for (const t of targets) {
      try {
        const url = `https://www.remitly.com/ae/en/${t.country}?sourceAmount=1000&sourceCurrency=AED&targetCurrency=${t.currency}`;
        await page.goto(url, { waitUntil:"domcontentloaded", timeout:20000 });
        await page.waitForTimeout(2500);
        const content = await page.content();
        const match = content.match(/"exchangeRate"\s*[":]+\s*"?([\d.]+)"?/) ||
                      content.match(/exchange.rate[^"]*"([\d.]+)"/i) ||
                      content.match(/data-rate="([\d.]+)"/);
        if (match) {
          const rate = parseRate(match[1]);
          if (rate) results[t.corridor] = rate;
        }
      } catch {}
      await page.waitForTimeout(1000);
    }
    console.log(`  Remitly: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  Remitly error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
  return results;
}

// ── WESTERN UNION ──────────────────────────────────────────
async function scrapeWesternUnion(browser) {
  const page = await newPage(browser);
  const results = {};
  const targets = [
    { corridor:"INR", toCountry:"IN", toCurrency:"INR" },
    { corridor:"PHP", toCountry:"PH", toCurrency:"PHP" },
    { corridor:"PKR", toCountry:"PK", toCurrency:"PKR" },
    { corridor:"BDT", toCountry:"BD", toCurrency:"BDT" },
    { corridor:"NPR", toCountry:"NP", toCurrency:"NPR" },
    { corridor:"LKR", toCountry:"LK", toCurrency:"LKR" },
    { corridor:"EGP", toCountry:"EG", toCurrency:"EGP" },
  ];
  try {
    for (const t of targets) {
      try {
        // WU price estimation API
        const url = `https://www.westernunion.com/us/en/send-money/app/price-estimation?fromCountry=AE&toCountry=${t.toCountry}&amount=1000&amountCurrencyCountry=AE&toCurrency=${t.toCurrency}`;
        await page.goto(url, { waitUntil:"domcontentloaded", timeout:20000 });
        await page.waitForTimeout(2000);
        const content = await page.content();
        const match = content.match(/"exchangeRate"\s*:\s*([\d.]+)/) ||
                      content.match(/exchangeRate['":\s]+([\d.]+)/i);
        if (match) {
          const rate = parseRate(match[1]);
          if (rate) results[t.corridor] = rate;
        }
      } catch {}
      await page.waitForTimeout(1200);
    }
    console.log(`  Western Union: ${Object.keys(results).join(", ") || "none"}`);
  } catch (e) { console.log(`  WU error: ${e.message.slice(0,60)}`); }
  finally { await page.close(); }
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

// ── SCRAPERS REGISTRY ──────────────────────────────────────
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

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  for (const scraper of SCRAPERS) {
    console.log(`\n→ Scraping ${scraper.name}...`);
    try {
      const results = await scraper.fn(browser);
      saveResults(scraper.id, results, scraper.fee);
    } catch (err) {
      console.log(`  ❌ ${scraper.name} crashed: ${err.message.slice(0,80)}`);
      saveResults(scraper.id, {}, scraper.fee); // save fallbacks
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();
  console.log(`\n✅ Scrape run complete\n`);
}

if (require.main === module) {
  runAllScrapers().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runAllScrapers };