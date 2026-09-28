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

Accounts, locally delivered PhoneMail mail, imported inbound mail, drafts, and
mailbox/read/star state are stored in PostgreSQL and persist when the API
restarts. OTP challenges and external-only mail history are still held in
memory. Docker Compose waits for PostgreSQL to become healthy, then the API
synchronizes the Prisma schema before starting.

The web client presents Inbox and Sent together as conversations. Opening a
conversation marks its incoming messages as read. Drafts can be saved, reopened,
sent, or discarded; Spam and Trash support moving messages, restoring them to
Inbox, and permanently deleting messages from Trash.

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

Keep real credentials only in the ignored `.env` file or a secrets manager; the
tracked `.env.example` must contain placeholders only. If an SMTP password has
been committed or shared, revoke it with the provider and create a replacement.
Removing a credential from the current file does not remove it from Git history.

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

## Testing inbound mail locally

The Compose stack includes Mailpit, a local-only mail catcher. It does not send
test messages to the public internet. Open its inbox at
http://localhost:8025, then send a message to a registered PhoneMail address
using Mailpit's SMTP listener at `localhost:1025`. The API imports messages for
registered recipients into their conversations every few seconds.

In PowerShell, replace the recipient below with the phone number you registered
(10 digits, without a country code):

```powershell
$message = New-Object System.Net.Mail.MailMessage(
  "sender@example.com",
  "9876543210@phonemail.com",
  "Local PhoneMail test",
  "This message stays on your computer."
)
$smtp = New-Object System.Net.Mail.SmtpClient("localhost", 1025)
$smtp.Send($message)
$message.Dispose()
$smtp.Dispose()
```

Sign in to PhoneMail and open the conversation from `sender@example.com`. The
same message is visible in Mailpit at http://localhost:8025. Local messages and
the Mailpit inbox persist in Docker volumes. Public delivery to
`@phonemail.com` still requires control of that domain and an inbound email
provider.

## Sending PhoneMail-to-PhoneMail locally

When you compose an email to another registered `@phonemail.com` account,
PhoneMail delivers it directly inside the app and saves sent and received copies
in PostgreSQL. This works locally without Gmail SMTP or public DNS. If an
`@phonemail.com` recipient is not registered, sending is rejected with a clear
message. Ordinary external email addresses continue to use the configured SMTP
provider. Local PhoneMail-to-PhoneMail messages do not support attachments yet.