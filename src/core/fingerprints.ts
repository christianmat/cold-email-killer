/**
 * Domains used by cold-outreach / sales-engagement tools. Matched against raw headers
 * (Message-ID, X-Mailer, Received, List-Unsubscribe, ...) and link/image hosts in the body.
 * weight ~1 = only used for cold outreach; lower = also used for legit 1:1 email.
 */
export interface Fingerprint {
  tool: string;
  domains: string[];
  weight: number;
}

export const FINGERPRINTS: Fingerprint[] = [
  { tool: 'Apollo', domains: ['apollo.io', 'apolloio.com', 'apollo-mail.com'], weight: 0.97 },
  { tool: 'Outreach', domains: ['outreach.io', 'outrch.com'], weight: 0.97 },
  { tool: 'Salesloft', domains: ['salesloft.com', 'sloft.io'], weight: 0.97 },
  { tool: 'Lemlist', domains: ['lemlist.com', 'lemlist.io', 'lmlst.com'], weight: 0.97 },
  { tool: 'Instantly', domains: ['instantly.ai', 'instantlymail.com'], weight: 0.97 },
  { tool: 'Smartlead', domains: ['smartlead.ai', 'smartlead.io'], weight: 0.97 },
  { tool: 'Reply.io', domains: ['reply.io'], weight: 0.97 },
  { tool: 'Mailshake', domains: ['mailshake.com'], weight: 0.97 },
  { tool: 'Woodpecker', domains: ['woodpecker.co'], weight: 0.97 },
  { tool: 'Klenty', domains: ['klenty.com', 'klenty.co'], weight: 0.97 },
  { tool: 'Saleshandy', domains: ['saleshandy.com'], weight: 0.97 },
  { tool: 'QuickMail', domains: ['quickmail.io', 'quickmail.com'], weight: 0.97 },
  { tool: 'Amplemarket', domains: ['amplemarket.com'], weight: 0.97 },
  { tool: 'Lavender', domains: ['lavender.ai'], weight: 0.6 },
  { tool: 'Gem', domains: ['gem.com'], weight: 0.7 },
  { tool: 'HubSpot Sales', domains: ['hubspotemail.net', 'sidekickopen', 'hs-sales-engage'], weight: 0.6 },
  { tool: 'Yesware', domains: ['yesware.com'], weight: 0.5 },
  { tool: 'Mixmax', domains: ['mixmax.com', 'mixmax.io'], weight: 0.5 },
  { tool: 'Calendly link', domains: ['calendly.com'], weight: 0.25 },
  { tool: 'Chili Piper link', domains: ['chilipiper.com'], weight: 0.3 },
];

/** Known 1x1 tracking-pixel / open-tracking hosts (not tool-specific). */
export const TRACKING_HOSTS = [
  'mailtrack.io',
  'mailsuite.com',
  'streak.com',
  'mltrk.io',
  'getnotify.com',
  'track.hubspot.com',
  'superhuman.com',
];
