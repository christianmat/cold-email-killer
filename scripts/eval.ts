// Score the fixture set with rules (and optionally a real LLM).
//   npm run eval
//   PROVIDER=anthropic API_KEY=sk-... [MODEL=...] npm run eval
//   PROVIDER=compatible BASE_URL=http://localhost:11434 MODEL=llama3.3 npm run eval
import { FIXTURES } from '../fixtures/emails';
import { RULES_SURE, THRESHOLDS } from '../src/core/pipeline';
import { hardKeepReason, scoreRules } from '../src/core/rules';
import type { ProviderId, ThresholdLevel } from '../src/core/types';
import { getProvider } from '../src/providers';

const provider = getProvider((process.env.PROVIDER ?? 'none') as ProviderId);
const apiKey = process.env.API_KEY ?? '';
const baseUrl = process.env.BASE_URL ?? '';
const useLlm = !!provider && (provider.keyRequired ? !!apiKey : !!baseUrl);
const level = (process.env.THRESHOLD ?? 'conservative') as ThresholdLevel;
const threshold = THRESHOLDS[level];
const ctx = { userEmails: ['christian@frigade.com'], allowlist: [], hasSentTo: () => false };

let tp = 0, fp = 0, fn = 0, tn = 0;
for (const f of FIXTURES) {
  let cold = false;
  let conf = 0;
  let why: string;
  const keep = hardKeepReason(f.email, ctx);
  if (keep) {
    why = `keep: ${keep}`;
  } else {
    const r = scoreRules(f.email);
    conf = r.score;
    cold = r.score > 0;
    why = `rules ${r.score.toFixed(2)} [${r.signals.join(', ')}]`;
    if (r.score < RULES_SURE && provider && useLlm) {
      const req = provider.buildRequest(f.email, { apiKey, model: process.env.MODEL || provider.defaultModel, baseUrl });
      const res = await fetch(req.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...req.headers },
        body: JSON.stringify(req.body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
      const v = provider.parseResponse(text);
      cold = v.cold;
      conf = v.cold ? Math.max(v.confidence, r.score) : v.confidence;
      why = `llm ${v.cold ? 'cold' : 'not'} ${v.confidence.toFixed(2)} ${v.category}: ${v.reason}`;
    }
  }
  const moved = cold && conf >= threshold;
  if (moved && f.cold) tp++;
  else if (moved && !f.cold) fp++;
  else if (!moved && f.cold) fn++;
  else tn++;
  const mark = moved === f.cold ? 'ok ' : moved ? 'FP!' : 'miss';
  console.log(`${mark}  ${f.name.padEnd(48)} ${why}`);
}
console.log(`\n${provider && useLlm ? provider.label : 'rules only'} @ ${level}: moved ${tp}/${tp + fn} cold, false positives ${fp}/${fp + tn}`);
if (fp > 0) process.exitCode = 1;
