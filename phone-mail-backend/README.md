# PhoneMail

A lightweight PhoneMail demo that includes a Node/Express backend, WhatsApp-inspired mobile UI, a Gmail-inspired web UI, and a registration portal.

## Run locally

From the repository root:

```bash
docker compose up -d
```

Then open:

- Web app: http://localhost:3000/
- Mobile UI: http://localhost:3000/mobile
- Registration portal: http://localhost:3000/portal
- GitHub React frontend: http://localhost:5173/
- API health: http://localhost:3000/health

## Demo authentication

If Twilio credentials are missing, the app falls back to demo OTP generation. The generated OTP is returned in the API response for testing purposes.
