/**
 * Shared form primitives.
 *
 * Every input is a real label wrapping a real control — no placeholder-as-label,
 * which disappears the moment someone starts typing and leaves screen-reader
 * users with an unnamed field.
 */

const inputClass =
  'mt-1 w-full border border-paper-edge bg-stamp px-2.5 py-2 text-[0.875rem] text-ink outline-none transition-colors focus:border-indigo';

const invalidClass = 'border-seal';

export function TextInput({
  name,
  label,
  hint,
  error,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy =
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-[0.75rem] text-graphite">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? invalidClass : ''}`}
        {...props}
      />
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1 text-[0.6875rem] text-graphite-light">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-[0.6875rem] text-seal">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectInput({
  name,
  label,
  hint,
  error,
  children,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const describedBy =
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-[0.75rem] text-graphite">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? invalidClass : ''}`}
        {...props}
      >
        {children}
      </select>
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1 text-[0.6875rem] text-graphite-light">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-[0.6875rem] text-seal">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextareaInput({
  name,
  label,
  hint,
  error,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const describedBy =
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-[0.75rem] text-graphite">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} resize-y ${error ? invalidClass : ''}`}
        {...props}
      />
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1 text-[0.6875rem] text-graphite-light">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-[0.6875rem] text-seal">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  children,
  pending,
  variant = 'primary',
}: {
  children: React.ReactNode;
  pending?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const base =
    'px-4 py-2 text-[0.875rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55';
  const styles =
    variant === 'primary'
      ? 'bg-indigo text-paper hover:bg-indigo-deep'
      : 'border border-paper-edge text-ink hover:border-graphite';

  return (
    <button type="submit" disabled={pending} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

/** Error summary above a form. Announced, and never blames the user. */
export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <div role="alert" className="border-l-2 border-seal bg-seal-wash px-3 py-2">
      <p className="text-[0.8125rem] text-ink">{message}</p>
    </div>
  );
}
