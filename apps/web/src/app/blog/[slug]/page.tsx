import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findPost, posts } from '../posts';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const related = posts
    .filter((candidate) => candidate.slug !== post.slug)
    .slice(0, 2);

  return (
    <div className="mx-auto max-w-[46rem] px-5 py-12 sm:px-8 sm:py-16">
      <nav aria-label="Breadcrumb" className="text-[0.875rem]">
        <Link
          href="/blog"
          className="text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← All posts
        </Link>
      </nav>

      <article className="mt-8">
        <header>
          <span className="label text-verify">{post.category}</span>
          <h1 className="display mt-3 text-[2rem] text-ink sm:text-[2.75rem]">
            {post.title}
          </h1>
          <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-muted">
            <span>{post.author}</span>
            <span aria-hidden="true">·</span>
            <span>{dateFormat.format(new Date(post.publishedAt))}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readMinutes} min read</span>
          </p>
        </header>

        {/* Measure kept to a single reading column deliberately — long-form
            reads better at ~65 characters than at the site's 76rem shell. */}
        <div className="mt-10 space-y-6 text-[1.0625rem] leading-[1.75] text-ink/85">
          {post.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>

      {related.length > 0 && (
        <aside className="mt-20 border-t border-line pt-10" aria-label="Related posts">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 className="display text-[1.25rem] text-ink">Keep reading</h2>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {related.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/blog/${item.slug}`}
                  className="group block rounded-card bg-surface p-5 shadow-card ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="label text-verify">{item.category}</span>
                  <p className="display mt-2 text-[1.0625rem] text-ink">
                    {item.title}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
