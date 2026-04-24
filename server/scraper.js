
const { chromium } = require("playwright");
const db           = require("./db");

// ── CORRIDORS CONFIG ───────────────────────────────────────
const CORRIDORS = ["INR","PHP","PKR","BDT","NPR","LKR","EGP"];

// ── FALLBACK RATES ─────────────────────────────────────────
// Used when a scraper fails so the app always has data.
// Update these manually once a week as a safety net.
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

// ── SCRAPER HELPERS ────────────────────────────────────────

// Launches a headless browser page with UAE-like headers
async function newPage(browser) {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-AE,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  return page;
}

// Parses a rate string like "23.75" or "23,75" into a float
function parseRate(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[^\d.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) || val < 1 ? null : val;
}

// Saves results to DB — uses fallback for any failed corridor
function saveResults(providerId, results, fee = 0) {
  const rows = [];
  const fallback = FALLBACK_RATES[providerId] || {};

  CORRIDORS.forEach(corridor => {
    const rate = results[corridor] || fallback[corridor];
    if (rate) {
      rows.push({
        provider_id: providerId,
        corridor,
        rate,
        fee,
        source: results[corridor] ? "scraper" : "fallback",
      });
    }
  });

  if (rows.length > 0) {
    db.saveRates(rows);
    const scraped  = rows.filter(r => r.source === "scraper").length;
    const fallback = rows.filter(r => r.source === "fallback").length;
    console.log(`  ✅ ${providerId}: ${scraped} live, ${fallback} fallback`);
  }
}

// ============================================================
// INDIVIDUAL SCRAPERS
// Each function returns an object like { INR: 23.75, PHP: 14.61, ... }
// Return an empty object {} if scraping fails — fallbacks kick in.
// ============================================================

// ── AL ANSARI EXCHANGE ──────────────────────────────────────
async function scrapeAlAnsari(browser) {
  const page = await newPage(browser);
  const results = {};

  try {
    // Al Ansari publishes rates on their main currency page
    await page.goto("https://alansariexchange.com/service/foreign-exchange/", {
      waitUntil: "domcontentloaded", timeout: 20000
    });

    // Wait for rate table to appear
    await page.waitForSelector("table", { timeout: 10000 }).catch(() => {});

    // Extract all currency rows from the page
    const rows = await page.$$eval("tr", rows =>
      rows.map(row => {
        const cells = Array.from(row.querySelectorAll("td,th")).map(c => c.innerText.trim());
        return cells;
      })
    );

    // Map currency codes to our corridor codes
    const currencyMap = {
      "INR": "INR", "INDIAN RUPEE": "INR",
      "PHP": "PHP", "PHILIPPINE PESO": "PHP",
      "PKR": "PKR", "PAKISTAN RUPEE": "PKR",
      "BDT": "BDT", "BANGLADESH TAKA": "BDT",
      "NPR": "NPR", "NEPAL RUPEE": "NPR",
      "LKR": "LKR", "SRI LANKA RUPEE": "LKR",
      "EGP": "EGP", "EGYPT POUND": "EGP",
    };

    rows.forEach(cells => {
      cells.forEach((cell, i) => {
        const upper = cell.toUpperCase();
        const corridor = currencyMap[upper];
        if (corridor && cells[i + 1]) {
          const rate = parseRate(cells[i + 1]);
          if (rate) results[corridor] = rate;
        }
      });
    });

    console.log(`  Al Ansari scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Al Ansari scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── LULU EXCHANGE ───────────────────────────────────────────
async function scrapeLuLu(browser) {
  const page = await newPage(browser);
  const results = {};

  try {
    await page.goto("https://luluexchange.com/en/currency-exchange", {
      waitUntil: "domcontentloaded", timeout: 20000
    });

    await page.waitForSelector(".rate-table, table, .currency-row", { timeout: 10000 }).catch(() => {});

    const rows = await page.$$eval("tr", rows =>
      rows.map(row => ({
        text: row.innerText,
        cells: Array.from(row.querySelectorAll("td")).map(c => c.innerText.trim()),
      }))
    );

    const corridorKeywords = {
      INR: ["INR", "INDIA", "INDIAN RUPEE"],
      PHP: ["PHP", "PHILIPPINE", "PESO"],
      PKR: ["PKR", "PAKISTAN"],
      BDT: ["BDT", "BANGLADESH", "TAKA"],
      NPR: ["NPR", "NEPAL"],
      LKR: ["LKR", "SRI LANKA"],
      EGP: ["EGP", "EGYPT"],
    };

    rows.forEach(({ cells }) => {
      if (cells.length < 2) return;
      const label = cells[0].toUpperCase();

      Object.entries(corridorKeywords).forEach(([corridor, keywords]) => {
        if (keywords.some(k => label.includes(k))) {
          // Try each cell for a valid rate
          for (let i = 1; i < cells.length; i++) {
            const rate = parseRate(cells[i]);
            if (rate && rate > 1) {
              results[corridor] = rate;
              break;
            }
          }
        }
      });
    });

    console.log(`  LuLu scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  LuLu scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── AL FARDAN EXCHANGE ──────────────────────────────────────
async function scrapeAlFardan(browser) {
  const page = await newPage(browser);
  const results = {};

  try {
    await page.goto("https://alfardanexchange.com", {
      waitUntil: "domcontentloaded", timeout: 20000
    });

    await page.waitForSelector("table, .rate, .currency", { timeout: 10000 }).catch(() => {});

    const text = await page.content();

    // Al Fardan often renders rates in JSON inside a script tag
    const jsonMatch = text.match(/rates\s*[:=]\s*(\[[\s\S]*?\])/);
    if (jsonMatch) {
      try {
        const ratesData = JSON.parse(jsonMatch[1]);
        ratesData.forEach(item => {
          const code = (item.currency_code || item.code || "").toUpperCase();
          const rate = parseRate(item.rate || item.buy_rate || item.sell_rate);
          if (CORRIDORS.includes(code) && rate) results[code] = rate;
        });
      } catch {}
    }

    // Fallback: scrape table rows
    if (Object.keys(results).length === 0) {
      const rows = await page.$$eval("tr", rows =>
        rows.map(row =>
          Array.from(row.querySelectorAll("td")).map(c => c.innerText.trim())
        )
      );

      const map = { INR:["INR","INDIA"], PHP:["PHP","PHILIPPINE"], PKR:["PKR","PAKISTAN"],
                    BDT:["BDT","BANGLADESH"], NPR:["NPR","NEPAL"], LKR:["LKR","SRI LANKA"], EGP:["EGP","EGYPT"] };

      rows.forEach(cells => {
        if (cells.length < 2) return;
        const label = cells[0].toUpperCase();
        Object.entries(map).forEach(([corridor, keywords]) => {
          if (keywords.some(k => label.includes(k))) {
            for (let i = 1; i < cells.length; i++) {
              const rate = parseRate(cells[i]);
              if (rate) { results[corridor] = rate; break; }
            }
          }
        });
      });
    }

    console.log(`  Al Fardan scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Al Fardan scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── WISE ────────────────────────────────────────────────────
// Wise has a public API endpoint — no scraping needed
async function scrapeWise(browser) {
  const page = await newPage(browser);
  const results = {};

  // Wise currency pairs to fetch
  const pairs = [
    { from:"AED", to:"INR", corridor:"INR" },
    { from:"AED", to:"PHP", corridor:"PHP" },
    { from:"AED", to:"PKR", corridor:"PKR" },
    { from:"AED", to:"BDT", corridor:"BDT" },
    { from:"AED", to:"NPR", corridor:"NPR" },
    { from:"AED", to:"LKR", corridor:"LKR" },
    { from:"AED", to:"EGP", corridor:"EGP" },
  ];

  try {
    for (const pair of pairs) {
      try {
        // Wise public comparison API
        const url = `https://wise.com/gb/currency-converter/${pair.from.toLowerCase()}-to-${pair.to.toLowerCase()}-rate?amount=1000`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

        // Try to find the rate in the page content
        const content = await page.content();

        // Look for the exchange rate in JSON-LD or meta tags
        const rateMatch = content.match(/"exchangeRate"\s*:\s*([\d.]+)/) ||
                          content.match(/rate['"]\s*:\s*([\d.]+)/) ||
                          content.match(/([\d]{2,3}\.[\d]{2,4})\s*<\/span>/);

        if (rateMatch) {
          const rate = parseRate(rateMatch[1]);
          // Wise fee is ~0.6% — effective rate is slightly lower than mid-market
          if (rate) results[pair.corridor] = parseFloat((rate * 0.994).toFixed(4));
        }

        // Small delay between requests to be polite
        await page.waitForTimeout(1000);
      } catch {}
    }

    console.log(`  Wise scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Wise scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── WESTERN UNION ───────────────────────────────────────────
async function scrapeWesternUnion(browser) {
  const page = await newPage(browser);
  const results = {};

  const pairs = [
    { to:"IN", currency:"INR", corridor:"INR" },
    { to:"PH", currency:"PHP", corridor:"PHP" },
    { to:"PK", currency:"PKR", corridor:"PKR" },
    { to:"BD", currency:"BDT", corridor:"BDT" },
    { to:"NP", currency:"NPR", corridor:"NPR" },
    { to:"LK", currency:"LKR", corridor:"LKR" },
    { to:"EG", currency:"EGP", corridor:"EGP" },
  ];

  try {
    for (const pair of pairs) {
      try {
        const url = `https://www.westernunion.com/us/en/send-money/app/price-estimation?fromCountry=AE&toCountry=${pair.to}&amount=1000&amountCurrencyCountry=AE&toCurrency=${pair.currency}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);

        const content = await page.content();
        const rateMatch = content.match(/"exchangeRate"\s*:\s*([\d.]+)/) ||
                          content.match(/exchange.rate['":\s]+([\d.]+)/i);

        if (rateMatch) {
          const rate = parseRate(rateMatch[1]);
          if (rate) results[pair.corridor] = rate;
        }

        await page.waitForTimeout(1500);
      } catch {}
    }

    console.log(`  Western Union scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Western Union scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── WALL STREET EXCHANGE ────────────────────────────────────
async function scrapeWallStreet(browser) {
  const page = await newPage(browser);
  const results = {};

  try {
    await page.goto("https://wallstreetexchange.com", {
      waitUntil: "domcontentloaded", timeout: 20000
    });
    await page.waitForSelector("table, .rate", { timeout: 10000 }).catch(() => {});

    const rows = await page.$$eval("tr", rows =>
      rows.map(row =>
        Array.from(row.querySelectorAll("td")).map(c => c.innerText.trim())
      )
    );

    const map = { INR:["INR","INDIA"], PHP:["PHP","PHILIPPINE"], PKR:["PKR","PAKISTAN"],
                  BDT:["BDT","BANGLADESH"], NPR:["NPR","NEPAL"], LKR:["LKR","SRI LANKA"], EGP:["EGP","EGYPT"] };

    rows.forEach(cells => {
      if (cells.length < 2) return;
      const label = cells[0].toUpperCase();
      Object.entries(map).forEach(([corridor, keywords]) => {
        if (keywords.some(k => label.includes(k))) {
          for (let i = 1; i < cells.length; i++) {
            const rate = parseRate(cells[i]);
            if (rate) { results[corridor] = rate; break; }
          }
        }
      });
    });

    console.log(`  Wall Street scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Wall Street scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── SHARAF EXCHANGE ─────────────────────────────────────────
async function scrapeSharaf(browser) {
  const page = await newPage(browser);
  const results = {};

  try {
    await page.goto("https://sharafexchange.com", {
      waitUntil: "domcontentloaded", timeout: 20000
    });
    await page.waitForSelector("table, .rate, .currency", { timeout: 10000 }).catch(() => {});

    const rows = await page.$$eval("tr", rows =>
      rows.map(row =>
        Array.from(row.querySelectorAll("td")).map(c => c.innerText.trim())
      )
    );

    const map = { INR:["INR","INDIA"], PHP:["PHP","PHILIPPINE"], PKR:["PKR","PAKISTAN"],
                  BDT:["BDT","BANGLADESH"], NPR:["NPR","NEPAL"], LKR:["LKR","SRI LANKA"], EGP:["EGP","EGYPT"] };

    rows.forEach(cells => {
      if (cells.length < 2) return;
      const label = cells[0].toUpperCase();
      Object.entries(map).forEach(([corridor, keywords]) => {
        if (keywords.some(k => label.includes(k))) {
          for (let i = 1; i < cells.length; i++) {
            const rate = parseRate(cells[i]);
            if (rate) { results[corridor] = rate; break; }
          }
        }
      });
    });

    console.log(`  Sharaf scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Sharaf scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ── REMITLY ─────────────────────────────────────────────────
async function scrapeRemitly(browser) {
  const page = await newPage(browser);
  const results = {};

  const pairs = [
    { to:"IN", currency:"INR", corridor:"INR" },
    { to:"PH", currency:"PHP", corridor:"PHP" },
    { to:"PK", currency:"PKR", corridor:"PKR" },
    { to:"BD", currency:"BDT", corridor:"BDT" },
    { to:"NP", currency:"NPR", corridor:"NPR" },
    { to:"LK", currency:"LKR", corridor:"LKR" },
    { to:"EG", currency:"EGP", corridor:"EGP" },
  ];

  try {
    for (const pair of pairs) {
      try {
        const url = `https://www.remitly.com/us/en/united-arab-emirates/india?sourceAmount=1000&sourceCurrency=AED&targetCurrency=${pair.currency}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);

        const content = await page.content();
        const rateMatch = content.match(/"exchangeRate"\s*:\s*"?([\d.]+)"?/) ||
                          content.match(/exchange.rate['":\s]+"?([\d.]+)/i);

        if (rateMatch) {
          const rate = parseRate(rateMatch[1]);
          if (rate) results[pair.corridor] = rate;
        }

        await page.waitForTimeout(1000);
      } catch {}
    }

    console.log(`  Remitly scraped: ${Object.keys(results).join(", ") || "none"}`);
  } catch (err) {
    console.log(`  Remitly scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return results;
}

// ============================================================
// SCRAPERS REGISTRY
// Add new providers here — name, id, fee, and scraper function
// ============================================================
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

// ============================================================
// MAIN RUN FUNCTION — called by cron job every 30 min
// ============================================================
async function runAllScrapers() {
  console.log(`\n[${new Date().toISOString()}] Starting scrape run...`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",  // Important for Railway/Docker
      "--disable-gpu",
    ],
  });

  let successCount = 0;
  let failCount    = 0;

  for (const scraper of SCRAPERS) {
    console.log(`\n→ Scraping ${scraper.name}...`);
    try {
      const results = await scraper.fn(browser);
      saveResults(scraper.id, results, scraper.fee);
      successCount++;
    } catch (err) {
      console.log(`  ❌ ${scraper.name} failed completely: ${err.message}`);
      // Save fallbacks so the app always has data
      saveResults(scraper.id, {}, scraper.fee);
      failCount++;
    }

    // Polite delay between providers
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  console.log(`\n✅ Scrape complete: ${successCount} success, ${failCount} failed\n`);
}

// ── Run directly if called as a script ──
if (require.main === module) {
  runAllScrapers()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runAllScrapers };