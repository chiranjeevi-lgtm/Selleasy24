/**
 * Shared form primitives.
 *
 * Every input is a real label wrapping a real control — no placeholder-as-label,
 * which disappears the moment someone starts typing and leaves screen-reader
 * users with an unnamed field.
 */

/**
 * `bg-surface`, not `bg-canvas`: the page background is canvas, so a
 * canvas-coloured input has nothing but a hairline separating it from the page
 * and reads as flat text rather than something you can type into.
 *
 * The focus ring is a real ring rather than only a border colour change — a
 * 1px border shifting shade is not a visible enough focus indicator to rely on
 * for keyboard users.
 */
const inputClass =
  'mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-action focus:ring-2 focus:ring-action/15';

const labelClass = 'block text-[0.8125rem] font-medium text-ink';

const invalidClass = 'border-seal focus:border-seal focus:ring-seal/15';

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
      <label htmlFor={name} className={labelClass}>
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
        <p id={`${name}-hint`} className="mt-1 text-[0.6875rem] text-faint">
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
      <label htmlFor={name} className={labelClass}>
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
        <p id={`${name}-hint`} className="mt-1 text-[0.6875rem] text-faint">
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
      <label htmlFor={name} className={labelClass}>
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
        <p id={`${name}-hint`} className="mt-1 text-[0.6875rem] text-faint">
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

/**
 * Chip selectors.
 *
 * Both are real `<input type="radio">` / `<input type="checkbox">` elements,
 * visually hidden and styled through the adjacent label. That keeps keyboard
 * behaviour, arrow-key group navigation and screen-reader semantics exactly as
 * the browser provides them — a div-with-onClick chip looks identical and has
 * none of it.
 */
const chipBase =
  'cursor-pointer select-none rounded-control border px-3 py-1.5 text-[0.8125rem] transition-colors';
const chipOff = 'border-line text-muted hover:border-muted hover:text-ink';
// `peer-focus-visible` mirrors the focus ring onto the label, since the input
// itself is off-screen and its own ring would never be seen.
const chipOn = 'peer-checked:border-action peer-checked:bg-action peer-checked:text-white';
const chipFocus = 'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-action';

export interface ChipOption {
  value: string;
  label: string;
}

export function ChipRadioGroup({
  name,
  legend,
  options,
  defaultValue,
  hint,
  error,
  required,
}: {
  name: string;
  legend: string;
  options: readonly ChipOption[];
  defaultValue?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <div key={option.value}>
            <input
              type="radio"
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              required={required}
              className="peer sr-only"
            />
            <label
              htmlFor={`${name}-${option.value}`}
              className={`${chipBase} ${chipOff} ${chipOn} ${chipFocus} inline-block`}
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-[0.6875rem] text-faint">{hint}</p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-[0.6875rem] text-seal">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function ChipCheckboxGroup({
  name,
  legend,
  options,
  defaultValues = [],
  hint,
}: {
  name: string;
  legend: string;
  options: readonly ChipOption[];
  defaultValues?: readonly string[];
  hint?: string;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <div key={option.value}>
            <input
              type="checkbox"
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              defaultChecked={defaultValues.includes(option.value)}
              className="peer sr-only"
            />
            <label
              htmlFor={`${name}-${option.value}`}
              className={`${chipBase} ${chipOff} ${chipOn} ${chipFocus} inline-block`}
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-[0.6875rem] text-faint">{hint}</p>}
    </fieldset>
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
      ? 'bg-action text-surface hover:bg-action-hover'
      : 'border border-line text-ink hover:border-muted';

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
    <div role="alert" className="border-l-2 border-seal bg-seal-soft px-3 py-2">
      <p className="text-[0.8125rem] text-ink">{message}</p>
    </div>
  );
}
