# PhoneMail

PhoneMail is an email application that uses phone numbers as email identities.
A user can receive mail at an address such as `9876543210@phonemail.com`, use
the mobile-oriented conversation interface, or use the web client to compose
and manage email.

## Buildathon Summary

PhoneMail was built for the ALPHASTACK 7-Day Buildathon. The implementation
prioritizes the mobile experience and supports phone-based account creation,
web authentication, local PhoneMail delivery, external SMTP delivery, inbox
management, drafts, attachments, group conversations, spam/trash workflows,
multilingual onboarding, and opt-in SMS notifications.

### Technology Stack

- **Frontend:** React 18, TypeScript, Vite, React Router, Tailwind CSS, and
  `lucide-react` icons.
- **Backend:** Node.js 20, TypeScript, Express, Socket.IO, Prisma, and
  Argon2id password hashing.
- **Data:** PostgreSQL 15 for users, mail, drafts, attachments, conversations,
  and mailbox state. Short-lived OTP challenges remain in memory.
- **Integrations:** Twilio Voice/SMS, 2Factor OTP SMS, SMTP via Nodemailer,
  and Mailpit for local inbound-mail testing.
- **Deployment:** Docker Compose with separate API, frontend, PostgreSQL, and
  Mailpit services. Nginx serves the production frontend container.

### Architecture

```text
Browser / mobile web UI
        |
        v
React + Vite frontend :5173  ---- Socket.IO ----+
        |                                        |
        +------------ REST API :3000 ------------+
                         |
              Express routes and services
                 |          |          |
                 v          v          v
             Prisma      Twilio      SMTP/Mailpit
                 |
                 v
             PostgreSQL
```

The frontend owns onboarding, navigation, composition, conversations, profile
settings, and localized UI state. The Express API owns authentication,
authorization, recipient normalization, mail delivery, uploads, notifications,
and Twilio webhooks. Prisma provides the persistence boundary and the API
applies the schema with `prisma db push` before starting in Docker.

### Account Creation Approach

- **Phone call:** Twilio Voice presents an IVR menu. In normal mode, pressing
  `1` starts a voice OTP challenge and the caller enters the code in the first
  call. In Try Out Voice trial mode, where outbound calls are restricted,
  pressing `1` creates the passwordless demo account immediately.
- **Web/mobile UI:** Login and registration screens support phone OTP and a
  password fallback. Login OTP requests are rejected before delivery when the
  number has no account.
- **Account identity:** The normalized phone number becomes the primary
  PhoneMail address and is stored alongside the generated
  `number@phonemail.com` email identity.

## Quick Start

### Prerequisites

- Docker Desktop with Docker Compose
- A modern browser
- Optional provider credentials for real OTP, Voice, SMS, and SMTP delivery

### Run the complete project

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Open:

- **PhoneMail frontend:** http://localhost:5173
- **API:** http://localhost:3000
- **Mailpit inbox:** http://localhost:8025

Check service status with:

```powershell
docker compose ps
docker compose logs -f api
```

Stop the stack with:

```powershell
docker compose down
```

PostgreSQL and Mailpit data are stored in Docker volumes and survive normal
container restarts.

## Configuration

The root `.env` file is ignored by Git. Keep real credentials there and use
`.env.example` as the tracked template. At minimum, set a stable
`AUTH_TOKEN_SECRET` containing at least 32 bytes so sessions survive API
restarts.

### Provider configuration

```env
AUTH_TOKEN_SECRET=replace-with-at-least-32-random-bytes
TWO_FACTOR_API_KEY=your-2factor-api-key
TWO_FACTOR_OTP_TEMPLATE=your-approved-template
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_REGISTRATION_NUMBER=+18005550100
TWILIO_WEBHOOK_BASE_URL=https://your-public-host.example/api/auth
```

For Twilio Try Out Voice testing, use:

```env
TWILIO_TRIAL_MODE=true
TWILIO_TRIAL_WEBHOOK_KEY=private-random-key-at-least-32-bytes
```

The trial flow is intentionally OTP-free because Try Out Voice does not
provide an owned outbound number. It is a demonstration path and should not be
treated as production identity verification. Normal Twilio webhook requests
are signature-validated; unsigned trial requests require the private trial
key.

For external email delivery, configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. For local inbound
mail, Mailpit listens on SMTP port `1025` and its web inbox is on port `8025`.

## Development and Validation

The Docker build is the reproducible development check:

```powershell
docker compose build frontend api
```

The backend test suite can be run in the builder image:

```powershell
docker build --target builder -t phonemail-backend-test .\phone-mail-backend
docker run --rm phonemail-backend-test npm test
```

The frontend production build runs as part of `docker compose build frontend`.

## SMS message notifications

SMS notifications are opt-in and off by default. A signed-in user can enable
them in **Settings → Notifications**; PhoneMail then sends a short alert to the
account's registered phone number when a direct message, group message, or new
inbound email arrives. The SMS does not include the message body. Standard
carrier charges may apply, and users can turn notifications off in the same
setting.

To enable delivery, configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
`TWILIO_PHONE_NUMBER` in the root `.env`. `TWILIO_PHONE_NUMBER` must be a
Twilio-owned, SMS-capable number in E.164 format (for example,
`+14155552671`); it can differ from the toll-free voice number used for
registration. Complete any required Twilio sender verification, A2P/toll-free
registration, billing, and destination-country setup. Trial accounts may only
send to verified recipient numbers. Rebuild the API to apply the settings:

```powershell
docker compose up -d --build api frontend
```

The app applies the Prisma schema at startup, so the new preference is stored
in PostgreSQL and remains off for existing users until they opt in.
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
sent, or discarded, with up to five attachments (10 MB each) preserved when a
draft is saved and reopened. Spam and Trash support moving messages, restoring
them to Inbox, and permanently deleting messages from Trash.
Composing to multiple PhoneMail accounts creates a persistent group chat, while
later messages to an individual account remain in that one-to-one conversation.
External email recipients continue through normal email delivery.
Group members can delete a message from their own view without removing it for
other members.

The web interface supports English, Hindi, Tamil, Telugu, Bengali, and Marathi.
Choose a language at startup or change it later in Settings → Language; the
choice is saved in the browser. User-written messages and profile details are
not automatically translated.

The Terms of Service dialog is available in all six supported languages from
the permissions screen. It is a draft for this prototype: the legal service
operator and postal address could not be verified from public project
information. Verify and add the operator's legal identity and compliant
private grievance contact, and obtain legal review, before public production
use.

The 2Factor integration expects a valid account API key and an approved OTP SMS
template; delivery cannot be tested until those credentials are supplied.
Web registration, including password sign-up, and call-based registration
create accounts only after their configured verification step. Password sign-up
requests the OTP first, then creates the account after the code and password are
submitted. Normal call registration uses Twilio Voice for the call and the
caller enters the voice OTP using the phone keypad. Try Out Voice trial mode
uses the documented immediate-create demo path because trial accounts cannot
place the additional verification call.

## Toll-free phone registration

The IVR (interactive voice response) flow is:

1. A caller dials your Twilio toll-free number and presses **1**.
2. In normal mode, PhoneMail places a verification call and the caller enters
  the six-digit code in the first call. It expires after five minutes and
  allows at most five attempts.
3. In Try Out Voice trial mode, PhoneMail creates the passwordless account
  immediately after the caller presses **1**, because outbound verification
  calls are unavailable on that plan.

For local testing, configure a public HTTPS tunnel such as ngrok to forward to
the API at `http://localhost:3000`. Twilio cannot call a `localhost` webhook
directly. Put the API's public webhook base URL (ending in `/api/auth`) and your
real toll-free number in the ignored root `.env` file:

```env
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_TOLL_FREE_NUMBER=+18005550100
TWILIO_WEBHOOK_BASE_URL=https://your-public-tunnel.example/api/auth
TWO_FACTOR_API_KEY=your-2factor-api-key
TWO_FACTOR_OTP_TEMPLATE=your-approved-otp-template
```

Set the toll-free number's **A call comes in** Voice webhook in Twilio to the
same public base URL followed by `/ivr/incoming`, using `POST`. If a temporary
tunnel URL changes or the tunnel is restarted with a different hostname, update
both this environment variable and the Twilio number's webhook, then restart
the backend. A reserved tunnel domain or deployed HTTPS hostname avoids that
drift. Follow-up IVR steps use the configured base URL and require it to be a
valid HTTPS URL ending in `/api/auth`.

### Try out Voice unsigned-webhook mode

Some Twilio **Try out Voice** custom inbound tests call the configured webhook
without an `X-Twilio-Signature`; normal Twilio number webhooks remain
signature-validated. To test this trial-only path, set `TWILIO_TRIAL_MODE=true`
and generate a private random key locally:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$trialKey = [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
$trialKey
```

Put that value in `.env` as `TWILIO_TRIAL_WEBHOOK_KEY`, and append it to the
Custom inbound webhook URL in the Try out Voice page:

```text
https://your-ngrok-host.ngrok-free.dev/api/auth/ivr/incoming?trialKey=YOUR_RANDOM_KEY
```

Rebuild the API. PhoneMail will include the same key on the keypad callback
URLs; requests without a valid key are rejected. This is a temporary testing
guard, not equivalent to Twilio signatures: keep the URL private and remove the
key/disable trial mode after testing.

In the Twilio Console, set the toll-free number's **A Call Comes In** webhook to
`https://your-public-tunnel.example/api/auth/ivr/incoming` and select **HTTP
POST**. The application validates Twilio's request signature and returns
absolute callback URLs for the keypad steps. Do not disable signature checking
or expose the Twilio Auth Token. Rebuild the API after changing `.env`:

```powershell
docker compose up -d --build api frontend
```

The call-registration number shown on the registration page comes from
`TWILIO_REGISTRATION_NUMBER`. For existing deployments,
`TWILIO_TOLL_FREE_NUMBER` remains a fallback for that setting. A Twilio trial
number can be used for testing calls but is not necessarily toll-free.
Twilio may require toll-free verification or account approval before calls or
messages work; trial-account geographic and recipient restrictions also apply.
Confirm that your toll-free number can receive calls from the countries where
your users are located. OTP delivery remains subject to the 2Factor account,
approved template, and destination-country support. If Twilio reports
**insufficient balance**, this is an account billing restriction, not an `.env`
or webhook setting: add funds or upgrade the Twilio account in the Twilio
Console, then retry. Check **Monitor → Voice → Call Logs** for the failed call
and its error code. This app's IVR receives calls; it does not place outbound
voice calls.
Twilio trial accounts may restrict which numbers they can call or receive calls
from; confirm the Twilio number is voice-enabled and check call logs if the
webhook is not reached. A toll-free number is required for the verified call
registration flow documented above.

### Simulate the IVR locally without a phone number

For a no-cost local demo while waiting for a voice provider, set
`IVR_DEMO_MODE=true` in the ignored root `.env` file and run:

```powershell
docker compose up -d --force-recreate api
```

On the registration page, choose **Simulate call and press 1**. The simulated
call displays a demo code; enter it to create a passwordless account. This
does not place a real call or send an SMS, and the code is deliberately shown
in the UI only for demonstrating the flow. Turn `IVR_DEMO_MODE` off before
exposing the API to the internet; the demo endpoint is not a real identity
verification method.

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
provider. Attachments up to 10 MB each (5 files per message) are stored with
local PhoneMail-to-PhoneMail messages and delivered with external email.

## Twilio trial SMS notifications

Twilio trial accounts reject custom SMS bodies. For testing, set
`TWILIO_TRIAL_MODE=true` in the root `.env` and set
`TWILIO_TRIAL_PHONE_NUMBER` to the trial sender shown by Twilio's successful
sample request. PhoneMail submits the same `From` and `To` shape and the
`sms_account_alerts` template. Twilio sends its generic account-alert text
rather than a PhoneMail-specific notification. Rebuild the API:

```powershell
docker compose -p phonemail-local up -d --build api
```

Set `TWILIO_TRIAL_MODE=false` after upgrading to restore the normal custom SMS.
See [Twilio trial SMS limitations](https://www.twilio.com/docs/usage/trials/try-out-sms).