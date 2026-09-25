import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] text-white shadow-md shadow-blue-600/25 hover:shadow-lg hover:shadow-blue-600/30 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none',
  secondary:
    'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50',
  ghost: 'text-[#1a66ff] hover:bg-blue-50 active:scale-[0.98] disabled:opacity-50',
  danger:
    'bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-[0.98] disabled:opacity-50',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-xl gap-1.5',
  md: 'h-12 px-5 text-[15px] rounded-2xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2',
};

/** The one button component for the whole app — primary CTA, secondary, ghost icon-links, danger. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

const ICON_SIZES = { sm: 'size-8', md: 'size-10', lg: 'size-12' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'md', active, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-slate-600 transition-all duration-150 hover:bg-slate-200/70 active:scale-90',
        ICON_SIZES[size],
        active && 'bg-blue-50 text-[#1a66ff]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
