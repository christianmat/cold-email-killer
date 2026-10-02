import { describe, expect, it } from 'vitest';
import { FIXTURES, mk } from '../fixtures/emails';
import { RULES_SURE, THRESHOLDS } from '../src/core/pipeline';
import { hardKeepReason, isAllowlisted, scoreRules } from '../src/core/rules';

const ctx = { userEmails: ['christian@frigade.com'], allowlist: [] as string[], hasSentTo: () => false };

describe('hardKeepReason', () => {
  it('keeps allowlisted email and domain (incl. subdomains)', () => {
    expect(isAllowlisted('a@b.com', ['a@b.com'])).toBe(true);
    expect(isAllowlisted('x@mail.b.com', ['b.com'])).toBe(true);
    expect(isAllowlisted('x@notb.com', ['b.com'])).toBe(false);
    expect(isAllowlisted('x@b.com', ['@b.com'])).toBe(true);
  });

  it('keeps same-domain senders but not shared public domains', () => {
    expect(hardKeepReason(mk({ fromEmail: 'eric@frigade.com' }), ctx)).toMatch(/Same domain/);
    const gmailUser = { ...ctx, userEmails: ['me@gmail.com'] };
    expect(hardKeepReason(mk({ fromEmail: 'stranger@gmail.com' }), gmailUser)).toBeNull();
  });

  it('keeps people you have emailed', () => {
    expect(hardKeepReason(mk({ fromEmail: 'a@x.com' }), { ...ctx, hasSentTo: (e) => e === 'a@x.com' })).toMatch(/emailed/);
  });

  it('keeps replied threads, invites, lists, noreply, auto-submitted', () => {
    expect(hardKeepReason(mk({ userInThread: true }), ctx)).toBeTruthy();
    expect(hardKeepReason(mk({ isCalendarInvite: true }), ctx)).toBeTruthy();
    expect(hardKeepReason(mk({ headers: { 'list-id': 'x' } }), ctx)).toBeTruthy();
    expect(hardKeepReason(mk({ fromEmail: 'no-reply@x.com' }), ctx)).toBeTruthy();
    expect(hardKeepReason(mk({ headers: { 'auto-submitted': 'auto-generated' } }), ctx)).toBeTruthy();
    expect(hardKeepReason(mk({ headers: { 'auto-submitted': 'no' } }), ctx)).toBeNull();
  });
});

describe('scoreRules', () => {
  it('flags sequencer fingerprints as sure-cold without an LLM', () => {
    for (const name of ['apollo quick question', 'lemlist tracked link', 'instantly bump', 'outreach.io headers']) {
      const f = FIXTURES.find((x) => x.name === name)!;
      expect(scoreRules(f.email).score, name).toBeGreaterThanOrEqual(RULES_SURE);
    }
  });

  it('never scores a real email at the aggressive threshold (no false positives in rules-only mode)', () => {
    for (const f of FIXTURES.filter((x) => !x.cold)) {
      if (hardKeepReason(f.email, ctx)) continue;
      expect(scoreRules(f.email).score, f.name).toBeLessThan(THRESHOLDS.aggressive);
    }
  });

  it('assigns a sensible category', () => {
    expect(scoreRules(FIXTURES.find((x) => x.name === 'seo link spam')!.email).category).toBe('partnership');
    expect(scoreRules(FIXTURES.find((x) => x.name === 'offshore agency no tool')!.email).category).toBe('agency');
  });

  it('matches fingerprint domains on host boundaries only', () => {
    const r = scoreRules(mk({ htmlBody: '<a href="https://notapollo.io.example.com/x">x</a>' }));
    expect(r.signals).not.toContain('Apollo fingerprint');
  });

  it('is zero for a plain note', () => {
    expect(scoreRules(mk({ subject: 'lunch', plainBody: 'see you at noon' })).score).toBe(0);
  });
});
