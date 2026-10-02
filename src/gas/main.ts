// Apps Script entry points. Everything Google-specific lives here; logic lives in ../core.
import { isCalendarInvite, parseAddress, parseHeaders } from '../core/mime';
import {
  KEYS,
  type Classifier,
  type MailPort,
  type RunStatus,
  isDryRun,
  loadConfig,
  run as runPipeline,
  saveConfig,
} from '../core/pipeline';
import { type KV, readJSON } from '../core/storage';
import { type Config, type Decision, type Email, LABEL_NAME } from '../core/types';
import { PROVIDERS, getProvider } from '../providers';

const HANDLER = 'run';
const PAGE = 50;
const MAX_PAGES = 10;

const kv: KV = {
  get: (k) => PropertiesService.getUserProperties().getProperty(k),
  set: (k, v) => {
    PropertiesService.getUserProperties().setProperty(k, v);
  },
  delete: (k) => {
    PropertiesService.getUserProperties().deleteProperty(k);
  },
};

let cachedUserEmails: string[] | null = null;

const gmail: MailPort = {
  userEmails() {
    if (!cachedUserEmails) {
      cachedUserEmails = [Session.getEffectiveUser().getEmail(), ...GmailApp.getAliases()]
        .filter(Boolean)
        .map((e) => e.toLowerCase());
    }
    return cachedUserEmails;
  },

  listCandidates(since, max, isSeen) {
    const users = gmail.userEmails();
    const query = `in:inbox after:${since} -label:${LABEL_NAME.toLowerCase().replace(/\s+/g, '-')}`;
    const out: Email[] = [];
    for (let page = 0; page < MAX_PAGES && out.length < max; page++) {
      const threads = GmailApp.search(query, page * PAGE, PAGE);
      for (const thread of threads) {
        if (out.length >= max) break;
        const msgs = thread.getMessages();
        const others = msgs.filter((m) => !users.includes(parseAddress(m.getFrom()).email));
        if (!others.length) continue;
        const last = others[others.length - 1];
        if (isSeen(thread.getId(), last.getId())) continue;
        const from = parseAddress(last.getFrom());
        const raw = last.getRawContent();
        out.push({
          threadId: thread.getId(),
          messageId: last.getId(),
          fromName: from.name,
          fromEmail: from.email,
          subject: last.getSubject() ?? '',
          plainBody: last.getPlainBody() ?? '',
          htmlBody: last.getBody() ?? '',
          headers: parseHeaders(raw),
          userInThread: others.length !== msgs.length,
          isCalendarInvite: isCalendarInvite(raw),
          threadMessageCount: others.filter((m) => parseAddress(m.getFrom()).email === from.email).length,
        });
      }
      if (threads.length < PAGE) break;
    }
    return out;
  },

  hasSentTo(email) {
    return GmailApp.search(`in:sent to:${email}`, 0, 1).length > 0;
  },

  markCold(threadId, archive) {
    const thread = GmailApp.getThreadById(threadId);
    thread.addLabel(coldLabel());
    if (archive) thread.moveToArchive();
  },

  threadState(threadId) {
    let thread: GoogleAppsScript.Gmail.GmailThread | null = null;
    try {
      thread = GmailApp.getThreadById(threadId);
    } catch {
      thread = null;
    }
    if (!thread || thread.isInTrash() || thread.isInSpam()) return { exists: false, inInbox: false, hasColdLabel: false };
    return {
      exists: true,
      inInbox: thread.isInInbox(),
      hasColdLabel: thread.getLabels().some((l) => l.getName() === LABEL_NAME),
    };
  },
};

function coldLabel(): GoogleAppsScript.Gmail.GmailLabel {
  return GmailApp.getUserLabelByName(LABEL_NAME) ?? GmailApp.createLabel(LABEL_NAME);
}

function makeClassifier(cfg: Config): Classifier | null {
  const provider = getProvider(cfg.provider);
  if (!provider || !cfg.apiKey) return null;
  const model = cfg.model || provider.defaultModel;
  return (email) => {
    const req = provider.buildRequest(email, cfg.apiKey, model);
    const res = UrlFetchApp.fetch(req.url, {
      method: 'post',
      contentType: 'application/json',
      headers: req.headers,
      payload: JSON.stringify(req.body),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code >= 300) throw new Error(`${provider.label} HTTP ${code}: ${apiError(text)}`);
    return provider.parseResponse(text);
  };
}

function apiError(text: string): string {
  try {
    const j = JSON.parse(text);
    return String(j.error?.message ?? j.error ?? text).slice(0, 160);
  } catch {
    return text.slice(0, 160);
  }
}

function withLock<T>(fn: () => T, fallback: T): T {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) return fallback;
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

const busy = (): RunStatus => ({ at: Date.now(), scanned: 0, moved: 0, llmCalls: 0, errors: ['Another run is in progress'], complete: false });

function pipeline(sinceEpochSec?: number): RunStatus {
  const cfg = loadConfig(kv);
  return withLock(
    () => runPipeline({ mail: gmail, kv, classifier: makeClassifier(cfg), now: () => Date.now() }, { sinceEpochSec }),
    busy(),
  );
}

function installTrigger(): void {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === HANDLER) ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger(HANDLER).timeBased().everyMinutes(10).create();
}

function triggerInstalled(): boolean {
  return ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === HANDLER);
}

function maskKey(key: string): string {
  return key ? `••••${key.slice(-4)}` : '';
}

// ---------- Globals exposed to Apps Script (see scripts/build.mjs) ----------

/** Time-driven trigger handler. */
export function run(): RunStatus {
  return pipeline();
}

/** Serves the settings page (Deploy → Web app). */
export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('Settings')
    .setTitle('Cold Email Killer')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Run once from the editor if you prefer not to use the settings page. */
export function setup(): string {
  const cfg = loadConfig(kv);
  if (cfg.installedAt === null) cfg.installedAt = Date.now();
  saveConfig(kv, cfg);
  coldLabel();
  installTrigger();
  return 'Installed: runs every 10 minutes.';
}

export function apiGetState() {
  const cfg = loadConfig(kv);
  const now = Date.now();
  return {
    user: Session.getEffectiveUser().getEmail(),
    config: { ...cfg, apiKey: maskKey(cfg.apiKey) },
    dryRunActive: isDryRun(cfg, now),
    dryRunAutoEndsAt: cfg.installedAt ? cfg.installedAt + 86400000 : null,
    installed: triggerInstalled(),
    status: readJSON<RunStatus | null>(kv, KEYS.status, null),
    decisions: readJSON<Decision[]>(kv, KEYS.log, []),
    usage: readJSON(kv, KEYS.usage, { day: '', count: 0 }),
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, defaultModel: p.defaultModel, keyUrl: p.keyUrl })),
  };
}

export function apiSaveSettings(input: Partial<Config> & { apiKey?: string }) {
  const cfg = loadConfig(kv);
  const next: Config = {
    ...cfg,
    provider: input.provider ?? cfg.provider,
    model: (input.model ?? cfg.model).trim(),
    threshold: input.threshold ?? cfg.threshold,
    dryRun: input.dryRun ?? cfg.dryRun,
    paused: input.paused ?? cfg.paused,
    dailyLlmCap: Math.max(0, Math.floor(Number(input.dailyLlmCap ?? cfg.dailyLlmCap))),
    allowlist: (input.allowlist ?? cfg.allowlist).map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
  // Masked or blank key in the form means "keep the stored one".
  if (input.apiKey && !input.apiKey.startsWith('••••')) next.apiKey = input.apiKey.trim();
  if (input.provider && input.provider !== cfg.provider && !input.apiKey) next.apiKey = '';
  if (next.installedAt === null) next.installedAt = Date.now();
  saveConfig(kv, next);
  coldLabel();
  installTrigger();
  return apiGetState();
}

/** Tests the provider/key/model currently in the form (falls back to saved values). */
export function apiTestKey(input?: { provider?: Config['provider']; apiKey?: string; model?: string }): { ok: boolean; message: string } {
  const saved = loadConfig(kv);
  const provider = input?.provider ?? saved.provider;
  const typedKey = input?.apiKey?.trim();
  const useTyped = typedKey && !typedKey.startsWith('••••');
  const cfg: Config = {
    ...saved,
    provider,
    // A masked key in the form means "the saved one", but only if the provider didn't change.
    apiKey: useTyped ? typedKey : provider === saved.provider ? saved.apiKey : '',
    model: (input?.model ?? saved.model).trim(),
  };
  const classify = makeClassifier(cfg);
  if (!classify) return { ok: false, message: 'Pick a provider and paste an API key first.' };
  const sample: Email = {
    threadId: 'test',
    messageId: 'test',
    fromName: 'Alex Seller',
    fromEmail: 'alex@growthco.example',
    subject: 'Quick question',
    plainBody:
      "Hi there,\n\nI noticed you're scaling your team. We help SaaS companies like yours book 30+ demos a month. Worth a 15 minute chat next week?\n\nIf you're not the right person, who is?",
    htmlBody: '',
    headers: {},
    userInThread: false,
    isCalendarInvite: false,
    threadMessageCount: 1,
  };
  try {
    const v = classify(sample);
    return { ok: v.cold, message: v.cold ? `Works. Sample pitch → cold (${Math.round(v.confidence * 100)}%).` : `Key works, but the sample pitch was judged not cold: ${v.reason}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function apiRunNow(): RunStatus {
  return pipeline();
}

/** Re-scan the last N days (used by the "Clean up inbox" button; call repeatedly until complete). */
export function apiSweep(days: number): RunStatus {
  const d = Math.min(90, Math.max(1, Math.floor(days)));
  return pipeline(Math.floor(Date.now() / 1000) - d * 86400);
}
