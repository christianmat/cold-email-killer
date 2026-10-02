# Cold Email Killer

Moves cold sales emails out of your Gmail inbox into a **Cold Email** label, automatically, every 10 minutes. It never deletes anything.

- **Runs in your own Google account** (Google Apps Script). Free, and it keeps running when your computer is off.
- **No Google Cloud project, no OAuth setup, no tokens.** You click "Allow" once.
- **Private:** no server in the middle. Your mail only goes to the AI provider *you* pick, using *your* key. With "rules only" it goes nowhere.
- **Careful by default:** labels-only dry run for the first 24 h. Never touches people you've emailed, threads you've replied to, your coworkers, or anyone on your allowlist.
- **Learns:** drag an email out of Cold Email and that sender is never flagged again.

What it catches: sales pitches, fake "just bumping this" follow-ups, recruiter/staffing pitches, dev/SEO/lead-gen agencies, guest-post and backlink spam.

## Install (≈3 minutes)

1. **Copy the script.** Open the [template project](TEMPLATE_LINK), click **Overview (ⓘ)** in the left sidebar, then **Make a copy** (the copy icon, top right).
2. **Deploy it.** In your copy, click **Deploy → New deployment → ⚙ → Web app** → **Deploy**. Click **Authorize access** and pick your Gmail account.
   - Google will say *"Google hasn't verified this app"*. That's expected: it's your own private copy. Click **Advanced → Go to Cold Email Killer (unsafe)** → **Allow**.
3. **Open the web app URL** it gives you (bookmark it), pick an AI provider, paste a key, then hit **Save & turn on**. Optionally click **Clean up last 14 days**.

> **"Sorry, unable to open the file at this time"?** You're signed into several Google accounts and the browser picked the wrong one. Open the web app URL in an incognito window signed into only the account that owns the script.

Done. Check the **Cold Email** label in Gmail tomorrow. Once dry run ends, matches get archived there.

### Which AI?

| Provider | Get a key | Notes |
|---|---|---|
| None (rules only) | – | Catches mail sent by sales tools (Apollo, Outreach, Salesloft, Lemlist, Instantly, Smartlead…) and obvious templates. Zero data leaves Google. |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Easiest key to get. ⚠️ On the **free tier Google may use inputs to improve its models**. Enable billing to opt out (still pennies). |
| Anthropic Claude | [platform.claude.com](https://platform.claude.com/settings/keys) | Default `claude-opus-5-5`. Put `claude-haiku-4-5` in Model to save money. |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Default `gpt-5-mini`. |

The AI only sees emails the rules couldn't decide, minus the hard-keep cases above: sender, subject, and the first 2,000 characters of the body. There's a daily cap (default 200 calls).

**Model names change.** If a default stops working, type a current model name in the **Model** field.

### Strictness

- **Conservative (default):** moves only at ≥ 90 % confidence
- **Balanced:** ≥ 75 %
- **Aggressive:** ≥ 60 %

### Fallback install (if "Make a copy" doesn't show up)

1. Go to [script.google.com](https://script.google.com) → **New project**, name it "Cold Email Killer".
2. Replace `Code.gs` with the contents of [`dist/Code.js`](dist/Code.js) from the latest release.
3. **+ → HTML**, name it `Settings`, and paste [`dist/Settings.html`](dist/Settings.html).
4. **Project Settings → Show "appsscript.json"**, then paste [`dist/appsscript.json`](dist/appsscript.json).
5. Continue from step 2 above.

## How it decides

```
new inbox thread
  │
  ├─ hard keep? ── sent by you / you replied / you've emailed them before / same company domain /
  │                allowlisted / calendar invite / newsletter / automated → leave alone
  │
  ├─ rules score ≥ 0.95? (sales-tool fingerprints in headers & links + template phrases) → Cold Email
  │
  ├─ AI configured & under daily cap? → AI verdict {cold, confidence, category, reason}
  │                                      (rules-only mode uses the rule score instead)
  │
  └─ cold && confidence ≥ threshold → add "Cold Email" label + archive (label only in dry run)
```

- Errors (bad key, rate limits, timeouts) never move mail. The email is retried on the next run.
- Every decision and its reason shows up on the settings page.

## Uninstall

Settings page → **Pause**. Or, in the Apps Script editor: **Triggers (⏰)** → delete the `run` trigger. Your **Cold Email** label and its emails stay where they are.

## Develop

```bash
npm install
npm test            # unit tests (rules, providers, pipeline with a fake Gmail)
npm run eval        # score fixtures with rules only
PROVIDER=anthropic API_KEY=sk-ant-... npm run eval   # …or with a real model
npm run build       # → dist/Code.js, dist/Settings.html, dist/appsscript.json

# push to your own Apps Script project
npx clasp login
cp .clasp.json.example .clasp.json   # set scriptId
npm run push
```

Layout:
- `src/core/`: pure logic (rules, sequencer fingerprints, pipeline, storage). No Google APIs, fully unit-tested.
- `src/providers/`: Gemini / Claude / OpenAI request builders and parsers.
- `src/gas/main.ts`: Gmail, Properties and Trigger adapters, plus the functions Apps Script calls.
- `src/ui/Settings.html`: the settings page.
- `fixtures/emails.ts`: labeled sample emails used by tests and eval. PRs that add tricky examples are very welcome.

Adding a sales tool fingerprint: add its sending/tracking domains to `src/core/fingerprints.ts`.

## License

MIT
