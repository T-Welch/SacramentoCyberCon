# Sacramento Cyber Con — website (proof of concept)

A static site for GitHub Pages with a sign-up form that writes to a Google Sheet via Google Apps Script. Styling matches [dc916.com](https://dc916.com).

```
index.html              the whole site (hero, about, get involved, sponsors, sign-up, FAQ)
config.js               ← paste your Apps Script URL + event date here
assets/css/style.css
assets/js/main.js       form logic, countdown, typing effect
assets/images/          DC916 logo art
apps-script/Code.gs     ← paste into the Google Sheet's Apps Script editor
.nojekyll               tells GitHub Pages to serve files as-is
```

## Run locally

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

With `SHEET_ENDPOINT` empty, the form runs in **demo mode** and logs submissions to the browser console.

## Connect the Google Sheet

1. Create a new Google Sheet (e.g. "SacCyberCon Sign-ups") in the organizers' shared Google account.
2. **Extensions → Apps Script**. Delete the starter code and paste in the contents of `apps-script/Code.gs`. Then go to **Project Settings (⚙) → check "Show appsscript.json manifest file in editor"**, open `appsscript.json` in the editor, and replace its contents with `apps-script/appsscript.json`. This limits the script to the one permission it needs. Save.
3. In the function dropdown pick **`setup`** and click **Run**. Authorize when prompted. This creates the tabs `All`, `Attend`, `Sponsor`, `Speak`, `Workshop-Village` with header rows.
4. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the **Web app URL** (ends in `/exec`) into `SHEET_ENDPOINT` in `config.js`.
6. Submit a test entry on the site and check the Sheet.

> **Updating the script later:** after editing `Code.gs`, use **Deploy → Manage deployments → ✏️ Edit → Version: New version**. This keeps the same URL. Creating a *new deployment* gives you a new URL, and you'd have to update `config.js`.

Optional: set `NOTIFY_EMAIL` at the top of `Code.gs` to get an email on every submission. The first time you do this, run `setup` again to grant mail permission.

### How submissions land in the Sheet

- Every submission gets a row in **All** (contact info, roles, comments).
- It also gets a row in each selected role's tab, with that role's fields. The **Submission ID** column links rows across tabs.

### Built-in protections

- Honeypot field and a minimum fill time (3s) silently drop bot submissions.
- Per-email rate limit (5 per 10 min).
- Server-side validation of required fields.
- Values starting with `= + - @` are escaped so they can't run as spreadsheet formulas.
- A script lock prevents simultaneous submissions from clobbering each other.

The web app URL is public by design (anyone can POST to it), but it can only *append* rows. It cannot read the Sheet.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (e.g. under the `CyberSecSacramento` org).
2. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. In the same Pages settings, make sure **Enforce HTTPS** is checked.
4. The site will be at `https://<org>.github.io/<repo>/`.
5. Custom domain (optional): add a `CNAME` file containing the domain, and point DNS at GitHub Pages.

## Placeholders to replace

- Event date: `EVENT_DATE` in `config.js` (e.g. `"2027-04-17T09:00:00-07:00"`) turns on the countdown.
- Venue: "venue TBA" in the hero of `index.html`.
- About / programming list, sponsor tiers, FAQ answers: all in `index.html`.
- Sponsor logos: replace the `.sponsor-slot` placeholders.
