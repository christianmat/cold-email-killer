import { hardKeepReason, isAllowlisted, scoreRules } from './rules';
import { type KV, readJSON, writeJSON } from './storage';
import { DEFAULT_CONFIG, type Config, type Decision, type Email, type ThresholdLevel, type Verdict } from './types';

export const THRESHOLDS: Record<ThresholdLevel, number> = {
  conservative: 0.9,
  balanced: 0.75,
  aggressive: 0.6,
};

/** Rule score at/above this moves the email without spending an LLM call. */
export const RULES_SURE = 0.95;
export const MAX_THREADS_PER_RUN = 50;
const TIME_BUDGET_MS = 4.5 * 60 * 1000;
const DECISION_LOG_SIZE = 50;
const SEEN_SIZE = 1000;
const TRACK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const KEYS = {
  config: 'config',
  lastRun: 'lastRunEpoch',
  seen: 'seen',
  log: 'decisions',
  moved: 'moved',
  usage: 'llmUsage',
  sentCache: 'sentCache',
  status: 'status',
} as const;

export interface ThreadState {
  exists: boolean;
  inInbox: boolean;
  hasColdLabel: boolean;
}

/** Everything Gmail-specific, so the pipeline runs in tests with a fake. */
export interface MailPort {
  userEmails(): string[];
  /**
   * Inbox threads (not already labeled Cold Email) with a message after `sinceEpochSec`,
   * as their latest message from someone other than the user. Pages past threads where
   * `isSeen(threadId, messageId)` is true, returning at most `max` unseen ones.
   */
  listCandidates(sinceEpochSec: number, max: number, isSeen: (threadId: string, messageId: string) => boolean): Email[];
  hasSentTo(email: string): boolean;
  markCold(threadId: string, archive: boolean): void;
  threadState(threadId: string): ThreadState;
}

export type Classifier = (email: Email) => Verdict;

export interface Deps {
  mail: MailPort;
  kv: KV;
  /** null = rules-only mode. */
  classifier: Classifier | null;
  now: () => number;
}

export interface RunStatus {
  at: number;
  scanned: number;
  moved: number;
  llmCalls: number;
  errors: string[];
  complete: boolean;
}

interface Moved {
  threadId: string;
  from: string;
  at: number;
  archived: boolean;
}

export function loadConfig(kv: KV): Config {
  return { ...DEFAULT_CONFIG, ...readJSON<Partial<Config>>(kv, KEYS.config, {}) };
}

export function saveConfig(kv: KV, cfg: Config): void {
  writeJSON(kv, KEYS.config, cfg);
}

export function isDryRun(cfg: Config, now: number): boolean {
  if (cfg.dryRun === 'on') return true;
  if (cfg.dryRun === 'off') return false;
  return cfg.installedAt === null || now < cfg.installedAt + DAY_MS;
}

/** Pure decision for one email. */
export function decide(
  email: Email,
  cfg: Config,
  ctx: { userEmails: string[]; hasSentTo(e: string): boolean; classifier: Classifier | null; llmAllowed: boolean },
): { verdict: Verdict; source: Decision['source']; usedLlm: boolean } {
  const keep = hardKeepReason(email, { userEmails: ctx.userEmails, allowlist: cfg.allowlist, hasSentTo: ctx.hasSentTo });
  if (keep) {
    return { verdict: { cold: false, confidence: 1, category: 'not_cold', reason: keep }, source: 'keep', usedLlm: false };
  }

  const rules = scoreRules(email);
  const rulesReason = rules.signals.length ? `Rules: ${rules.signals.join(', ')}` : 'Rules: no signals';
  if (rules.score >= RULES_SURE) {
    return {
      verdict: { cold: true, confidence: rules.score, category: rules.category, reason: rulesReason },
      source: 'rules',
      usedLlm: false,
    };
  }

  if (ctx.classifier && ctx.llmAllowed) {
    try {
      const v = ctx.classifier(email);
      // Strong rule signals can lift a cold LLM verdict, never create one.
      const confidence = v.cold ? Math.max(v.confidence, rules.score) : v.confidence;
      return { verdict: { ...v, confidence }, source: 'llm', usedLlm: true };
    } catch (err) {
      return {
        verdict: { cold: false, confidence: 0, category: 'not_cold', reason: `LLM error: ${errMsg(err)}` },
        source: 'error',
        usedLlm: true,
      };
    }
  }

  return {
    verdict: { cold: rules.score > 0, confidence: rules.score, category: rules.category, reason: rulesReason },
    source: 'rules',
    usedLlm: false,
  };
}

function errMsg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 160);
}

function today(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Allowlist senders whose threads the user pulled back out of Cold Email. */
export function learnFromCorrections(deps: Deps, cfg: Config): string[] {
  const now = deps.now();
  const moved = readJSON<Moved[]>(deps.kv, KEYS.moved, []);
  const keep: Moved[] = [];
  const learned: string[] = [];
  for (const m of moved) {
    if (now - m.at > TRACK_DAYS * DAY_MS) continue;
    let st: ThreadState;
    try {
      st = deps.mail.threadState(m.threadId);
    } catch {
      keep.push(m);
      continue;
    }
    if (!st.exists) continue;
    // In dry run we never archived, so only a removed label counts as a correction.
    const corrected = !st.hasColdLabel || (m.archived && st.inInbox);
    if (corrected) {
      if (!isAllowlisted(m.from, cfg.allowlist) && !learned.includes(m.from)) learned.push(m.from);
    } else {
      keep.push(m);
    }
  }
  if (learned.length) {
    cfg.allowlist = [...cfg.allowlist, ...learned];
    saveConfig(deps.kv, cfg);
  }
  writeJSON(deps.kv, KEYS.moved, keep);
  return learned;
}

export function run(deps: Deps, opts: { sinceEpochSec?: number } = {}): RunStatus {
  const started = deps.now();
  const cfg = loadConfig(deps.kv);
  const status: RunStatus = { at: started, scanned: 0, moved: 0, llmCalls: 0, errors: [], complete: true };
  if (cfg.paused) {
    status.errors.push('Paused');
    writeJSON(deps.kv, KEYS.status, status);
    return status;
  }

  try {
    const learned = learnFromCorrections(deps, cfg);
    if (learned.length) status.errors.push(`Learned: allowlisted ${learned.join(', ')}`);
  } catch (err) {
    status.errors.push(`Learning failed: ${errMsg(err)}`);
  }

  const threshold = THRESHOLDS[cfg.threshold];
  const dryRun = isDryRun(cfg, started);
  const userEmails = deps.mail.userEmails();
  const lastRun = Number(deps.kv.get(KEYS.lastRun) ?? 0);
  const since = opts.sinceEpochSec ?? (lastRun ? lastRun - 60 : Math.floor(started / 1000) - 2 * 86400);

  const seen = readJSON<string[]>(deps.kv, KEYS.seen, []);
  const seenSet = new Set(seen);
  const log = readJSON<Decision[]>(deps.kv, KEYS.log, []);
  const moved = readJSON<Moved[]>(deps.kv, KEYS.moved, []);
  const usage = readJSON<{ day: string; count: number }>(deps.kv, KEYS.usage, { day: today(started), count: 0 });
  if (usage.day !== today(started)) Object.assign(usage, { day: today(started), count: 0 });
  const sentCache = readJSON<string[]>(deps.kv, KEYS.sentCache, []);
  const hasSentTo = (e: string) => {
    if (sentCache.includes(e)) return true;
    const yes = deps.mail.hasSentTo(e);
    if (yes) sentCache.push(e);
    return yes;
  };

  const candidates = deps.mail.listCandidates(since, MAX_THREADS_PER_RUN, (t, m) => seenSet.has(`${t}:${m}`));
  if (candidates.length >= MAX_THREADS_PER_RUN) status.complete = false;

  for (const email of candidates) {
    if (deps.now() - started > TIME_BUDGET_MS) {
      status.complete = false;
      break;
    }
    const key = `${email.threadId}:${email.messageId}`;
    if (seenSet.has(key)) continue;
    status.scanned++;

    const { verdict, source, usedLlm } = decide(email, cfg, {
      userEmails,
      hasSentTo,
      classifier: deps.classifier,
      llmAllowed: usage.count < cfg.dailyLlmCap,
    });
    if (usedLlm) {
      usage.count++;
      status.llmCalls++;
    }
    if (source === 'error') status.errors.push(verdict.reason);

    let action: Decision['action'] = 'none';
    if (verdict.cold && verdict.confidence >= threshold) {
      try {
        deps.mail.markCold(email.threadId, !dryRun);
        action = dryRun ? 'labeled' : 'moved';
        status.moved++;
        moved.push({ threadId: email.threadId, from: email.fromEmail.toLowerCase(), at: deps.now(), archived: !dryRun });
      } catch (err) {
        status.errors.push(`Gmail error: ${errMsg(err)}`);
        continue; // retry next run
      }
    }

    // LLM errors are retried next run; everything else is final for this message.
    if (source !== 'error') {
      seen.push(key);
      seenSet.add(key);
    }
    log.unshift({
      ...verdict,
      threadId: email.threadId,
      fromEmail: email.fromEmail,
      subject: email.subject.slice(0, 100),
      reason: verdict.reason.slice(0, 160),
      source,
      action,
      at: deps.now(),
    });
  }

  writeJSON(deps.kv, KEYS.seen, seen.slice(-SEEN_SIZE));
  writeJSON(deps.kv, KEYS.log, log.slice(0, DECISION_LOG_SIZE));
  writeJSON(deps.kv, KEYS.moved, moved);
  writeJSON(deps.kv, KEYS.usage, usage);
  writeJSON(deps.kv, KEYS.sentCache, sentCache.slice(-500));
  if (status.complete && opts.sinceEpochSec === undefined) {
    deps.kv.set(KEYS.lastRun, String(Math.floor(started / 1000)));
  }
  status.errors = status.errors.slice(0, 10);
  writeJSON(deps.kv, KEYS.status, status);
  return status;
}
