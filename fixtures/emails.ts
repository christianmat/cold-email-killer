// Anonymized, representative inbox emails. `cold` = ground truth.
import type { Email } from '../src/core/types';

export interface Fixture {
  name: string;
  cold: boolean;
  email: Email;
}

let n = 0;
export function mk(p: Partial<Email>): Email {
  n++;
  return {
    threadId: `t${n}`,
    messageId: `m${n}`,
    fromName: 'Sender',
    fromEmail: `sender${n}@example.com`,
    subject: '',
    plainBody: '',
    htmlBody: '',
    headers: {},
    userInThread: false,
    isCalendarInvite: false,
    threadMessageCount: 1,
    ...p,
  };
}

export const FIXTURES: Fixture[] = [
  // ---------- Cold ----------
  {
    name: 'apollo quick question',
    cold: true,
    email: mk({
      fromName: 'Tyler Brooks', fromEmail: 'tyler@pipelinehq.co', subject: 'Quick question',
      plainBody: "Hi Sam,\n\nI saw that you're hiring engineers. We help SaaS companies like yours cut onboarding time by 40%.\n\nWorth a 15 minute chat next week?\n\nTyler",
      headers: { 'message-id': '<abc123@mail.apollo.io>' },
    }),
  },
  {
    name: 'lemlist tracked link',
    cold: true,
    email: mk({
      fromEmail: 'sara@growthlabs.io', subject: 'Idea for Acme',
      plainBody: 'Hey Sam, loved what you are building. We help startups turn product tours into pipeline. Open to a quick call?',
      htmlBody: '<p>Hey Sam</p><a href="https://track.lemlist.com/abc">see how</a>',
    }),
  },
  {
    name: 'instantly bump',
    cold: true,
    email: mk({
      fromEmail: 'mike@devshop.agency', subject: 'Re: dev capacity',
      plainBody: 'Just bumping this to the top of your inbox. Did you see my last email?',
      headers: { received: 'from mx1.instantlymail.com by mx.google.com' }, threadMessageCount: 3,
    }),
  },
  {
    name: 'offshore agency no tool',
    cold: true,
    email: mk({
      fromEmail: 'raj@codecraft-solutions.com', subject: 'Dedicated dev team for Acme',
      plainBody: 'Hello,\n\nWe are a white-label development company. We provide a dedicated development team at 1/3 the cost. We help startups ship faster.\n\nCan we book a call this week?\n\nIf you are not the right person, please point me to who is.',
    }),
  },
  {
    name: 'seo link spam',
    cold: true,
    email: mk({
      fromEmail: 'outreach.team@gmail.com', subject: 'Guest post collaboration',
      plainBody: 'Hi, I would love to contribute a guest post to your blog. In exchange we can offer a backlink from our DA 60 site. Let me know!',
    }),
  },
  {
    name: 'recruiter talent pitch',
    cold: true,
    email: mk({
      fromEmail: 'nina@toptalentbridge.com', subject: 'Hire senior engineers in 2 weeks',
      plainBody: 'Hi Sam, we help founders hire pre-vetted engineers from LATAM in under two weeks. Open to a 15 min call this week? Reply "no" if you prefer not to hear from me.',
    }),
  },
  {
    name: 'fake follow-up no tool',
    cold: true,
    email: mk({
      fromEmail: 'jordan@salesboost.io', subject: 'Following up',
      plainBody: "Hi Sam, following up on my previous note. I didn't hear back - who's the right person to talk to about outbound at Acme?",
      threadMessageCount: 2,
    }),
  },
  {
    name: 'outreach.io headers',
    cold: true,
    email: mk({
      fromEmail: 'brian@datavendor.com', subject: 'Acme + DataVendor',
      plainBody: 'Sam - noticed Acme is growing fast. Teams like yours use us to enrich leads.',
      headers: { 'x-mailer': 'Outreach', 'message-id': '<1234.abc@outreach.io>' },
    }),
  },
  {
    name: 'subtle personalised pitch (LLM territory)',
    cold: true,
    email: mk({
      fromEmail: 'ava@hiringstack.com', subject: 'Congrats on the launch',
      plainBody: 'Sam, congrats on the launch last week. Curious how you are thinking about scaling support - we have been helping a few YC companies with exactly that. Any interest?',
    }),
  },

  {
    name: 'API reseller sponsorship via your support@ group',
    cold: true,
    email: mk({
      fromName: 'ByteRoute', fromEmail: 'hello@byteroute.example', subject: 'Partnership proposal for your project',
      plainBody: "Hello team,\n\nThis is Mei with ByteRoute. We offer discounted access to the major LLM APIs behind one endpoint.\n\nWe would like to sponsor your docs for a month. Proposed terms: $100 flat, or $40 fixed plus 10% of net revenue from referred users.\n\nCould you share your monthly visitors and where most of your audience is located?\n\nA free credits account is already set up for you.\n\nMei",
      headers: { 'list-id': '<support.acme.dev>', precedence: 'list', 'x-google-group-id': '123', 'mailing-list': 'list support@acme.dev; contact support+owners@acme.dev' },
    }),
  },
  {
    name: 'affiliate pitch where Groups rewrote From to your domain',
    cold: true,
    email: mk({
      fromName: 'Lena', fromEmail: 'lena@adnetwork.example', subject: 'Monetize your traffic',
      plainBody: "Hi there, I'm Lena from AdNetwork. We provide paid placement for developer tools. Would you be open to discussing a partnership? Our partners earn 30% commission on every signup.",
      headers: { 'list-id': '<hello.acme.dev>', precedence: 'list', 'x-original-sender': 'lena@adnetwork.example' },
    }),
  },

  // ---------- Not cold ----------
  {
    name: 'customer writing to your support@ group',
    cold: false,
    email: mk({
      fromEmail: 'ops@customer-two.example', subject: 'Checklist progress not saving',
      plainBody: 'Hi, since yesterday our onboarding checklist resets for some users after refresh. We are on the React SDK v2. Can you take a look?',
      headers: { 'list-id': '<support.acme.dev>', precedence: 'list', 'x-google-group-id': '123' },
    }),
  },
  {
    name: 'prospect introducing themselves with a buying question',
    cold: false,
    email: mk({
      fromEmail: 'dana@acme-retail.example', subject: 'SSO on the enterprise plan?',
      plainBody: "Hi, I'm Dana from Acme Retail. We're evaluating Acme for our onboarding and wanted to know if SSO is included on the enterprise plan for about 200 seats.",
    }),
  },
  {
    name: 'customer support question',
    cold: false,
    email: mk({
      fromEmail: 'dev@customer-co.com', subject: 'Tour not showing on staging',
      plainBody: "Hey, we installed the React SDK yesterday but the tour doesn't render on our staging env. Any idea? Thanks!",
    }),
  },
  {
    name: 'friend personal note',
    cold: false,
    email: mk({
      fromEmail: 'sam.lee@gmail.com', subject: 'dinner thursday?',
      plainBody: 'yo are you still around thursday? thinking that ramen place at 7',
    }),
  },
  {
    name: 'investor update ask',
    cold: false,
    email: mk({
      fromEmail: 'partner@vcfund.vc', subject: 'Following up from our call',
      plainBody: 'Great chatting today. As promised, here is the deck from the portfolio summit. Happy to intro you to the two founders we discussed.',
    }),
  },
  {
    name: 'intro from mutual',
    cold: false,
    email: mk({
      fromEmail: 'maria@acme.com', subject: 'Intro: Sam <> Dana',
      plainBody: "Sam, meet Dana, she leads product at Acme and asked about onboarding. Dana, Sam is the founder of Acme. I'll let you two take it from here!",
    }),
  },
  {
    name: 'user feedback',
    cold: false,
    email: mk({
      fromEmail: 'pm@bigcorp.com', subject: 'Feature request: checklist dependencies',
      plainBody: 'Love the product. Would be great if checklist steps could depend on each other. Is that on the roadmap?',
    }),
  },
  {
    name: 'superhuman personal email w/ pixel',
    cold: false,
    email: mk({
      fromEmail: 'founder@friendstartup.com', subject: 'quick favor',
      plainBody: 'Hey man, could you share the name of your accountant? Ours just quit.',
      htmlBody: '<div>Hey man</div><img src="https://r.superhuman.com/abc.gif" width="1" height="1">',
    }),
  },
  {
    name: 'newsletter (list-id)',
    cold: false,
    email: mk({
      fromEmail: 'news@substack.com', subject: 'This week in SaaS',
      plainBody: 'Worth a chat? Here are 10 SaaS trends.',
      headers: { 'list-id': '<saas.substack.com>' },
    }),
  },
  {
    name: 'calendar invite',
    cold: false,
    email: mk({ fromEmail: 'calendar-notification@google.com', subject: 'Invitation: Sync', isCalendarInvite: true }),
  },
  {
    name: 'thread you replied in',
    cold: false,
    email: mk({
      fromEmail: 'vendor@tools.com', subject: 'Re: pricing',
      plainBody: 'Worth a quick call to walk through the enterprise tier? 15 minutes next week?',
      userInThread: true,
    }),
  },
  {
    name: 'calendly from known contact flow (no other signal)',
    cold: false,
    email: mk({
      fromEmail: 'candidate@gmail.com', subject: 'Re: Acme engineering role',
      plainBody: 'Thanks for reaching out! Here is my calendly: https://calendly.com/candidate/30min',
    }),
  },
];
