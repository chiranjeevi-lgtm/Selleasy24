import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <div className="mx-auto max-w-sm px-5 py-20">
      <p className="stamp-label text-seal">Kamala Infra — internal</p>
      <h1 className="mt-3 font-display text-[1.625rem] font-extrabold leading-tight tracking-tight text-ink">
        Verification console
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-graphite">
        Staff access only. Every document you open is recorded against your
        account.
      </p>

      {/*
        Says which account is wrong, not just that something failed. Someone who
        signed in with their seller account otherwise has no way to tell why the
        console refused them.
      */}
      {error === 'staff-only' && (
        <p
          role="alert"
          className="mt-5 border-l-2 border-seal bg-seal-wash px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink"
        >
          That account is not a verification officer. Sign in with your staff
          account — a buyer or seller account cannot review listings, even its
          owner&rsquo;s own.
        </p>
      )}

      <div className="mt-7">
        <LoginForm />
      </div>
    </div>
  );
}
