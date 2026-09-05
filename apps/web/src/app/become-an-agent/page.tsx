import type { Metadata } from 'next';
import Link from 'next/link';
import { AgentRegistrationForm } from '@/components/agent-registration-form';

export const metadata: Metadata = {
  title: 'Become a SellEasy24 agent · Field-agent-assisted listings',
  description:
    'Help property owners list their homes on SellEasy24. Visit properties, capture photos, collect documents, and earn commission on every listing that goes live.',
};

/**
 * SellEasy Agent — public registration + info page.
 *
 * The Field Agent programme lets owners who can't or don't want to list
 * their own property request an agent to do it on their behalf. Agents
 * visit the property, capture photos and documents, submit for
 * verification, and earn commission when the listing goes live.
 *
 * The application form on this page is also the applicant's signup: on
 * submit the backend creates their `User` (role = AGENT_APPLICANT) and
 * `FieldAgent` (status = PENDING) in one transaction and issues a
 * session. They land on /agent/pending signed in, and can return to that
 * page any time to check their status.
 */

interface Card {
  label: string;
  title: string;
  body: string;
}

const HOW_IT_WORKS: Card[] = [
  {
    label: 'Step 1',
    title: 'Apply and get verified',
    body: 'Complete the application below. We verify your Aadhaar, PAN, and background before activating your agent account. Typical turnaround: 5 business days.',
  },
  {
    label: 'Step 2',
    title: 'Complete the training',
    body: 'A two-hour online module on the platform, listing quality standards, RERA basics, and the SellEasy24 code of conduct. Ends with a 20-question certification test.',
  },
  {
    label: 'Step 3',
    title: 'Claim assistance requests',
    body: 'Owners in your service localities request help via SellEasy24. Requests appear in your dashboard queue; first come, first served with a 24-hour claim window.',
  },
  {
    label: 'Step 4',
    title: 'Visit the property',
    body: 'Meet the owner, capture 10–15 quality photos, collect the required documents (deed, EC, tax receipts), and confirm the structured details.',
  },
  {
    label: 'Step 5',
    title: 'Submit the listing',
    body: 'Upload everything through the agent app. A SellEasy24 verification officer reviews it. The owner approves before it goes live.',
  },
  {
    label: 'Step 6',
    title: 'Earn commission',
    body: 'You are paid a flat fee (₹1,500–₹2,500) per listing that goes live, plus an optional performance bonus if the listing closes on the platform. Payouts are weekly, deducted TDS included.',
  },
];

interface Requirement {
  title: string;
  body: string;
}

const REQUIREMENTS: Requirement[] = [
  {
    title: 'Documents required at registration',
    body: 'Aadhaar (masked), PAN card, one profile photograph, and a short bio. Background check runs against public records.',
  },
  {
    title: 'Own transport',
    body: 'A two-wheeler or car — you will be visiting 5–10 properties per week across your chosen localities. Travel allowance is included in the per-listing fee.',
  },
  {
    title: 'Smartphone with a decent camera',
    body: 'A phone that can take 12MP+ photos and connect to 4G is enough. The agent app runs on Android 10+ and iOS 15+.',
  },
  {
    title: 'Local language',
    body: 'Fluent Telugu is essential. English + Hindi is a plus but not required.',
  },
];

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'Am I a SellEasy24 employee?',
    a: 'No. Field agents are independent contractors. You choose which assignments to claim, how many hours to work, and which localities to service. SellEasy24 provides the platform, the training, and the leads.',
  },
  {
    q: 'How much can I earn?',
    a: 'A typical active agent completes 5–10 assignments per week at ₹1,500–2,500 per listing = ₹30,000–100,000/month. Performance bonuses on closed transactions can add ₹5,000–15,000 per closure.',
  },
  {
    q: 'What if a listing does not go live?',
    a: 'If verification rejects a listing for reasons beyond your control (owner-provided documents were incomplete, RERA number invalid), you receive a smaller review fee of ₹500. If the rejection is because of listing quality (bad photos, missing details), no fee is paid — resubmission is your responsibility.',
  },
  {
    q: 'Can I refuse an assignment?',
    a: 'Yes, before you claim it. Once claimed, you have 48 hours to complete the visit or release the assignment back into the queue. Repeated release without cause affects your priority ranking.',
  },
  {
    q: 'What happens if I misbehave with an owner?',
    a: 'Owners rate every agent after the visit. Sustained low ratings, or any single confirmed complaint about misconduct, results in immediate suspension. Fraud, misrepresentation, or asking for payment outside the platform is grounds for permanent removal and reporting to the police.',
  },
];

export default function BecomeAgentPage() {
  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-3xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Become a SellEasy24 field agent
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Help homeowners who can&rsquo;t or don&rsquo;t want to list their
          own property. Visit the property, capture photos and documents,
          list on the owner&rsquo;s behalf, and earn commission on every
          listing that goes live.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <a
            href="#apply"
            className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Apply below
          </a>
          <span className="text-[0.875rem] text-muted">
            Approximate earnings: ₹30,000–₹1,00,000/month for active agents
          </span>
        </div>
      </header>

      <section aria-labelledby="how-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="how-heading" className="display text-[1.625rem] text-ink">
          How the programme works
        </h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          From application to your first commission, typically inside three
          weeks.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_IT_WORKS.map((card) => (
            <li
              key={card.label}
              className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line"
            >
              <p className="label text-verify">{card.label}</p>
              <h3 className="mt-2 display text-[1.125rem] text-ink">
                {card.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
                {card.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="req-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="req-heading" className="display text-[1.625rem] text-ink">
          What you need to start
        </h2>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {REQUIREMENTS.map((req) => (
            <li key={req.title} className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
              <p className="text-[1rem] font-semibold text-ink">{req.title}</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                {req.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="conduct-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10"
      >
        <p className="label text-verify-ink">Code of conduct</p>
        <h2 id="conduct-heading" className="mt-3 display text-[1.375rem] text-ink">
          What SellEasy24 agents never do
        </h2>
        <ul className="mt-4 space-y-2.5 text-[0.9375rem] text-ink/85">
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal" />
            Ask an owner for cash payment. All fees flow through the
            platform.
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal" />
            Promise a specific sale price, a specific number of enquiries,
            or a specific time-to-sale.
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal" />
            Handle or hold the owner&rsquo;s original documents. Photograph
            them; return them.
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal" />
            Contact the owner outside the platform to pitch other services
            or transactions.
          </li>
        </ul>
      </section>

      <section id="apply" aria-labelledby="apply-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="apply-heading" className="display text-[1.625rem] text-ink">
          Apply to become an agent
        </h2>
        <p className="mt-2 max-w-2xl text-[0.9375rem] text-muted">
          Fill in the details below. We&rsquo;ll email you within 3 business
          days with the next steps — background check, training, activation.
        </p>

        <div className="mt-8">
          <AgentRegistrationForm />
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="faq-heading" className="display text-[1.5rem] text-ink">
          Common questions
        </h2>

        <dl className="mt-6 divide-y divide-line-soft">
          {FAQS.map((faq) => (
            <div key={faq.q} className="py-5">
              <dt className="text-[1rem] font-semibold text-ink">{faq.q}</dt>
              <dd className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                {faq.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="close-heading"
        className="mt-16 rounded-card bg-action p-8 text-white sm:p-10"
      >
        <h2 id="close-heading" className="display text-[1.5rem] text-white">
          Not an agent — a seller instead?
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
          If you have your own property to list, head to the seller flow —
          you can request agent help there too.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/sell"
            className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Sell your property
          </Link>
          <Link
            href="/"
            className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            Browse homes
          </Link>
        </div>
      </section>
    </div>
  );
}
