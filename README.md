# 🏦 Hawla — UAE Remittance Rate Comparator

Compare exchange rates across all UAE exchange houses and digital apps.
Shows exactly how much your family receives — after all fees.

---

## What's in this repo

```
hawla/
├── public/
│   ├── index.html     ← The entire frontend (one file, open in any browser)
│   └── rates.js       ← Rate data used by the server (shared source of truth)
├── server/
│   └── index.js       ← Express backend (alerts, WhatsApp, cron job)
├── package.json
├── .env.example       ← Copy to .env and fill in your Twilio keys
├── .gitignore
└── README.md
```

---

## Option A — Just open the frontend (no server needed)

If you just want to see the app and share it:

1. Open `public/index.html` in your browser — it works fully offline
2. To update rates, edit the numbers in the `PROVIDERS` array inside `index.html`
3. To share online, drag the `public/` folder to [Netlify Drop](https://app.netlify.com/drop) — free, instant

That's it. No server, no install, no code.

---

## Option B — Run with backend (alerts + WhatsApp)

The backend adds:
- WhatsApp alerts when rates improve (via Twilio)
- `/api/alerts` endpoint for the subscription form
- `/api/rates` endpoint for future automation
- Cron job that checks every 30 minutes

### Step 1 — Install Node.js

Download from: https://nodejs.org (choose the "LTS" version)

### Step 2 — Install dependencies

Open a terminal in this folder and run:

```bash
npm install
```

### Step 3 — Set up Twilio (for WhatsApp)

1. Go to https://twilio.com and sign up (free)
2. Click "Messaging" → "Try it out" → "Send a WhatsApp message"
3. Follow the sandbox setup (you'll scan a QR code)
4. Copy your Account SID and Auth Token from the Twilio console

### Step 4 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

The `TWILIO_WHATSAPP_FROM` number is Twilio's sandbox number — use it until
you apply for a dedicated WhatsApp number (takes 1–2 weeks).

### Step 5 — Run the server

```bash
npm run dev     # development (auto-restarts when you save files)
npm start       # production
```

Open http://localhost:3000 in your browser.

---

## How to update rates (your daily task)

Open `public/index.html`, find the `PROVIDERS` array in the `<script>` block,
and update the `rate` values. Then update `LAST_UPDATED` at the top.

**Check these sites each morning and evening:**
- Al Ansari: https://alansariexchange.com/service/foreign-exchange/
- LuLu: https://luluexchange.com/en/currency-exchange
- Al Fardan: https://alfardanexchange.com (currency converter tool)
- Wise: https://wise.com/gb/currency-converter/aed-to-inr-rate
- Remitly: https://remitly.com (enter amount and check)

Takes about 10–15 minutes. This is temporary — automated scraping comes next.

---

## Deploying to the internet (free)

### Frontend only (Netlify)
1. Go to https://app.netlify.com/drop
2. Drag the `public/` folder onto the page
3. You get a live URL instantly

### Full stack (Railway)
1. Push this repo to GitHub
2. Go to https://railway.app
3. Click "New Project" → "Deploy from GitHub repo"
4. Add your environment variables in the Railway dashboard
5. Done — Railway gives you a live URL

Monthly cost: ~$5

---

## Monetisation plan (when you have traffic)

1. **Affiliate links** — Exchange houses pay per referred customer
   - Reach out to Al Ansari, LuLu, Wise once you have 1,000+ monthly users
   - Typical rate: AED 2–5 per completed transfer

2. **Featured listings** — Charge providers AED 500–2,000/month
   to appear first (clearly labelled "sponsored")

3. **Rate data licensing** — Sell historical rate data to
   financial research firms, restaurant chains, hedge funds

---

## Roadmap

- [ ] Automate rate scraping (Playwright scripts for each provider)
- [ ] Add PostgreSQL for persistent subscriber storage
- [ ] Build admin dashboard to manage rates + subscribers
- [ ] Add more corridors (KES, GHS, ETB)
- [ ] Add historical rate charts (best time to send)
- [ ] iOS/Android app wrapper (Capacitor — converts web app to native)

---

## Questions / help

Built with Claude. If you get stuck, paste your error message and ask for help.
