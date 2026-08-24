import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = {
  title: 'Forgot your password',
  description: 'Get a link to set a new password.',
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
        Forgot your password?
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
        Tell us your email address and we will send you a link to set a new one.
      </p>

      <div className="mt-7">
        <ForgotForm />
      </div>

      <p className="mt-6 text-[0.875rem] text-muted">
        Remembered it?{' '}
        <Link href="/login" className="text-action underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
