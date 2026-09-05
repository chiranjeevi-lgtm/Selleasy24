import type { Metadata } from 'next';
import Link from 'next/link';
import { posts } from './posts';

export const metadata: Metadata = {
  title: 'Notes on buying and verifying homes',
  description:
    'Plain writing on what verification checks, how RERA registration works, and what to expect when buying in Telangana.',
};

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function BlogIndexPage() {
  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Notes on buying and verifying homes
        </h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted">
          Short pieces from the SellEasy24 editorial desk on the paperwork
          behind a purchase, the regulator&rsquo;s role, and what to expect in
          Telangana&rsquo;s residential market.
        </p>
      </header>

      {featured && (
        <section aria-label="Featured post" className="mt-12">
          <Link
            href={`/blog/${featured.slug}`}
            className="group grid gap-8 rounded-card bg-surface p-6 shadow-card ring-1 ring-line transition-all duration-300 hover:shadow-lift sm:p-10 lg:grid-cols-[1.35fr_1fr]"
          >
            <div>
              <span className="label text-verify">{featured.category}</span>
              <h2 className="display mt-3 text-[1.75rem] text-ink sm:text-[2.125rem]">
                {featured.title}
              </h2>
              <p className="mt-4 text-[1rem] leading-relaxed text-muted sm:text-[1.0625rem]">
                {featured.excerpt}
              </p>
              <p className="mt-6 flex items-center gap-2 text-[0.875rem] text-faint">
                <span>{dateFormat.format(new Date(featured.publishedAt))}</span>
                <span aria-hidden="true">·</span>
                <span>{featured.readMinutes} min read</span>
              </p>
            </div>

            <div
              aria-hidden="true"
              className="relative hidden overflow-hidden rounded-[12px] bg-canvas-deep lg:block"
            >
              {/* A quiet placeholder rather than a stock photograph. The gold
                  rule reads as an editorial mark; the deep-navy field reads as
                  the header treatment used elsewhere on the site. */}
              <div className="absolute inset-0 bg-gradient-to-br from-action via-action to-verify-ink" />
              <span className="absolute left-6 top-6 h-[3px] w-10 bg-verify" />
              <span className="absolute bottom-6 left-6 right-6 display text-[1.375rem] text-white/85">
                Featured
              </span>
            </div>
          </Link>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="More posts" className="mt-16">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 className="display text-[1.625rem] text-ink">More reading</h2>

          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex h-full flex-col rounded-card bg-surface p-6 shadow-card ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="label text-verify">{post.category}</span>
                  <h3 className="display mt-3 text-[1.25rem] text-ink">
                    {post.title}
                  </h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
                    {post.excerpt}
                  </p>
                  <p className="mt-auto flex items-center gap-2 pt-6 text-[0.8125rem] text-faint">
                    <span>{dateFormat.format(new Date(post.publishedAt))}</span>
                    <span aria-hidden="true">·</span>
                    <span>{post.readMinutes} min read</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
