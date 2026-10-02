export type ProviderId = 'none' | 'gemini' | 'anthropic' | 'openai' | 'compatible';
export type ThresholdLevel = 'conservative' | 'balanced' | 'aggressive';
export type DryRunMode = 'auto' | 'on' | 'off';

export type Category =
  | 'sales'
  | 'recruiter'
  | 'agency'
  | 'fake_followup'
  | 'partnership'
  | 'not_cold';

export interface Email {
  threadId: string;
  messageId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  plainBody: string;
  htmlBody: string;
  /** Lowercased header name -> value (first occurrence). */
  headers: Record<string, string>;
  /** True if the user (or one of their aliases) sent any message in this thread. */
  userInThread: boolean;
  isCalendarInvite: boolean;
  /** Messages in thread from the sender (used for fake follow-up detection). */
  threadMessageCount: number;
}

export interface Verdict {
  cold: boolean;
  confidence: number;
  category: Category;
  reason: string;
}

export interface Decision extends Verdict {
  threadId: string;
  fromEmail: string;
  subject: string;
  source: 'rules' | 'llm' | 'keep' | 'error';
  action: 'moved' | 'labeled' | 'none';
  at: number;
}

export interface Config {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Base URL for OpenAI-compatible servers (Ollama, LM Studio, vLLM...). */
  baseUrl: string;
  threshold: ThresholdLevel;
  dryRun: DryRunMode;
  paused: boolean;
  allowlist: string[];
  dailyLlmCap: number;
  installedAt: number | null;
}

export const DEFAULT_CONFIG: Config = {
  provider: 'none',
  apiKey: '',
  model: '',
  baseUrl: '',
  threshold: 'conservative',
  dryRun: 'auto',
  paused: false,
  allowlist: [],
  dailyLlmCap: 200,
  installedAt: null,
};

export const LABEL_NAME = 'Cold Email';
