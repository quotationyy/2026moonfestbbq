# 中秋卡肉趴 — attendance confirmation

One static page that asks guests whether they are still coming, and
records the answer straight into a Google Sheet. No server, no database,
no monthly cost.

```
visitor's browser  ──POST JSON──▶  Apps Script Web App  ──appends row──▶  Google Sheet
   (GitHub Pages)                    (script.google.com)                    (RSVP)
```

| Piece | What it does | Cost |
|---|---|---|
| `index.html` | The whole page. Static file — host anywhere. | free |
| `Code.gs` | The API endpoint. Runs inside Google. | free |
| Google Sheet | The database, plus charts and CSV export for free. | free |

Signups themselves never went through this repo — they were taken on a
separate Google Form, and that form's responses are the real guest list.
This page only asks the follow-up question.

It has been through five visual directions. The one here is a
letterpress flyer in cream, navy and red; the other four are on the
`five-styles` tag and any of them comes back with a single checkout:

```bash
git checkout five-styles -- c.html
```

Why Apps Script rather than a Sheets API key: an API key in a public HTML
file is readable by anyone, and would let strangers write to the Sheet.
The Web App runs *as the owner* on Google's side, so nothing secret ever
ships to the browser.

---

## The page

`index.html` asks one question — are you coming? — and records the answer
in a sheet named **`RSVP`**, created on first use.

The flow is two taps and a name: press **我會出席** or **無法出席**, type
the name used at signup, press the confirm button, done.

| Column | Holds |
|---|---|
| `timestamp` | when the server recorded it |
| `name` | as typed |
| `status` | `attending` or `refund` — the stable key to sort and count on |
| `status_text` | what the page displayed for that choice, for reading at a glance |
| `submitted_at` | the browser's clock, ISO 8601 |
| `source_page` | which URL it came from |

**Answers are append-only.** Someone who changes their mind adds a row
rather than overwriting one, so the sheet keeps the whole history and
*the last row for a name is the answer that counts*. The confirmation
screen offers a way back to the choices. To read the current standing,
sort by `timestamp` and take the last row per name.

Content — the lede, the two button labels, the confirmation wording — is
in the `EVENT`, `CHOICES` and `MSG` objects at the top of the script
block. The event's name, date and time are in the poster's markup in
`<header>`. Nothing under the "以下不需要修改" comment needs editing to
change what the page says.

**Size anything you put in the poster from the phone, not the desktop.**
Every length in there is `cqw` — a share of the artboard's own width —
so it all shrinks together. At 393px wide 1cqw is 3.9px, which puts
body-text legibility at about 3.4cqw; the date and time are 4.4 and 6.
The date was 13px before it was moved up here, which is what the last
round of changes was about.

The artboard was a fixed 1080px canvas scaled with `zoom` for most of
its life. That came out because a frame carrying an `aspect-ratio`
inside a flex container is sized differently by WebKit and Chromium: on
an iPhone the artwork scaled to 736px inside a 393px window and the
title ran off the screen, while every measurement taken in Chromium
said it was fine. Nothing here measures anything any more, and that is
deliberate.

---

## Setup — about 10 minutes, once

### 1. Create the Sheet and paste the backend

1. Make a new spreadsheet at [sheets.new](https://sheets.new). Name it anything.
2. **Extensions ▸ Apps Script.** A code editor opens in a new tab.
3. Delete the sample `myFunction` code, paste in all of **`Code.gs`**, and save (⌘S).
4. Put that spreadsheet's id into `RSVP_SPREADSHEET_ID` at the top of
   `Code.gs`. It is the long string in the sheet's URL between `/d/` and
   `/edit`. The RSVP rows go there by id rather than through
   `getActiveSpreadsheet()`, so the destination is readable in the source
   instead of being an invisible property of whichever document the
   project is bound to.

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

```json
{"ok":true,"service":"survey","sheet":"Responses","actions":["submit","rsvp","read","delete"]}
```

That `actions` list is how you tell a current deployment from a stale one
without writing anything: if `rsvp` is missing, the live endpoint predates
this page and will refuse its requests — and say so on the page rather
than failing silently.

### 3. Point the page at it

Replace the placeholder near the top of the script block in `index.html`:

```js
const SCRIPT_URL = "https://script.google.com/macros/s/AKfy…/exec";
```

Open `index.html` locally (double-click it) and send a test answer — the
row should appear in your Sheet within a second. This works from a local
file too, so you can finish testing before you publish anything.

### 4. Publish on GitHub Pages

This repo pushes to the **`quotationyy`** GitHub account, which is not the
default SSH identity on the author's machine. `~/.ssh/config` has a
`github-alt` host alias pointing at `~/.ssh/id_ed25519_github_alt`, so the
remote is:

```
git@github-alt:quotationyy/2026moonfestbbq.git
```

Check you are pushing as the right account — this must print `Hi quotationyy!`:

```bash
ssh -T git@github-alt
```

Then:

```bash
git push -u origin main
```

In the repo: **Settings ▸ Pages ▸ Source: Deploy from a branch**, branch
`main`, folder `/ (root)`, Save. The page goes live at
<https://quotationyy.github.io/2026moonfestbbq/> a minute or two later.

> The repo must be **public** for Pages on a free account. The page holds
> no secret — the `/exec` URL only accepts appends — so that's fine.

**After editing `Code.gs`** you must **Deploy ▸ Manage deployments ▸ ✏️ ▸
Version: New version ▸ Deploy**, or the live endpoint keeps running the
old code. Editing `index.html` just needs a `git push`.

---

## Good to know

- **`Code.gs` must stay pure ASCII.** It is pasted through a browser into
  the Apps Script editor, and Chinese strings have been mangled to
  mojibake on that path before — the deployed server really did return
  garbage. Anything a reader sees in Chinese is sent up by the page and
  written through; the backend only speaks English plus a stable `code`
  field.
- **Three actions in `Code.gs` have no caller any more.** `submit`, `read`
  and `delete` served a signup form and an admin dashboard that were
  removed once signups moved to a Google Form. They are harmless — `read`
  and `delete` need a password, `submit` only appends to the unused
  `Responses` sheet — but they can be deleted whenever it is worth one
  more redeploy.
- **Spam:** there's a hidden honeypot field that silently drops bots.
  Enough for a low-traffic page.
- **Quotas:** Apps Script allows ~20,000 executions/day on a free account.
  A party will not come close.
- **`Couldn't send: Failed to fetch`** almost always means the
  deployment's access is not set to *Anyone*, or a redeploy is needed
  after editing `Code.gs`.
