# Cold Email Killer

**Give cold emails the cold shoulder.**

Auto-archives cold sales emails out of your Gmail inbox into a **Cold Email** label.

- Runs free inside **your own Google account** on Google Apps Script, every 10 minutes, even when your computer is off.
- No server, no sign-up, no third-party service. The only outside call is to the AI provider you pick, with your own key.
- Never touches people you've emailed, threads you've replied to, your coworkers, newsletters, or calendar invites.
- Wrong call? Move the email back to your inbox and that sender is never flagged again.

## Setup (5 min)

**Option A: let your AI agent do it.** Clone this repo and tell Claude Code (or any coding agent):

> Set up Cold Email Killer for me by following AGENTS.md.

**Option B: do it yourself.** You need Node 20+.

```bash
git clone https://github.com/christianmat/cold-email-killer.git && cd cold-email-killer
npm install
npx clasp login                     # sign in with the Gmail account to clean up
npx clasp create --type standalone --title "Cold Email Killer" --rootDir dist
mv dist/.clasp.json .clasp.json     # if clasp put it in dist/
npm run push
npx clasp deploy
```

> First time using clasp? Turn on the Apps Script API at https://script.google.com/home/usersettings.

Then:

1. Open `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`, using the ID printed by `clasp deploy`. That's your settings page; bookmark it.
2. Authorize. Google warns *"hasn't verified this app"*. That's expected for your own private script: click **Advanced → Go to Cold Email Killer → Allow**.
3. Pick an AI provider, paste a key, click **Test AI key**, then **Save & turn on**.
4. Optional: **Clean up last 14 days**.

> **"Sorry, unable to open the file"?** You're signed into several Google accounts. Open the URL in an incognito window signed into only the right one.

## AI providers

| Provider | Key | Default model |
|---|---|---|
| None | – | Rules only: catches mail from sales tools (Apollo, Outreach, Lemlist, Instantly…) |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-3.8-flash` (the free tier may use your data for training) |
| Claude | [platform.claude.com](https://platform.claude.com/settings/keys) | `claude-opus-5-5` |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-5-mini` |

If a default model gets retired, type a current one in the **Model** field.

## How it works

All code runs on **Google Apps Script inside your Google account**, under your Gmail permissions. There's no backend and no hosted service, and nobody else gets your data. Settings, including your API key, are stored in your account's script properties.

- Every 10 min it checks only inbox emails that arrived since the last run, at most 50 per run. Each email is checked once.
- Obvious cases are decided by rules: sales-tool fingerprints mean cold; people you know are kept. The AI only sees the rest: sender, subject, and the first 2,000 characters.
- It moves an email only when it's confident: ≥ 90% (Conservative, the default), 75% (Balanced) or 60% (Aggressive).
- The first 24h is a dry run: matches are labeled but stay in your inbox.
- API errors never move mail.

To stop it: settings page → **Pause**.

## FAQ

**Is it secure? Who can see my email?**
Only Google, which already has it, and the AI provider you choose. The code runs in your own Apps Script project, and the settings page is restricted to you. With **None (rules only)**, nothing leaves Google at all.

**Why does Google say "this app isn't verified"?**
Google shows this for every personal script that hasn't been through its review. It's your own copy, running in your own account. Click **Advanced → Go to Cold Email Killer → Allow**.

**Why does it ask for full Gmail access?**
Apps Script's Gmail service only comes with one permission level. The code only reads, labels and archives emails. Check `src/gas/main.ts`.

**Does my computer need to be on?**
No. Google runs it on a timer.

**Does it re-check emails it has already seen?**
No. Each run only looks at emails that arrived since the last run, at most 50 per run, and it remembers what it has checked. The first run looks back 2 days; **Clean up last 14 days** goes further.

**Where do cold emails go?**
They're archived with the **Cold Email** label. Click that label in Gmail's sidebar, or search `label:cold-email`.

**What if it flags a real email?**
Move it back to your inbox, or remove the label. That sender is added to the allowlist on the next run and won't be flagged again. You can also edit the allowlist on the settings page.

**What does it cost?**
Apps Script is free. AI costs depend on your provider. Usually it's a few cents a day, because most emails are decided by rules or skipped, and there's a daily cap (default 200 AI calls).

**Do I need clasp / Node forever?**
No, only for setup and updates. After that, everything runs in Google.

**"Sorry, unable to open the file at this time"?**
You're signed into several Google accounts. Open the settings URL in an incognito window signed into only the right one.

**How do I stop it?**
Settings page → **Pause**. To remove it completely, delete the project at [script.google.com](https://script.google.com).

## Develop

```bash
npm test          # unit tests
npm run eval      # score sample emails (PROVIDER=gemini API_KEY=... for AI)
npm run push      # build + upload to your Apps Script project
```

`src/core` holds the logic (rules, pipeline), `src/providers` the AI calls, `src/gas` the Gmail glue, and `src/ui` the settings page. Add sales-tool domains in `src/core/fingerprints.ts`.

MIT
