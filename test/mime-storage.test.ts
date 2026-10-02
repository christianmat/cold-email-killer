import { describe, expect, it } from 'vitest';
import { isCalendarInvite, parseAddress, parseHeaders } from '../src/core/mime';
import { MemoryKV, readJSON, writeJSON } from '../src/core/storage';

describe('mime', () => {
  it('parses addresses', () => {
    expect(parseAddress('"Jane Doe" <Jane@X.com>')).toEqual({ name: 'Jane Doe', email: 'jane@x.com' });
    expect(parseAddress('Jane <jane@x.com>')).toEqual({ name: 'Jane', email: 'jane@x.com' });
    expect(parseAddress('jane@x.com')).toEqual({ name: '', email: 'jane@x.com' });
  });

  it('parses headers with folding and joins Received', () => {
    const raw = 'Received: from a.instantlymail.com\r\nReceived: from b.google.com\r\nX-Mailer: Out\r\n reach\r\nSubject: Hi\r\n\r\nbody: not a header';
    const h = parseHeaders(raw);
    expect(h['x-mailer']).toBe('Out reach');
    expect(h.received).toContain('instantlymail');
    expect(h.received).toContain('b.google.com');
    expect(h.body).toBeUndefined();
  });

  it('detects calendar invites', () => {
    expect(isCalendarInvite('Content-Type: text/calendar; method=REQUEST')).toBe(true);
    expect(isCalendarInvite('Content-Type: text/plain')).toBe(false);
  });
});

describe('storage', () => {
  it('round-trips small and chunked values and cleans up old chunks', () => {
    const kv = new MemoryKV();
    const big = Array.from({ length: 3000 }, (_, i) => `item-${i}`);
    writeJSON(kv, 'k', big);
    expect(kv.get('k#n')).not.toBeNull();
    expect(readJSON(kv, 'k', [])).toEqual(big);
    writeJSON(kv, 'k', ['small']);
    expect(readJSON(kv, 'k', [])).toEqual(['small']);
    expect([...kv.map.keys()]).toEqual(['k']);
  });

  it('returns fallback on missing or corrupt data', () => {
    const kv = new MemoryKV();
    expect(readJSON(kv, 'nope', 42)).toBe(42);
    kv.set('bad', '{');
    expect(readJSON(kv, 'bad', 'fb')).toBe('fb');
  });
});
