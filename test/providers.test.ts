import { describe, expect, it } from 'vitest';
import { mk } from '../fixtures/emails';
import { PROVIDERS, chatCompletionsUrl } from '../src/providers';
import { parseVerdict, userPrompt } from '../src/providers/prompt';

const email = mk({ fromName: 'A', fromEmail: 'a@b.com', subject: 'Hi', plainBody: 'x'.repeat(5000) });
const verdictJson = '{"cold":true,"confidence":0.93,"category":"sales","reason":"Template pitch"}';

describe('prompt', () => {
  it('truncates the body', () => {
    expect(userPrompt(email).length).toBeLessThan(2300);
  });

  it('parses JSON wrapped in prose / fences', () => {
    expect(parseVerdict('```json\n' + verdictJson + '\n```').confidence).toBe(0.93);
  });

  it('clamps confidence and fixes inconsistent categories', () => {
    const v = parseVerdict('{"cold":false,"confidence":3,"category":"sales","reason":""}');
    expect(v.confidence).toBe(1);
    expect(v.category).toBe('not_cold');
    expect(parseVerdict('{"cold":true,"confidence":0.8,"category":"weird","reason":""}').category).toBe('sales');
  });

  it('throws on garbage', () => {
    expect(() => parseVerdict('sorry, I cannot')).toThrow();
    expect(() => parseVerdict('{"confidence":1}')).toThrow();
  });
});

describe('gemini', () => {
  it('builds a JSON-mode request with the key in a header', () => {
    const r = PROVIDERS.gemini.buildRequest(email, { apiKey: 'KEY', model: 'gemini-x' });
    expect(r.url).toContain('/models/gemini-x:generateContent');
    expect(r.headers['x-goog-api-key']).toBe('KEY');
    expect(JSON.stringify(r.body)).toContain('application/json');
  });
  it('parses a response', () => {
    const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: verdictJson }] } }] });
    expect(PROVIDERS.gemini.parseResponse(body).cold).toBe(true);
  });
  it('throws on a blocked response', () => {
    expect(() => PROVIDERS.gemini.parseResponse(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }))).toThrow(/SAFETY/);
  });
});

describe('anthropic', () => {
  it('uses effort + structured output + fallbacks on current models', () => {
    const r = PROVIDERS.anthropic.buildRequest(email, { apiKey: 'KEY', model: 'claude-opus-5-5' });
    const b = r.body as Record<string, any>;
    expect(r.headers['x-api-key']).toBe('KEY');
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
    expect(r.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(b.output_config.effort).toBe('low');
    expect(b.output_config.format.type).toBe('json_schema');
    expect(b.fallbacks).toBe('default');
    expect(b.thinking).toBeUndefined();
  });
  it('omits effort/fallbacks for Haiku', () => {
    const b = PROVIDERS.anthropic.buildRequest(email, { apiKey: 'K', model: 'claude-haiku-4-5' }).body as Record<string, any>;
    expect(b.output_config).toBeUndefined();
    expect(b.fallbacks).toBeUndefined();
  });
  it('reads the text block, skipping thinking blocks', () => {
    const body = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: verdictJson }] });
    expect(PROVIDERS.anthropic.parseResponse(body).category).toBe('sales');
  });
  it('throws on refusal', () => {
    expect(() => PROVIDERS.anthropic.parseResponse(JSON.stringify({ stop_reason: 'refusal', content: [] }))).toThrow(/declined/);
  });
});

describe('openai', () => {
  it('builds a strict json_schema request', () => {
    const r = PROVIDERS.openai.buildRequest(email, { apiKey: 'KEY', model: 'gpt-x' });
    expect(r.headers.Authorization).toBe('Bearer KEY');
    expect((r.body as any).response_format.json_schema.strict).toBe(true);
  });
  it('parses and handles refusals', () => {
    expect(PROVIDERS.openai.parseResponse(JSON.stringify({ choices: [{ message: { content: verdictJson } }] })).cold).toBe(true);
    expect(() => PROVIDERS.openai.parseResponse(JSON.stringify({ choices: [{ message: { refusal: 'no' } }] }))).toThrow();
  });
});

describe('self-hosted (OpenAI-compatible)', () => {
  it('normalizes server URLs', () => {
    expect(chatCompletionsUrl('https://llm.example.com')).toBe('https://llm.example.com/v1/chat/completions');
    expect(chatCompletionsUrl('https://llm.example.com/v1/')).toBe('https://llm.example.com/v1/chat/completions');
    expect(chatCompletionsUrl('https://x.com/api/v1/chat/completions')).toBe('https://x.com/api/v1/chat/completions');
  });
  it('works without a key and sends a bearer token when given one', () => {
    const noKey = PROVIDERS.compatible.buildRequest(email, { apiKey: '', model: 'llama3.3', baseUrl: 'https://llm.example.com' });
    expect(noKey.headers.Authorization).toBeUndefined();
    expect((noKey.body as any).model).toBe('llama3.3');
    const withKey = PROVIDERS.compatible.buildRequest(email, { apiKey: 'K', model: 'm', baseUrl: 'https://llm.example.com' });
    expect(withKey.headers.Authorization).toBe('Bearer K');
  });
  it('requires a URL and model', () => {
    expect(() => PROVIDERS.compatible.buildRequest(email, { apiKey: '', model: 'm' })).toThrow(/URL/);
    expect(() => PROVIDERS.compatible.buildRequest(email, { apiKey: '', model: '', baseUrl: 'https://x' })).toThrow(/model/);
  });
  it('parses plain-text JSON replies', () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'Sure! ' + verdictJson } }] });
    expect(PROVIDERS.compatible.parseResponse(body).cold).toBe(true);
  });
});
