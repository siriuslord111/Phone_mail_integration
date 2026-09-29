import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageProvider';
import { getTermsDocument, TERMS_PROJECT_URL } from '../../utils/terms';

interface TermsDialogProps {
  onClose: () => void;
}

export function TermsDialog({ onClose }: TermsDialogProps) {
  const { language, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const terms = getTermsDocument(language);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phonemail-terms-title"
        className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:w-[90vw] sm:max-w-6xl sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="phonemail-terms-title" className="text-lg font-semibold text-slate-900">
              {terms.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{terms.effectiveDate}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-w-0 overflow-x-hidden overflow-y-auto px-5 py-5 text-sm leading-6 text-slate-700 sm:px-8 sm:py-7">
          <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            {terms.notice}
          </p>

          <h3 className="font-semibold text-slate-900">{terms.operatorHeading}</h3>
          <p className="mt-1">{terms.operatorBody}</p>

          <h3 className="mt-5 font-semibold text-slate-900">{terms.contactHeading}</h3>
          <p className="mt-1">
            {terms.contactBody}{' '}
            <a
              href={TERMS_PROJECT_URL}
              target="_blank"
              rel="noreferrer"
              className="break-all font-medium text-[#1a66ff] underline underline-offset-2"
            >
              {TERMS_PROJECT_URL}
            </a>
          </p>

          {terms.sections.map((section) => (
            <section key={section.heading} className="mt-5">
              <h3 className="font-semibold text-slate-900">{section.heading}</h3>
              <p className="mt-1">{section.body}</p>
            </section>
          ))}

          <section className="mt-5">
            <h3 className="font-semibold text-slate-900">{terms.lawHeading}</h3>
            <p className="mt-1">{terms.lawBody}</p>
          </section>
        </div>

        <footer className="shrink-0 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[#1a66ff] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0b4fe0]"
          >
            {t('close')}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
