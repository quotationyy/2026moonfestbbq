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
| `photos/index.html` | The photo wall: guests upload, everyone sees. | free |
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

## The photo wall

`photos/index.html`, live at
<https://quotationyy.github.io/2026moonfestbbq/photos/>. Guests pick
photos, the page uploads them, and every photo shows in a grid five
across, newest first. Tapping one opens it full size.

The photos are stored **in this repository**, under `photos/img/` (full
size) and `photos/thumb/` (what the grid loads), and GitHub Pages serves
them like any other file on the site.

```
guest's browser ──POST photo──▶ Apps Script ──commit via GitHub API──▶ this repo
       ▲                         (holds the token)                        │
       └──────────── lists photos/img, loads the files ◀──────────────────┘
```

A static page cannot write to GitHub by itself: that takes a token, and
a token in a public HTML file is a token anyone can use to rewrite the
repo. So the page posts to the same Apps Script that takes RSVPs, using
its `photo` action. The token sits in that project's Script Properties,
and the script makes the commit. Reading needs no token, because the
repository is public.

The photo code is part of `Code.gs` rather than a second `.gs` file in
the project. Every `.gs` file in one Apps Script project shares a single
global scope, so a second file with its own `doGet`/`doPost` would
collide with the first, and only one of them would run.

What happens to a photo on the way up:

- **The page shrinks it first.** A phone photo is 3–8 MB; the page
  re-encodes it as a JPEG of at most 2048px on the long edge (around
  0.5 MB) plus a thumbnail of about 50 KB. Re-encoding also strips EXIF,
  so **the GPS position in the photo never reaches the repo**.
- **The server names it**, `20261002-213015-482-a1b2.jpg`: Taipei time
  plus a random tail. The name is the sort order. Nothing the browser
  sends ends up in a path.
- **Each photo is two commits**, full size and then thumbnail, authored
  by the account that owns the token.

A photo appears on the uploader's screen at once, from the copy made in
the browser. For everyone else, a new photo is in the list as soon as
it is committed. The page loads it from `raw.githubusercontent.com`
until the Pages rebuild catches up, about a minute later.

Layout knobs are at the top of the script block: `NEWEST_FIRST` (set it
to `false` to list oldest first) and `SIZE`. The wording is in `PAGE`
and `MSG`.

**Anyone with the link can upload.** The script only accepts JPEGs and
caps their size, but there is no login. To take a photo down, delete
it from both `photos/img/` and `photos/thumb/` in the GitHub web UI. It
stays in git history; purging it from history means rewriting the
history and force-pushing.

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
{"ok":true,"service":"survey","sheet":"Responses","actions":["submit","rsvp","photo","read","delete"],"photoReady":true}
```

That `actions` list is how you tell a current deployment from a stale one
without writing anything: if `rsvp` or `photo` is missing, the live
endpoint predates that page and will refuse its requests — and say so on
the page rather than failing silently. `photoReady` is `false` until the
GitHub token from step 5 is in place.

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

### 5. Let the script commit photos

The photo wall needs a GitHub token that can write to this one
repository, and nothing else.

1. Signed in to GitHub as **`quotationyy`**: **Settings ▸ Developer
   settings ▸ Personal access tokens ▸ Fine-grained tokens ▸ Generate
   new token.**
   - **Resource owner:** `quotationyy`
   - **Expiration:** long enough to outlast the uploads. A month is plenty
     for one party.
   - **Repository access:** *Only select repositories* ▸ `2026moonfestbbq`
   - **Permissions ▸ Repository permissions ▸ Contents:** *Read and write*
     (Metadata: read-only is added automatically)
2. Copy the token. GitHub shows it once.
3. In the Apps Script editor: **Project Settings** (the gear) **▸ Script
   Properties ▸ Add script property**, name `GITHUB_TOKEN`, value the
   token. Save.
4. Redeploy as a **new version** (see above). This first deploy after the
   photo code went in asks for one more permission, *Connect to an
   external service*, because the script now calls GitHub. Allow it.

Check the `/exec` URL again: `photoReady` should now be `true`.

When the token expires, uploads fail with a message asking guests to get
in touch, and nothing is written. Generate a new token and replace the
property value. No redeploy is needed for that, since the script reads
the property on every request.

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
  A party will not come close. GitHub is the tighter limit for photos:
  it allows about 500 writes an hour, and each photo takes two, so
  about 250 photos an hour. Past that, uploads retry and then ask the
  guest to try again later. Reading the photo list without a token is
  limited to 60 requests an hour per network, which is why the page
  does not poll.
- **Pull before you push.** Every uploaded photo is a commit on `main`,
  so once guests start uploading, a local checkout falls behind. Run
  `git pull --rebase` before any `git push`, or the push is rejected.
- **Size:** at about 0.55 MB a photo, a thousand photos is about half a
  gigabyte. That is within GitHub's soft limits for a repo (1 GB) and
  a Pages site (1 GB).
- **`Couldn't send: Failed to fetch`** almost always means the
  deployment's access is not set to *Anyone*, or a redeploy is needed
  after editing `Code.gs`.
