Hawla — UAE Remittance Rate Comparator

Compare exchange rates across UAE exchange houses and digital apps. See exactly how much your family receives — after all fees. Get a WhatsApp alert the moment your rate improves.

Hawla is a side project I built to solve a real problem in the UAE: migrant workers sending money home (over $40B/year) routinely lose money because rates vary significantly across providers and change throughout the day. Most people don't have time to check eight different exchange house websites before every transfer.
Hawla scrapes live rates every 30 minutes, compares them side-by-side, and sends a WhatsApp alert when the rate for a user's chosen corridor improves. Available in English, Hindi, Tagalog, and Urdu — the four largest remittance-sending communities in the UAE.
Stack

Backend: Node.js + Express
Scheduling: node-cron (30-minute scrape interval)
Alerts: Twilio WhatsApp Business API
Storage: Lightweight SQLite layer (server/db.js)
Frontend: Single-file vanilla HTML/JS (public/index.html) — fast, no build step
Deploy: Railway

Architecture
┌────────────────────────────────────────────────────┐
│  Cron (every 30 min)                               │
│    ↓                                               │
│  runAllScrapers() → fetch rates from 8 providers   │
│    ↓                                               │
│  checkAndAlert() → diff vs last snapshot           │
│    ↓                                               │
│  Twilio WhatsApp → subscribed users (localized)    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  Frontend → /api/rates → live comparison table     │
│  Frontend → /api/alerts → subscribe to corridor    │
└────────────────────────────────────────────────────┘


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
