# PhoneMail

A lightweight PhoneMail prototype with a React client, Express API, and PostgreSQL
Compose service.

## Authentication setup

Copy `.env.example` to `.env`. Configure `AUTH_TOKEN_SECRET` with at least 32
random bytes for stable signed sessions. For SMS OTP, add your 2Factor API key
and approved template name as `TWO_FACTOR_API_KEY` and
`TWO_FACTOR_OTP_TEMPLATE`. If SMS delivery is not configured, use the explicit
password option. Passwords are stored as Argon2id hashes and login attempts are
rate-limited.

Accounts are still held in memory and will be lost when the API restarts; a
database migration/persistence pass remains necessary.

The 2Factor integration expects a valid account API key and an approved OTP SMS
template; delivery cannot be tested until those credentials are supplied.

## Sending email

The React compose screen sends mail through the SMTP account configured for the
backend. For Gmail, enable 2-Step Verification and create a Google App Password
(do not use your normal Gmail password). Put these values in the root `.env`
file; `.env` is ignored by Git:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASSWORD=your-google-app-password
SMTP_FROM=your-address@gmail.com
```

Restart/rebuild the API after changing the settings:

```bash
docker compose up -d --build api
```

For a real delivery test, enter an ordinary email address you can access in the
compose recipient field. Entering only a phone number still creates a
`number@phonemail.com` recipient, but that address will receive mail only if
`phonemail.com` is configured to accept and route email. SMTP acceptance means
the provider accepted the message for delivery; it does not guarantee that the
recipient's inbox received it. Attachments are limited to 5 files, up to 10 MB
each.