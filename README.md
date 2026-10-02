# Cold Email Killer

Give cold emails the cold shoulder.

I get a pile of "quick question" and "just bumping this" emails every day. This script finds them in Gmail, labels them `Cold Email` and archives them, so my inbox only has things people actually wrote to me.

It runs freely and securely in your own Google account on Google Apps Script. It checks every 10 minutes, even when your laptop is closed. For the AI part you can use Gemini, Claude or OpenAI with your own key, or point it at your own model (Ollama, LM Studio, vLLM, anything OpenAI-compatible) and keep the whole thing self-hosted.

It leaves alone anyone you've emailed before, threads you've replied in, people at your company, newsletters and calendar invites. If it ever gets one wrong, move the email back to your inbox and it won't flag that sender again.

## Setup (about 5 minutes)

### Option A: have your coding agent do it

Paste this into Claude Code or any other coding agent:

> Clone https://github.com/christianmat/cold-email-killer and set it up for me by following its AGENTS.md.

It runs the commands for you. You only do the parts that need a browser (signing in, clicking Allow, pasting your API key).

### Option B: do it yourself

You'll need Node 20 or newer. If you've never used clasp before, turn on the Apps Script API at https://script.google.com/home/usersettings first.

```bash
git clone https://github.com/christianmat/cold-email-killer.git && cd cold-email-killer
npm install
npx clasp login                     # use the Gmail account you want cleaned up
npx clasp create --type standalone --title "Cold Email Killer" --rootDir dist
mv dist/.clasp.json .clasp.json     # only if clasp put it in dist/
npm run push
npx clasp deploy
```

Then:

1. Open `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`, with the ID that `clasp deploy` printed. This is your settings page, so bookmark it.
2. Authorize it. Google will warn that it "hasn't verified this app", which happens with any personal script. Click Advanced, then Go to Cold Email Killer, then Allow.
3. Pick an AI provider, paste your key, hit Test AI key, then Save & turn on.
4. If you want to clear out the backlog, hit Clean up last 14 days.

## AI providers

| Provider | Where to get a key | Default model |
|---|---|---|
| None | | Rules only. Catches mail sent through sales tools like Apollo, Outreach, Lemlist and Instantly. |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-3.8-flash`. Heads up: on the free tier Google may train on what you send. |
| Claude | [platform.claude.com](https://platform.claude.com/settings/keys) | `claude-opus-5-5` |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-5-mini` |
| Self-hosted | Optional, only if your server wants one | Whatever model your server runs, e.g. `llama3.3` |

Models get retired now and then. If the default stops working, put a current model name in the Model field.

### Using your own model

Pick Self-hosted (OpenAI-compatible) and enter your server's URL and model name. Ollama, LM Studio, vLLM, llama.cpp and LocalAI all speak this API. Since the script runs on Google's servers, `localhost` won't reach your machine. Put the server behind a public HTTPS URL with something like Cloudflare Tunnel or Tailscale Funnel, and give it an API key if you can. With this setup your email goes from Gmail straight to hardware you control.

## How it works

All the code runs on Google Apps Script inside your own Google account, with your Gmail permissions. There's nothing hosted anywhere else, and your email only goes to the AI you picked, which can be a model on your own server. Your settings and API key are saved in the script's properties in your account.

Every 10 minutes it looks at inbox emails that came in since the last run (up to 50 at a time) and checks each one once. Rules handle the obvious ones. Mail sent through sales tools is cold, and people you know get kept. Everything else goes to the AI, which sees the sender, subject and the first 2,000 characters of the body.

It only moves an email when it's confident enough. That's 90% on Conservative (the default), 75% on Balanced and 60% on Aggressive. For the first 24 hours it runs in dry-run mode, which means it adds the label but leaves the email in your inbox so you can check its work. If the AI call fails, the email stays put and gets retried on the next run.

## FAQ

**Is it secure? Who can see my email?**
Google, which has it already, and the AI you pick. The code lives in your own Apps Script project and only you can open the settings page. If you run your own model, the only other place your email goes is your own server. If you choose None, it never leaves Google.

**Why does Google say the app isn't verified?**
Google shows that for every personal script that hasn't gone through its review process. This is your own copy in your own account. Click Advanced, then Go to Cold Email Killer, then Allow.

**Why does it ask for full Gmail access?**
Apps Script's Gmail service only has one permission level. The code reads, labels and archives emails and that's it. You can check for yourself in `src/gas/main.ts`.

**Does my computer need to be on?**
Nope. Google runs it on a timer.

**Does it re-check emails it has already seen?**
No. Each run only looks at what arrived since the last one, and it keeps track of what it has already checked. The very first run looks back 2 days. The Clean up last 14 days button is the only way to go further back.

**Where do the cold emails go?**
Into the Cold Email label. Click it in Gmail's sidebar or search for `label:cold-email`.

**What if it flags a real email?**
Move it back to your inbox or take the label off. On the next run that sender gets added to your allowlist. You can also edit the allowlist yourself on the settings page.

**What does it cost?**
Apps Script is free. The AI part depends on your provider, but it's usually a few cents a day, because the rules handle a lot of mail before the AI ever sees it. There's also a daily cap of 200 AI calls by default.

**Do I need Node and clasp after setup?**
Only to install updates. Once it's deployed, it runs entirely in Google.

**I get "Sorry, unable to open the file at this time".**
That happens when you're signed into more than one Google account. Open the settings URL in an incognito window and sign in with just the account that owns the script.

**How do I turn it off?**
Hit Pause on the settings page. To get rid of it for good, delete the project at [script.google.com](https://script.google.com).

## Development

```bash
npm test          # unit tests
npm run eval      # score the sample emails (add PROVIDER=gemini API_KEY=... to include the AI)
npm run push      # build and upload to your Apps Script project
```

The logic (rules and pipeline) is in `src/core`, the AI calls are in `src/providers`, the Gmail code is in `src/gas`, and the settings page is `src/ui/Settings.html`. If a sales tool is slipping through, add its domains to `src/core/fingerprints.ts`.

MIT licensed.
