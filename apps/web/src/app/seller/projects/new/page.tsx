import Link from 'next/link';
import { serverApi } from '@/lib/server-api';
import { NewProjectForm } from './new-project-form';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const localities = await serverApi.localities();

  return (
    <div className="max-w-2xl">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.8125rem]">
        <Link href="/seller/projects" className="text-muted transition-colors hover:text-ink">
          Projects
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">New</span>
      </nav>

      <h2 className="font-display text-[1.375rem] font-extrabold tracking-tight text-ink">
        Add a project
      </h2>
      <p className="mt-2 max-w-prose text-[0.875rem] leading-relaxed text-muted">
        This first step is the project itself. Once it is saved you add the
        configurations, photographs and the statutory documents, then send it for
        verification.
      </p>

      <div className="mt-7">
        <NewProjectForm localities={localities} />
      </div>
    </div>
  );
}
