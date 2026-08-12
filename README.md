# Survey form — GitHub Pages + Google Sheets

A single-page survey form that posts answers straight into a Google Sheet.
No server, no database, no monthly cost.

```
visitor's browser  ──POST JSON──▶  Apps Script Web App  ──appends row──▶  Google Sheet
   (GitHub Pages)                    (script.google.com)
```

| Piece | What it does | Cost |
|---|---|---|
| `index.html` | The form. Static file — host anywhere. | free |
| `Code.gs` | Your API endpoint. Runs inside Google. | free |
| Google Sheet | The database, plus charts and CSV export for free. | free |

Why Apps Script rather than a Sheets API key: an API key in a public HTML file
is readable by anyone, and would let strangers write to your Sheet. The Web App
runs *as you* on Google's side, so nothing secret ever ships to the browser.

---

## Setup — about 10 minutes, once

### 1. Create the Sheet and paste the backend

1. Make a new spreadsheet at [sheets.new](https://sheets.new). Name it anything.
2. **Extensions ▸ Apps Script.** A code editor opens in a new tab.
3. Delete the sample `myFunction` code, paste in all of **`Code.gs`**, and save (⌘S).

### 2. Deploy it as a Web App

1. **Deploy ▸ New deployment.**
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`  ← must be *Anyone*, not "Anyone with a Google account"
4. **Deploy.** Approve the permission prompt (it warns the script is unverified —
   that's normal for your own script; choose *Advanced ▸ Go to …*).
5. Copy the **Web app URL**. It ends in `/exec`.

Verify it: paste that URL into a browser tab. You should see
`{"ok":true,"service":"survey","sheet":"Responses"}`.

### 3. Point the form at it

In `index.html`, replace the placeholder on line 1 of the script block:

```js
const SCRIPT_URL = "https://script.google.com/macros/s/AKfy…/exec";
```

Open `index.html` locally (double-click it) and submit a test response — the row
should appear in your Sheet within a second. This works from a local file too, so
you can finish testing before you publish anything.

### 4. Publish on GitHub Pages

This repo pushes to the **`quotationyy`** GitHub account, which is not the default
SSH identity on this machine. `~/.ssh/config` has a `github-alt` host alias
pointing at `~/.ssh/id_ed25519_github_alt`, so the remote is:

```
git@github-alt:quotationyy/2026moonfestbbq.git
```

Check you are pushing as the right account — this must print `Hi quotationyy!`,
**not** `Hi wenninghsu!` (the old key stays configured as a fallback, so a missing
key shows up as the wrong name rather than an outright error):

```bash
ssh -T git@github-alt
```

Then:

```bash
git push -u origin main
```

In the repo: **Settings ▸ Pages ▸ Source: Deploy from a branch**, branch `main`,
folder `/ (root)`, Save. The form goes live at
<https://quotationyy.github.io/2026moonfestbbq/> a minute or two later.

> The repo must be **public** for Pages on a free account. `index.html` contains
> no secrets — the `/exec` URL only accepts appends — so that's fine. Don't commit
> anything else into this repo.

---

## Editing the survey

Everything you change lives in the `SURVEY` object in `index.html`. Nothing else
needs touching, and the Sheet picks up new columns by itself.

```js
{
  id: "delivery_date",          // becomes the Sheet column header — keep it unique
  type: "text",
  label: "When do you need this by?",
  help: "Approximate is fine.", // optional
  required: true                // optional
}
```

| `type` | Renders as | Extra keys |
|---|---|---|
| `text` | one-line input | |
| `textarea` | multi-line box | |
| `email` | one line, format-checked | |
| `number` | numeric input | `min`, `max` |
| `radio` | pick exactly one | `options: [...]` |
| `checkbox` | pick any number (saved comma-separated) | `options: [...]` |
| `select` | dropdown | `options: [...]` |
| `scale` | 1–N rating buttons | `max`, `minLabel`, `maxLabel` |

Labels, options and answers are all UTF-8, so Chinese text works as-is.

Option lists longer than 6 items automatically flow into responsive columns
rather than one tall stack, so a 19-item question stays scrollable on a phone.

All interface text (button label, error messages, "please choose") lives in the
`MSG` object just below `SURVEY` — change the language there in one place.

**After editing `Code.gs`** you must **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version:
New version ▸ Deploy**, or the live endpoint keeps running the old code. Editing
`index.html` just needs a `git push`.

---

## The admin page

`admin.html` shows every response — headcount, parking counts, dietary notes, a
full table, CSV export, and per-row delete. It is served from the same public
GitHub Pages site, so it is built on one rule: **the page holds no secret and
no data.**

A password typed into it is POSTed to Apps Script, which compares it against a
Script Property and only then returns rows. Reading `admin.html`'s source, or
skipping it and calling `/exec` directly, gets an attacker nothing without the
password. Never move the password into this repo — the repo is public.

### Setting the password

In the Apps Script editor: **⚙️ Project Settings ▸ Script Properties ▸ Add
script property**

| Property | Value |
|---|---|
| `ADMIN_PASSWORD` | your password |

Then **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy**.
Changing a Script Property alone needs no redeploy; changing `Code.gs` does.

### What protects it, and what does not

| | |
|---|---|
| ✅ | Password never reaches the browser — it is only ever sent *to* the server |
| ✅ | Wrong guesses cost 1.5s each; 8 failures lock reads for 15 minutes |
| ✅ | Comparison is constant-time, so timing leaks nothing |
| ✅ | HTTPS everywhere; `noindex` keeps the page out of search results |
| ⚠️ | One shared password — it cannot be revoked for one person only |
| ⚠️ | The lockout is global, so someone could deliberately lock admins out for 15 minutes |
| ⚠️ | Anyone holding the password sees every response, including phone numbers |

### Deleting a response

Delete moves the row to a **`Deleted`** sheet (created on first use, with a
`deleted_at` column) and only then removes it from `Responses`. Nothing is
permanently destroyed, so a misclick is recoverable — copy the row back.

Row numbers shift the moment anything is deleted, so the dashboard sends the
name and timestamp it believes are on that row and the server refuses the
delete if they do not match. Two admins working from stale tabs therefore
cannot delete each other's records by accident.

For per-person access that you can revoke individually, share the Google Sheet
with each admin's Google account instead (**Share** in the spreadsheet). That
uses real Google authentication and needs no password at all — the admin page is
for a nicer read-only summary, not stronger security.

## Good to know

- **Reordering or renaming a question `id`** starts a new column; old responses
  stay under the old header. Rename in the Sheet too if you want them merged.
- **Spam:** there's a hidden honeypot field that silently drops bots. Enough for a
  low-traffic form. If you get flooded, the cheap fix is turning "Who has access"
  back to *Anyone with a Google account*, which forces a sign-in.
- **Quotas:** Apps Script allows ~20,000 URL-fetch-free executions/day on a free
  account. A survey will not come close.
- **Email on each response:** add this inside `doPost`, just before the final
  `return json_({ ok: true, ... })`:
  ```js
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
                    'New survey response', JSON.stringify(answers, null, 2));
  ```
- **`Couldn't send: Failed to fetch`** almost always means the deployment's access
  is not set to *Anyone*, or a redeploy is needed after editing `Code.gs`.

## Other free hosts

GitHub Pages is the right default here, but any of these work identically —
`index.html` is just a static file:

- **Cloudflare Pages** — faster globally, allows private repos, custom domain free.
- **Netlify** — drag-and-drop the folder, no git needed. Has its own form handling
  (100 submissions/month free) if you'd rather skip Apps Script entirely.
- **Vercel** — fine, but aimed at apps; overkill for one HTML file.

And the honest alternative: if you don't need custom styling or your own domain,
**Google Forms** does all of this with zero code. Build this instead when you want
control over the look, want it embedded in your own site, or need logic Forms can't
express.
