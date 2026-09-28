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
Account records are stored in PostgreSQL; the API synchronizes the Prisma
schema before starting. Messages and OTP challenges remain in memory for now.
Set `AUTH_TOKEN_SECRET` to a random value of at least 32 bytes for stable signed
sessions; without it, the backend creates a temporary secret at startup and
sessions are invalidated when the process restarts.
Generate a secret with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

For SMS verification, set `TWO_FACTOR_API_KEY` and the approved
`TWO_FACTOR_OTP_TEMPLATE` from your 2Factor account. OTPs expire after five
minutes, allow at most five verification attempts, and are never returned by the
API. If the provider is not configured or delivery fails, sign-up and login
remain available through the explicit password option.

Run backend auth checks with `npm test` from `phone-mail-backend`.
The `dev`, `test`, and `build` scripts generate the Prisma client automatically.

Profile names, About descriptions, and photos are shared with other users in
conversation lists and contact details. Profile photos can be PNG, JPEG, WebP,
or GIF images up to 2 MB.

## Local inbound email testing

The root Compose stack provides Mailpit on http://localhost:8025 and SMTP at
`localhost:1025`. Send an email to a registered address such as
`9876543210@phonemail.com`; the backend polls Mailpit and imports the message
into that PhoneMail account's conversations. Messages remain local and are not
delivered to the public internet. Public inbound delivery still requires a
domain you control and an inbound email provider.

Sending from a registered PhoneMail account to another registered
`@phonemail.com` address is delivered directly to the recipient's PhoneMail
inbox and saved to PostgreSQL; Gmail SMTP and public DNS are not used for that
path. Sending to external email addresses continues to use SMTP. Up to five
attachments (10 MB each) are stored with local messages and delivered with
external email.
