# Agent setup guide

You are helping a user install Cold Email Killer into their own Google account. Run commands yourself; only hand the user steps that need a browser. Keep messages short.

## Steps

1. **Get the code.** If you're not already in this repo, run `git clone https://github.com/christianmat/cold-email-killer.git && cd cold-email-killer`. Check Node with `node -v` (v22 or later), then run `npm install`.
2. **Apps Script API.** Ask the user to turn it on at https://script.google.com/home/usersettings and wait for them to confirm.
3. **Log in.** The user must run `npx clasp login` themselves, because it opens a browser. In Claude Code, tell them to type `! npx clasp login`. They must sign in with the **Gmail account they want cleaned**. "Select all" on the consent screen is fine.
4. **Create the project.**
   ```bash
   npx clasp create --type standalone --title "Cold Email Killer" --rootDir dist
   ```
   If `dist/.clasp.json` exists afterwards, move it to the repo root as `.clasp.json` with `"rootDir": "dist"`.
5. **Push and deploy.**
   ```bash
   npm run push
   npx clasp deploy --description "initial"
   ```
   Take the deployment ID from the `@1` line, not `@HEAD`. The settings page is:
   `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`
6. **Hand off to the user** with exactly these steps:
   - Open the settings URL in a window signed into **only** that Google account. Incognito works. Several signed-in accounts cause "Sorry, unable to open the file".
   - Authorize: **Advanced → Go to Cold Email Killer (unsafe) → Allow**. This is their own private script.
     - If authorization doesn't appear, have them open `https://script.google.com/d/<SCRIPT_ID>/edit`, choose `setup` in the function dropdown, click **Run**, and allow it.
   - Pick a provider, paste an API key, click **Test AI key**, then **Save & turn on**. Optionally click **Clean up last 14 days**.
7. **Done.** Tell them:
   - Cold emails land in the **Cold Email** label.
   - The first 24h only labels, without archiving.
   - Moving an email back to the inbox allowlists that sender.

## Updating later

```bash
git pull && npm run push
npx clasp deploy -i <DEPLOYMENT_ID>   # same ID keeps the same URL
```

## Troubleshooting

- `HTTP 404 ... model ... no longer available`: the default model was retired. Put the model the error suggests in the **Model** field on the settings page, and update `defaultModel` in `src/providers/index.ts`.
- `User has not enabled the Apps Script API`: redo step 2, then wait a minute.
- Nothing is moving: check the status line on the settings page (paused? dry run? last error?).
