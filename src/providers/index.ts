import type { Email, ProviderId, Verdict } from '../core/types';
import { SYSTEM_PROMPT, VERDICT_SCHEMA, parseVerdict, userPrompt } from './prompt';

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface ProviderSpec {
  label: string;
  defaultModel: string;
  keyUrl: string;
  buildRequest(email: Email, apiKey: string, model: string): HttpRequest;
  /** Parse raw response body text into a verdict. Throws on refusal / malformed output. */
  parseResponse(body: string): Verdict;
}

const gemini: ProviderSpec = {
  label: 'Google Gemini',
  defaultModel: 'gemini-3.8-flash',
  keyUrl: 'https://aistudio.google.com/apikey',
  buildRequest(email, apiKey, model) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt(email) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 1024 },
      },
    };
  },
  parseResponse(body) {
    const json = JSON.parse(body);
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error(`Gemini returned no text (finishReason: ${json.candidates?.[0]?.finishReason ?? 'unknown'})`);
    return parseVerdict(text);
  },
};

// Opus 5.5 / Sonnet 5.5 accept effort + server-side fallbacks; Haiku 4.5 rejects effort.
function anthropicSupportsEffort(model: string): boolean {
  return !/haiku/i.test(model);
}

const anthropic: ProviderSpec = {
  label: 'Anthropic Claude',
  defaultModel: 'claude-opus-5-5',
  keyUrl: 'https://platform.claude.com/settings/keys',
  buildRequest(email, apiKey, model) {
    const modern = anthropicSupportsEffort(model);
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    const body: Record<string, unknown> = {
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt(email) }],
    };
    if (modern) {
      body.output_config = { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } };
      body.fallbacks = 'default';
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }
    return { url: 'https://api.anthropic.com/v1/messages', headers, body };
  },
  parseResponse(body) {
    const json = JSON.parse(body);
    if (json.stop_reason === 'refusal') throw new Error('Claude declined to classify this email');
    const text = (json.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');
    return parseVerdict(text);
  },
};

const openai: ProviderSpec = {
  label: 'OpenAI',
  defaultModel: 'gpt-5-mini',
  keyUrl: 'https://platform.openai.com/api-keys',
  buildRequest(email, apiKey, model) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(email) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'verdict', strict: true, schema: VERDICT_SCHEMA },
        },
      },
    };
  },
  parseResponse(body) {
    const json = JSON.parse(body);
    const msg = json.choices?.[0]?.message;
    if (msg?.refusal) throw new Error(`OpenAI refused: ${msg.refusal}`);
    return parseVerdict(msg?.content ?? '');
  },
};

export const PROVIDERS: Record<Exclude<ProviderId, 'none'>, ProviderSpec> = { gemini, anthropic, openai };

export function getProvider(id: ProviderId): ProviderSpec | null {
  return id === 'none' ? null : PROVIDERS[id] ?? null;
}
