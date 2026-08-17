# MILAN — Email Deliverability & Security (Inbox, not Spam)

This is the **one-time DNS setup** that makes MILAN's mail land in the **inbox**
and makes it **impossible for anyone to spoof `@milanlife.in`**. The app code is
already hardened (failover between providers, retries, timeouts, one-click
unsubscribe, security alerts). The last mile is DNS — and only the domain owner
can do it. Do this once and email problems effectively disappear.

> Sender: **support@milanlife.in** · DNS host: **GoDaddy** · Provider: **Resend**

---

## The 3 records that decide inbox vs spam

| Record | What it proves | Without it |
|--------|----------------|-----------|
| **SPF**   | This server is *allowed* to send for milanlife.in | Spam / rejected |
| **DKIM**  | The mail wasn't tampered with (cryptographic signature) | Spam |
| **DMARC** | What to do if SPF/DKIM fail + sends you reports | Spoofable domain |

You need **all three**. Gmail & Yahoo (since Feb 2024) *require* them for reliable delivery.

---

## Step 1 — Verify your domain in Resend (gets you SPF + DKIM)

1. Log in to **[resend.com](https://resend.com)** → **Domains** → **Add Domain** → `milanlife.in`.
2. Resend shows you a set of DNS records — typically:
   - A **TXT** record for SPF (e.g. `v=spf1 include:_spf.resend.com ~all`)
   - **3 CNAME** records for DKIM (e.g. `resend._domainkey…`)
   - Optionally a **MX**/return-path record for bounce handling.
3. Copy each **exactly** as shown. Do not modify them.

## Step 2 — Add the records in GoDaddy

1. GoDaddy → **My Products** → `milanlife.in` → **DNS** → **Manage Zones**.
2. For each record Resend gave you: **Add** → pick the **Type** (TXT/CNAME) →
   paste **Name/Host** and **Value** → Save.
   - GoDaddy note: if the host is `resend._domainkey.milanlife.in`, enter only
     `resend._domainkey` in the **Name** field (GoDaddy appends the domain).
   - For the root SPF TXT, the **Name** is `@`.
3. Back in Resend, click **Verify**. DNS can take 5–60 min (sometimes a few hours).
   Green ticks = done.

> ⚠️ If you already have an SPF TXT record (e.g. for Gmail/Google Workspace),
> do **not** add a second one. Merge them into a single record, e.g.
> `v=spf1 include:_spf.google.com include:_spf.resend.com ~all`.

## Step 3 — Add DMARC (anti-spoofing + reports)

Add **one** TXT record in GoDaddy:

- **Type:** TXT
- **Name:** `_dmarc`
- **Value (start safe, in monitor mode):**
  ```
  v=DMARC1; p=none; rua=mailto:support@milanlife.in; fo=1; adkim=s; aspf=s
  ```

Leave it at `p=none` for ~1–2 weeks and watch the reports. Once SPF+DKIM pass
consistently, tighten to **quarantine**, then **reject** for full anti-spoofing:

```
v=DMARC1; p=quarantine; rua=mailto:support@milanlife.in; adkim=s; aspf=s
```
…then later `p=reject`.

---

## Step 4 — Confirm the environment (on the VM)

`backend/.env` should have (never commit this file):

```
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=MILAN <support@milanlife.in>
MAIL_FROM_ADDRESS=support@milanlife.in
MAIL_REPLY_TO=support@milanlife.in
PUBLIC_BASE_URL=https://milanlife.in

# Reliability / behaviour (optional — sensible defaults built in)
MAIL_TIMEOUT_MS=12000
MAIL_LOGIN_ALERTS=true                    # master switch for sign-in emails
MAIL_LOGIN_ALERTS_NEW_DEVICE_ONLY=true    # only email on a NEW device (recommended)

# Optional backup provider — if set, mail fails over to it automatically
# SENDGRID_API_KEY=SG.xxxxx
```

Restart after any change: `pm2 restart milan --update-env`.

**Tip — add a backup provider.** Set `SENDGRID_API_KEY` too. The app tries
Resend first and automatically fails over to SendGrid if Resend has an outage,
so a single provider going down never stops your mail.

---

## Step 5 — Test it end-to-end

1. **Admin panel** → `/admin-users` isn't for mail; use the admin mail test:
   `POST /api/admin/mail/test` with `{ "to": "you@gmail.com" }` and your admin token.
   (Or register a fresh test account and watch for the welcome email.)
2. Send a test to **[mail-tester.com](https://www.mail-tester.com)** — paste the
   address it gives you as the recipient. Aim for **9–10 / 10**. It shows exactly
   what (if anything) is still missing.
3. In Gmail, open the received mail → **Show original** → confirm
   **SPF: PASS**, **DKIM: PASS**, **DMARC: PASS**.

---

## What the app already does for you (no action needed)

- **Failover + retries + timeouts** — Resend → SendGrid → SMTP, 2 retries each,
  12s cap per attempt. A provider blip self-heals.
- **All mail from `support@milanlife.in`** with a proper `Reply-To`.
- **One-click unsubscribe** (`List-Unsubscribe` + RFC 8058 POST) on non-critical
  mail — a Gmail/Yahoo requirement. Security mail always sends.
- **Smart sign-in alerts** — only on a **new device**, so users aren't spammed
  (repeat alerts → spam complaints → worse delivery for everyone).
- **Security notifications** — password change/reset, 2FA on/off.
- **Plain-text + HTML** multipart on every message (spam filters expect both).
- **Mail audit log** — last 40 sends visible via `GET /api/admin/mail/status`.

---

## Quick troubleshooting

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| Mail in **spam** | SPF/DKIM/DMARC missing or not verified | Finish Steps 1–3; check mail-tester |
| **Nothing arrives** | No provider key, or key invalid | Check `RESEND_API_KEY`; `pm2 logs milan` |
| “**via resend (attempt 2)**” in logs | A transient blip auto-recovered | Nothing — this is the retry working |
| Users complain of **too many** sign-in emails | new-device-only disabled | Set `MAIL_LOGIN_ALERTS_NEW_DEVICE_ONLY=true` |
| Domain **not verifying** in Resend | DNS not propagated / typo | Wait; re-check host names in GoDaddy |

Once Steps 1–3 are green, the email chapter is genuinely closed. 💜
