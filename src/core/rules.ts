import { FINGERPRINTS, TRACKING_HOSTS } from './fingerprints';
import type { Category, Email } from './types';

const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'hey.com',
  'fastmail.com', 'gmx.com', 'zoho.com',
]);

const NOREPLY = /^(no-?reply|do-?not-?reply|notifications?|alerts?|mailer-daemon|postmaster|bounce)[^@]*@/i;

export interface KeepContext {
  userEmails: string[];
  allowlist: string[];
  hasSentTo(email: string): boolean;
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

export function isAllowlisted(email: string, allowlist: string[]): boolean {
  const e = email.toLowerCase();
  const d = domainOf(e);
  return allowlist.some((raw) => {
    const a = raw.trim().toLowerCase().replace(/^@/, '');
    if (!a) return false;
    if (a.includes('@')) return a === e;
    return d === a || d.endsWith(`.${a}`);
  });
}

function userDomains(userEmails: string[]): string[] {
  return userEmails.map(domainOf).filter((d) => !PUBLIC_DOMAINS.has(d));
}

/**
 * True when the message reached the user through a group/alias in their own domain
 * (e.g. support@ as a Google Group). Groups add List-Id / Precedence: list to every
 * message, so those headers say nothing about whether the *sender* is a newsletter.
 */
export function isOwnGroupDelivery(headers: Record<string, string>, userEmails: string[]): boolean {
  const domains = userDomains(userEmails);
  if (!domains.length) return !!headers['x-google-group-id'];
  const listInfo = `${headers['list-id'] ?? ''} ${headers['mailing-list'] ?? ''}`.toLowerCase();
  return domains.some((d) => listInfo.includes(d));
}

/** Returns a reason string if the email must never be touched, else null. Cheapest checks first. */
export function hardKeepReason(email: Email, ctx: KeepContext): string | null {
  const from = email.fromEmail.toLowerCase();
  if (!from) return 'No sender address';
  if (ctx.userEmails.some((u) => u.toLowerCase() === from)) return 'Sent by you';
  if (isAllowlisted(from, ctx.allowlist)) return 'Sender is allowlisted';
  if (email.userInThread) return 'You already replied in this thread';
  if (email.isCalendarInvite) return 'Calendar invite';
  if (NOREPLY.test(from)) return 'Automated notification sender';
  const viaOwnGroup = isOwnGroupDelivery(email.headers, ctx.userEmails);
  if (email.headers['list-id'] && !viaOwnGroup) return 'Mailing list / newsletter (out of scope)';
  const auto = email.headers['auto-submitted'];
  if (auto && auto.toLowerCase() !== 'no') return 'Auto-generated message';
  const prec = (email.headers['precedence'] ?? '').toLowerCase();
  if ((prec === 'bulk' || prec === 'list') && !viaOwnGroup) return 'Bulk mail (out of scope)';
  const d = domainOf(from);
  if (!PUBLIC_DOMAINS.has(d) && ctx.userEmails.some((u) => domainOf(u) === d)) return 'Same domain as you';
  if (ctx.hasSentTo(from)) return 'You have emailed this sender before';
  return null;
}

export interface RuleResult {
  score: number;
  signals: string[];
  category: Category;
}

interface Phrase {
  re: RegExp;
  w: number;
  /** null = raises the cold score but doesn't vote on the category. */
  cat: Category | null;
  label: string;
}

const PHRASES: Phrase[] = [
  // Fake follow-ups
  { re: /\b(just )?bump(ing)? (this|my)\b/i, w: 0.5, cat: 'fake_followup', label: 'bump' },
  { re: /\b(floating|bringing) this (back )?(up|to the top)\b/i, w: 0.5, cat: 'fake_followup', label: 'float to top' },
  { re: /\b(my|the) (last|previous|prior) (email|note|message)\b/i, w: 0.35, cat: 'fake_followup', label: 'refers to own last email' },
  { re: /\bcircl(e|ing) back\b/i, w: 0.3, cat: 'fake_followup', label: 'circling back' },
  { re: /\b(didn'?t|haven'?t) (hear|heard) back\b/i, w: 0.4, cat: 'fake_followup', label: 'did not hear back' },
  { re: /\bfollowing up on my\b/i, w: 0.35, cat: 'fake_followup', label: 'following up on my' },
  // Sales
  { re: /^\s*(re:\s*)?quick question\b/i, w: 0.45, cat: 'sales', label: 'subject: quick question' },
  { re: /\b(worth|open to|up for) a (quick )?(chat|call|conversation)\b/i, w: 0.35, cat: 'sales', label: 'worth a chat' },
  { re: /\b(\d{1,2}|fifteen|twenty|thirty) ?(min(ute)?s?)\b.{0,40}\b(call|chat|next week|this week)\b/i, w: 0.35, cat: 'sales', label: 'N-minute call ask' },
  { re: /\bhop on a (quick )?call\b/i, w: 0.35, cat: 'sales', label: 'hop on a call' },
  { re: /\b(i|we) (noticed|saw) (that )?(you|your)\b/i, w: 0.2, cat: 'sales', label: 'personalised opener' },
  { re: /\bcame across (your|you)\b/i, w: 0.2, cat: 'sales', label: 'came across you' },
  { re: /\bwho('s| is) the (right|best) person\b/i, w: 0.45, cat: 'sales', label: 'right person ask' },
  { re: /\bbook a (time|demo|call|meeting)\b/i, w: 0.3, cat: 'sales', label: 'book a demo' },
  { re: /\b(if (you'?re|you are) not (the right person|interested)|not interested\?|reply (with )?["']?(no|stop|unsubscribe))/i, w: 0.5, cat: 'sales', label: 'opt-out line' },
  { re: /\b(prefer not to|don'?t want to) (hear|receive)\b/i, w: 0.5, cat: 'sales', label: 'opt-out line' },
  { re: /\bcompanies like yours\b/i, w: 0.35, cat: 'sales', label: 'companies like yours' },
  // Pitch structure (what a first-contact sales email is built from, regardless of product)
  { re: /\b(i'?m|i am|my name is|this is) [a-z][\w'.-]*( [a-z][\w'.-]*)? (from|with|at|here from) [A-Z]/i, w: 0.25, cat: null, label: 'self-intro from a company' },
  { re: /\bwe (provide|offer|build|deliver|specialize in|enable|power|are an? (leading|trusted|top))\b/i, w: 0.3, cat: null, label: 'vendor self-description' },
  { re: /\b(pilot|free trial|trial account|test account|free credits?|demo account|discount|promo code|special offer)\b/i, w: 0.3, cat: null, label: 'offer / trial / credits' },
  { re: /[$€£]\s?\d[\d,.]*\s*(k\b|fixed|flat|per|\/|usd|a month|monthly)|\b\d{1,3}% (commission|rev(enue)? share|of (net|revenue|sales))/i, w: 0.35, cat: 'partnership', label: 'deal terms / pricing' },
  { re: /\b(sponsor(ship|ed|ing)?|advertis(e|ing|ement)|affiliate|paid placement|placement in your|media kit)\b/i, w: 0.4, cat: 'partnership', label: 'sponsorship / advertising ask' },
  { re: /\b(explore|discuss) (a |an )?(potential |possible )?(partnership|collaboration|pilot|opportunit(y|ies)|synerg(y|ies))\b/i, w: 0.35, cat: 'partnership', label: 'explore an opportunity' },
  // Agency / freelancer
  { re: /\bwe help (companies|startups|saas|teams|founders|businesses)\b/i, w: 0.4, cat: 'agency', label: 'we help companies' },
  { re: /\b(offshore|nearshore|white[- ]label|dedicated (dev|development) team)\b/i, w: 0.45, cat: 'agency', label: 'outsourcing pitch' },
  { re: /\b(seo|lead gen(eration)?|appointment setting|ugc) (services|agency)\b/i, w: 0.45, cat: 'agency', label: 'agency services' },
  // Recruiter
  { re: /\b(exciting|great) (opportunity|role)\b/i, w: 0.3, cat: 'recruiter', label: 'exciting opportunity' },
  { re: /\b(hire|hiring) (top|vetted|pre-vetted|senior) (engineers|developers|talent)\b/i, w: 0.45, cat: 'recruiter', label: 'talent pitch' },
  // Partnership / link spam
  { re: /\b(guest post|sponsored (post|article)|link (exchange|insertion)|backlinks?)\b/i, w: 0.55, cat: 'partnership', label: 'link spam' },
  { re: /\b(collab(oration)? opportunity|partnership opportunity)\b/i, w: 0.35, cat: 'partnership', label: 'partnership pitch' },
];

const URL_HOST = /(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
const PIXEL = /<img[^>]+(width=["']?1["'\s>]|height=["']?1["'\s>]|width:\s*1px|height:\s*1px)/i;

function hosts(html: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  URL_HOST.lastIndex = 0;
  while ((m = URL_HOST.exec(html))) out.add(m[1].toLowerCase());
  return [...out];
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Combine independent signal weights: 1 - Π(1 - w). */
function combine(weights: number[]): number {
  return 1 - weights.reduce((acc, w) => acc * (1 - w), 1);
}

export function scoreRules(email: Email): RuleResult {
  const signals: string[] = [];
  const weights: number[] = [];
  const catWeight = new Map<Category, number>();
  const bump = (cat: Category, w: number) => catWeight.set(cat, (catWeight.get(cat) ?? 0) + w);

  const headerBlob = Object.entries(email.headers)
    .filter(([k]) => k !== 'list-id')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
    .toLowerCase();
  const bodyHosts = hosts(email.htmlBody + ' ' + email.plainBody);

  for (const fp of FINGERPRINTS) {
    const inHeaders = fp.domains.some((d) => headerBlob.includes(d));
    const inBody = bodyHosts.some((h) => fp.domains.some((d) => hostMatches(h, d)));
    if (inHeaders || inBody) {
      weights.push(fp.weight);
      signals.push(`${fp.tool} fingerprint`);
      bump('sales', fp.weight);
    }
  }

  if (PIXEL.test(email.htmlBody) || bodyHosts.some((h) => TRACKING_HOSTS.some((t) => hostMatches(h, t)))) {
    weights.push(0.2);
    signals.push('open-tracking pixel');
  }

  const text = `${email.subject}\n${email.plainBody.slice(0, 4000)}`;
  const seen = new Set<string>();
  for (const p of PHRASES) {
    const target = p.label.startsWith('subject:') ? email.subject : text;
    if (!seen.has(p.label) && p.re.test(target)) {
      seen.add(p.label);
      weights.push(p.w);
      signals.push(p.label);
      if (p.cat) bump(p.cat, p.w);
    }
  }

  // Sender followed up on their own unanswered email.
  if (email.threadMessageCount >= 2) {
    weights.push(0.35);
    signals.push('multiple unanswered messages from sender');
    bump('fake_followup', 0.35);
  }

  let category: Category = 'not_cold';
  let best = 0;
  for (const [cat, w] of catWeight) if (w > best) [best, category] = [w, cat];

  const score = Math.min(0.99, combine(weights));
  return { score, signals, category: score > 0 ? category : 'not_cold' };
}
