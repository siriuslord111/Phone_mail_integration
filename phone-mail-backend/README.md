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

## Authentication setup

Password accounts use Argon2id hashes, and sign-in attempts are rate-limited.
Set `AUTH_TOKEN_SECRET` to a random value of at least 32 bytes for stable signed
sessions; without it, the backend creates a temporary secret at startup and
sessions are invalidated when the process restarts. Account data is currently
held in memory and is also lost on restart.
Generate a secret with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

For SMS verification, set `TWO_FACTOR_API_KEY` and the approved
`TWO_FACTOR_OTP_TEMPLATE` from your 2Factor account. OTPs expire after five
minutes, allow at most five verification attempts, and are never returned by the
API. If the provider is not configured or delivery fails, sign-up and login
remain available through the explicit password option.

Run backend auth checks with `npm test` from `phone-mail-backend`.
