# Cold Email Killer

Auto-archives cold sales emails out of your Gmail inbox into a **Cold Email** label. Nothing is deleted.

- Runs free inside **your own Google account** (Apps Script), every 10 minutes, even when your computer is off.
- No server, no sign-up. Your email only goes to the AI provider you choose, with your own key.
- Never touches people you've emailed, threads you've replied to, your coworkers, newsletters, or calendar invites.
- Wrong call? Move the email back to your inbox and that sender is never flagged again.

## Setup (5 min)

**Option A: let your AI agent do it.** Clone this repo and tell Claude Code (or any coding agent):

> Set up Cold Email Killer for me by following AGENTS.md.

**Option B: do it yourself.** You need Node 20+.

```bash
git clone <this repo> && cd coldemailkiller
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

- Every 10 min it checks only inbox emails that arrived since the last run, at most 50 per run. Each email is checked once.
- Obvious cases are decided by rules: sales-tool fingerprints mean cold; people you know are kept. The AI only sees the rest: sender, subject, and the first 2,000 characters.
- It moves an email only when it's confident: ≥ 90% (Conservative, the default), 75% (Balanced) or 60% (Aggressive).
- The first 24h is a dry run: matches are labeled but stay in your inbox.
- API errors never move mail.

To stop it: settings page → **Pause**.

## Develop

```bash
npm test          # unit tests
npm run eval      # score sample emails (PROVIDER=gemini API_KEY=... for AI)
npm run push      # build + upload to your Apps Script project
```

`src/core` holds the logic (rules, pipeline), `src/providers` the AI calls, `src/gas` the Gmail glue, and `src/ui` the settings page. Add sales-tool domains in `src/core/fingerprints.ts`.

MIT
