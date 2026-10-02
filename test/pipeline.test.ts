import { beforeEach, describe, expect, it } from 'vitest';
import { mk } from '../fixtures/emails';
import { KEYS, type MailPort, type ThreadState, isDryRun, loadConfig, run, saveConfig } from '../src/core/pipeline';
import { MemoryKV, readJSON } from '../src/core/storage';
import { DEFAULT_CONFIG, type Config, type Decision, type Email, type Verdict } from '../src/core/types';

const DAY = 86400000;

class FakeMail implements MailPort {
  inbox: Email[] = [];
  state = new Map<string, ThreadState>();
  sentTo = new Set<string>();
  marked: { threadId: string; archive: boolean }[] = [];
  lastSince = 0;
  userEmails() {
    return ['me@frigade.com'];
  }
  listCandidates(since: number, max: number, isSeen: (t: string, m: string) => boolean) {
    this.lastSince = since;
    return this.inbox.filter((e) => !isSeen(e.threadId, e.messageId)).slice(0, max);
  }
  hasSentTo(e: string) {
    return this.sentTo.has(e);
  }
  markCold(threadId: string, archive: boolean) {
    this.marked.push({ threadId, archive });
    this.state.set(threadId, { exists: true, inInbox: !archive, hasColdLabel: true });
  }
  threadState(threadId: string) {
    return this.state.get(threadId) ?? { exists: false, inInbox: false, hasColdLabel: false };
  }
}

const pitch = () =>
  mk({ fromEmail: 'rep@vendor.com', subject: 'hello', plainBody: 'Some neutral looking text without obvious signals.' });
const apollo = () => mk({ fromEmail: 'sdr@vendor.com', subject: 'Quick question', headers: { 'message-id': '<x@apollo.io>' } });

let kv: MemoryKV;
let mail: FakeMail;
let now: number;
const cold = (confidence: number): Verdict => ({ cold: true, confidence, category: 'sales', reason: 'pitch' });

function setCfg(p: Partial<Config>) {
  saveConfig(kv, { ...DEFAULT_CONFIG, installedAt: now - 2 * DAY, dryRun: 'off', ...p });
}

beforeEach(() => {
  kv = new MemoryKV();
  mail = new FakeMail();
  now = Date.UTC(2026, 9, 2, 12);
  setCfg({});
});

const deps = (classifier: ((e: Email) => Verdict) | null = null) => ({ mail, kv, classifier, now: () => now });

describe('run', () => {
  it('archives sure-cold rule hits without calling the LLM', () => {
    mail.inbox = [apollo()];
    let calls = 0;
    const s = run(deps(() => (calls++, cold(1))));
    expect(calls).toBe(0);
    expect(s.moved).toBe(1);
    expect(mail.marked[0].archive).toBe(true);
  });

  it('uses the LLM for undecided mail and respects the threshold', () => {
    mail.inbox = [pitch(), pitch()];
    const verdicts = [cold(0.95), cold(0.8)];
    const s = run(deps(() => verdicts.shift()!));
    expect(s.llmCalls).toBe(2);
    expect(s.moved).toBe(1); // conservative = 0.9
  });

  it('only labels in dry run', () => {
    setCfg({ dryRun: 'on' });
    mail.inbox = [apollo()];
    run(deps());
    expect(mail.marked[0].archive).toBe(false);
    expect(readJSON<Decision[]>(kv, KEYS.log, [])[0].action).toBe('labeled');
  });

  it('auto dry run lasts 24h after install', () => {
    const cfg = { ...DEFAULT_CONFIG, installedAt: now };
    expect(isDryRun(cfg, now + DAY - 1)).toBe(true);
    expect(isDryRun(cfg, now + DAY + 1)).toBe(false);
  });

  it('never moves on LLM error and retries next run', () => {
    mail.inbox = [pitch()];
    let fail = true;
    const classifier = () => {
      if (fail) throw new Error('HTTP 500');
      return cold(0.99);
    };
    const s1 = run(deps(classifier));
    expect(s1.moved).toBe(0);
    expect(s1.errors[0]).toMatch(/HTTP 500/);
    fail = false;
    const s2 = run(deps(classifier));
    expect(s2.moved).toBe(1);
  });

  it('does not re-process seen messages', () => {
    mail.inbox = [pitch()];
    let calls = 0;
    const c = () => (calls++, { ...cold(0.1), cold: false });
    run(deps(c));
    run(deps(c));
    expect(calls).toBe(1);
  });

  it('stops calling the LLM at the daily cap and falls back to rules', () => {
    setCfg({ dailyLlmCap: 1 });
    mail.inbox = [pitch(), pitch(), pitch()];
    let calls = 0;
    run(deps(() => (calls++, cold(0.99))));
    expect(calls).toBe(1);
  });

  it('keeps people you have emailed even if the LLM would say cold', () => {
    const e = pitch();
    mail.sentTo.add(e.fromEmail);
    mail.inbox = [e];
    const s = run(deps(() => cold(1)));
    expect(s.moved).toBe(0);
    expect(s.llmCalls).toBe(0);
  });

  it('does nothing while paused', () => {
    setCfg({ paused: true });
    mail.inbox = [apollo()];
    expect(run(deps()).moved).toBe(0);
  });

  it('advances lastRun only after a complete run and looks back 2 days initially', () => {
    mail.inbox = [];
    run(deps());
    expect(mail.lastSince).toBe(Math.floor(now / 1000) - 2 * 86400);
    expect(kv.get(KEYS.lastRun)).toBe(String(Math.floor(now / 1000)));
    now += 600000;
    run(deps());
    expect(mail.lastSince).toBe(Math.floor((now - 600000) / 1000) - 60);
  });

  it('does not advance lastRun on a sweep', () => {
    run(deps(), { sinceEpochSec: 123 });
    expect(mail.lastSince).toBe(123);
    expect(kv.get(KEYS.lastRun)).toBeNull();
  });
});

describe('learning', () => {
  it('allowlists the sender when you move a thread back to the inbox', () => {
    const e = apollo();
    mail.inbox = [e];
    run(deps());
    mail.state.set(e.threadId, { exists: true, inInbox: true, hasColdLabel: true });
    mail.inbox = [];
    const s = run(deps());
    expect(loadConfig(kv).allowlist).toContain('sdr@vendor.com');
    expect(s.errors.join()).toMatch(/Learned/);
  });

  it('in dry run only a removed label counts as a correction', () => {
    setCfg({ dryRun: 'on' });
    const e = apollo();
    mail.inbox = [e];
    run(deps());
    mail.inbox = [];
    run(deps()); // still in inbox with label: not a correction
    expect(loadConfig(kv).allowlist).toEqual([]);
    mail.state.set(e.threadId, { exists: true, inInbox: true, hasColdLabel: false });
    run(deps());
    expect(loadConfig(kv).allowlist).toEqual(['sdr@vendor.com']);
  });

  it('ignores deleted threads', () => {
    const e = apollo();
    mail.inbox = [e];
    run(deps());
    mail.state.delete(e.threadId);
    mail.inbox = [];
    run(deps());
    expect(loadConfig(kv).allowlist).toEqual([]);
    expect(readJSON(kv, KEYS.moved, [1])).toEqual([]);
  });
});
