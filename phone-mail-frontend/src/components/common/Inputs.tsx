import {
  forwardRef,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { cn } from '../../utils/cn';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leadingIcon?: React.ReactNode;
}

/** Floating-free labeled text field, used for name/subject/search-style forms. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, leadingIcon, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex h-14 items-center gap-3 rounded-2xl border bg-white px-4 transition-colors duration-150',
          error
            ? 'border-rose-400 ring-1 ring-rose-100'
            : 'border-slate-200 focus-within:border-[#1a66ff] focus-within:ring-1 focus-within:ring-blue-100',
        )}
      >
        {leadingIcon}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400',
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
});

interface PhoneFieldProps {
  value: string; // raw digits, no spaces
  onChange: (digits: string) => void;
  error?: string;
  autoFocus?: boolean;
}

/** +91 prefixed phone number input; formats "98765 43210" while typing. */
export function PhoneField({ value, onChange, error, autoFocus }: PhoneFieldProps) {
  const grouped = value.length > 5 ? `${value.slice(0, 5)} ${value.slice(5)}` : value;

  return (
    <div className="w-full">
      <div
        className={cn(
          'flex h-14 items-center gap-2.5 rounded-2xl border bg-white pl-4 pr-3 transition-colors duration-150',
          error
            ? 'border-rose-400 ring-1 ring-rose-100'
            : 'border-slate-200 focus-within:border-[#1a66ff] focus-within:ring-1 focus-within:ring-blue-100',
        )}
      >
        <span className="text-[15px] font-medium text-slate-500">+91</span>
        <span className="h-6 w-px bg-slate-200" />
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          value={grouped}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="98765 43210"
          className="min-w-0 flex-1 bg-transparent text-[15px] tracking-wide text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

interface OtpFieldProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
}

/** Six individual boxes that behave like one field — type, paste, backspace across boxes. */
export function OtpField({ length = 6, value, onChange, onComplete, error, autoFocus }: OtpFieldProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char;
    const joined = next.join('').slice(0, length);
    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  };

  const handleChange = (index: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1);
    setAt(index, char);
    if (char && index < length - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setAt(index - 1, '');
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) inputsRef.current[index + 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    if (pasted.length === length) onComplete?.(pasted);
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div>
      <div className={cn('flex gap-2.5', error && 'anim-shake')}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            autoFocus={autoFocus && i === 0}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={cn(
              'h-14 w-12 rounded-2xl border text-center text-xl font-semibold text-slate-900 outline-none transition-all duration-150 sm:w-14',
              error
                ? 'border-rose-400 ring-1 ring-rose-100'
                : d
                  ? 'border-[#1a66ff] ring-1 ring-blue-100'
                  : 'border-slate-200 focus:border-[#1a66ff] focus:ring-1 focus:ring-blue-100',
            )}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [pulse, setPulse] = useState(false);
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600">
      <span className="relative mt-0.5 inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked);
            setPulse(true);
            setTimeout(() => setPulse(false), 200);
          }}
          className="peer sr-only"
        />
        <span
          className={cn(
            'grid size-5 place-items-center rounded-md border-2 border-slate-300 transition-all duration-150 peer-checked:border-[#1a66ff] peer-checked:bg-[#1a66ff]',
            pulse && 'scale-110',
          )}
        >
          <svg viewBox="0 0 16 16" className="size-3 fill-none stroke-white opacity-0 transition-opacity peer-checked:opacity-100" style={{ opacity: checked ? 1 : 0 }}>
            <path d="M3 8.5 6.5 12 13 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span>{children}</span>
    </label>
  );
}
