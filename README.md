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
