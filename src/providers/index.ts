import type { Email, ProviderId, Verdict } from '../core/types';
import { SYSTEM_PROMPT, VERDICT_SCHEMA, parseVerdict, userPrompt } from './prompt';

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface ProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ProviderSpec {
  label: string;
  defaultModel: string;
  keyUrl: string;
  /** False for self-hosted servers that don't need a key. */
  keyRequired: boolean;
  /** True if the user must supply a server URL. */
  needsBaseUrl: boolean;
  buildRequest(email: Email, opts: ProviderOptions): HttpRequest;
  /** Parse raw response body text into a verdict. Throws on refusal / malformed output. */
  parseResponse(body: string): Verdict;
}

const gemini: ProviderSpec = {
  label: 'Google Gemini',
  defaultModel: 'gemini-3.8-flash',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyRequired: true,
  needsBaseUrl: false,
  buildRequest(email, { apiKey, model }) {
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
  keyRequired: true,
  needsBaseUrl: false,
  buildRequest(email, { apiKey, model }) {
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
  keyRequired: true,
  needsBaseUrl: false,
  buildRequest(email, { apiKey, model }) {
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

/** Accepts `https://host`, `https://host/v1` or a full `/chat/completions` URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  const u = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(u)) return u;
  if (/\/v\d+$/.test(u)) return `${u}/chat/completions`;
  return `${u}/v1/chat/completions`;
}

// Any server speaking the OpenAI Chat Completions API: Ollama, LM Studio, vLLM, llama.cpp, LocalAI...
// No response_format: support for it varies between servers, and parseVerdict pulls the JSON out of plain text.
const compatible: ProviderSpec = {
  label: 'Self-hosted (OpenAI-compatible)',
  defaultModel: '',
  keyUrl: '',
  keyRequired: false,
  needsBaseUrl: true,
  buildRequest(email, { apiKey, model, baseUrl }) {
    if (!baseUrl) throw new Error('Set the server URL for your self-hosted model');
    if (!model) throw new Error('Set the model name for your self-hosted model');
    const headers: Record<string, string> = { 'ngrok-skip-browser-warning': '1' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return {
      url: chatCompletionsUrl(baseUrl),
      headers,
      body: {
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(email) },
        ],
      },
    };
  },
  parseResponse: (body) => openai.parseResponse(body),
};

export const PROVIDERS: Record<Exclude<ProviderId, 'none'>, ProviderSpec> = { gemini, anthropic, openai, compatible };

export function getProvider(id: ProviderId): ProviderSpec | null {
  return id === 'none' ? null : PROVIDERS[id] ?? null;
}
