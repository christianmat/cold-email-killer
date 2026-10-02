/** Parse `"Jane Doe" <jane@x.com>` / `jane@x.com` into parts. */
export function parseAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const e = raw.match(/[^\s<>"]+@[^\s<>"]+/);
  return { name: '', email: (e ? e[0] : raw).trim().toLowerCase() };
}

/** Parse the header block of a raw RFC 822 message. Lowercased names, first occurrence wins,
 *  except `received`, whose values are all joined (sending infrastructure shows up there). */
export function parseHeaders(raw: string): Record<string, string> {
  const end = raw.search(/\r?\n\r?\n/);
  const block = (end >= 0 ? raw.slice(0, end) : raw).slice(0, 64_000);
  const lines = block.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n');
  const out: Record<string, string> = {};
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (name === 'received') out.received = out.received ? `${out.received}\n${value}` : value;
    else if (!(name in out)) out[name] = value;
  }
  return out;
}

/**
 * Google Groups (and some aliases) may rewrite From to the group address, e.g.
 * "'Jane' via Support <support@yourco.com>". Recover the real sender so the
 * "same domain as you" check doesn't wave the email through.
 */
export function resolveSender(
  from: { name: string; email: string },
  headers: Record<string, string>,
): { name: string; email: string } {
  const original = headers['x-original-sender'] ?? headers['x-original-from'];
  if (original) {
    const o = parseAddress(original);
    if (o.email.includes('@')) return { name: from.name.replace(/\s+via\s+.*$/i, '') || o.name, email: o.email };
  }
  if (/\svia\s/i.test(from.name) && headers['reply-to']) {
    const r = parseAddress(headers['reply-to']);
    if (r.email.includes('@') && r.email !== from.email) return { name: from.name.replace(/\s+via\s+.*$/i, ''), email: r.email };
  }
  return from;
}

export function isCalendarInvite(raw: string): boolean {
  return /content-type:\s*text\/calendar/i.test(raw) || /\bmethod=(request|publish)\b/i.test(raw);
}
