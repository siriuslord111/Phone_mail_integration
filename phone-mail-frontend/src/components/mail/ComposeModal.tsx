import { useEffect, useRef, useState } from 'react';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../common/Buttons';
import { deleteDraft, getDraftAttachment, listDrafts, saveDraft, sendMessage } from '../../api/email.api';
import type { MailDraft } from '../../api/email.api';
import type { Message } from '../../types';
import { digitsOnly, normalizePhone } from '../../utils/formatters';
import { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageProvider';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeLockedRecipient(recipient: string) {
  const value = recipient.trim();
  if (EMAIL_PATTERN.test(value) && !value.toLowerCase().endsWith('@phonemail.com')) {
    return value.toLowerCase();
  }
  return normalizePhone(value.replace(/@phonemail\.com$/i, ''));
}

interface ComposeModalProps {
  lockedTo?: string;
  draftId?: string;
  onClose: () => void;
  onSent: (message: Message) => void;
}

export function ComposeModal({ lockedTo, draftId, onClose, onSent }: ComposeModalProps) {
  const { t } = useLanguage();
  const [to, setTo] = useState(lockedTo ? [normalizeLockedRecipient(lockedTo)] : []);
  const [toInput, setToInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeDraftId, setActiveDraftId] = useState(draftId);
  const [savingDraft, setSavingDraft] = useState(false);
  const closeAndSaveRef = useRef<() => Promise<void>>(async () => {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    void listDrafts().then(async (drafts) => {
      const draft = drafts.find((item) => item.id === draftId);
      if (cancelled || !draft) return;
      setTo(draft.recipients);
      setSubject(draft.subject);
      setBody(draft.body);
      setActiveDraftId(draft.id);
      const restoredFiles = await Promise.all((draft.attachments ?? []).map((attachment) =>
        getDraftAttachment(draft.id, attachment.id, attachment.name, attachment.mimeType),
      ));
      if (!cancelled) setAttachments(restoredFiles);
    }).catch((loadError) => {
      if (!cancelled) setError(getErrorMessage(loadError, t('couldNotLoadDraft')));
    });
    return () => { cancelled = true; };
  }, [draftId, t]);

  const persistDraft = async (): Promise<MailDraft | undefined> => {
    if (to.length === 0 && !subject.trim() && !body.trim() && attachments.length === 0) return undefined;
    setSavingDraft(true);
    setError('');
    try {
      const draft = await saveDraft({
        id: activeDraftId,
        recipients: to,
        subject,
        body,
        files: attachments,
      });
      setActiveDraftId(draft.id);
      return draft;
    } catch (saveError) {
      setError(getErrorMessage(saveError, t('couldNotSaveDraft')));
      return undefined;
    } finally {
      setSavingDraft(false);
    }
  };

  const closeAndSave = async () => {
    if (await persistDraft() || (to.length === 0 && !subject.trim() && !body.trim() && attachments.length === 0)) onClose();
  };
  closeAndSaveRef.current = closeAndSave;

  const discardDraft = async () => {
    const hasContent = Boolean(activeDraftId || to.length || subject.trim() || body.trim() || attachments.length);
    if (hasContent && !window.confirm(t('discardDraftConfirm'))) return;
    if (activeDraftId) {
      try {
        await deleteDraft(activeDraftId);
      } catch (discardError) {
        setError(getErrorMessage(discardError, t('couldNotDiscardDraft')));
        return;
      }
    }
    onClose();
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void closeAndSaveRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  const inputDigits = digitsOnly(toInput);
  const canAddPhone = inputDigits.length === 10 && /^\+?[\d\s()-]+$/.test(toInput);
  const canAddEmail = EMAIL_PATTERN.test(toInput.trim());
  const canAddRecipient = canAddPhone || canAddEmail;

  const addRecipient = () => {
    if (!canAddRecipient) {
      setError(t('invalidRecipient'));
      return;
    }
    const recipient = canAddEmail
      ? toInput.trim().toLowerCase()
      : normalizePhone(toInput);
    if (!to.includes(recipient)) setTo((prev) => [...prev, recipient]);
    setToInput('');
    setError('');
  };

  const handleSend = async () => {
    if (to.length === 0) {
      setError(t('addRecipient'));
      return;
    }
    if ((!subject.trim() || !body.trim()) && !window.confirm(t('sendWithMissingFieldsConfirm'))) {
      return;
    }
    setSending(true);
    setError('');
    try {
      const message = await sendMessage({
        to,
        subject: subject.trim() || undefined,
        body: body.trim(),
        attachments: attachments.length ? attachments : undefined,
      });
      if (activeDraftId) await deleteDraft(activeDraftId);
      onSent(message);
    } catch (sendError) {
      setError(getErrorMessage(sendError, t('couldNotSend')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex flex-col bg-white md:items-center md:justify-center md:bg-slate-900/40 md:backdrop-blur-sm">
      <div className="anim-sheet flex h-full w-full flex-col md:h-[min(82vh,800px)] md:max-h-[90vh] md:max-w-4xl md:rounded-3xl md:shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:pt-3">
          <h2 className="text-[15px] font-semibold text-slate-900">{t('newEmail')}</h2>
          <button
            onClick={() => { void closeAndSave(); }}
            aria-label={t('close')}
            className="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-0 overflow-y-auto bg-white">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm text-slate-400">{t('to')}</span>
            {to.map((recipient) => (
              <span
                key={recipient}
                className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1.5 text-sm text-[#0b4fe0]"
              >
                {recipient.includes('@') ? recipient : `${recipient}@phonemail.com`}
                {!lockedTo && (
                  <button
                    onClick={() => setTo((prev) => prev.filter((entry) => entry !== recipient))}
                    aria-label={`${t('removeRecipient')} ${recipient}`}
                    className="grid size-4 place-items-center rounded-full hover:bg-blue-100"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            ))}
            {!lockedTo && (canAddRecipient ? (
              <span className="flex items-center gap-1 rounded-full bg-slate-50 py-1 pl-2.5 pr-1 text-sm text-slate-600">
                {canAddEmail ? toInput.trim() : `${inputDigits}@phonemail.com`}
                <button
                  onClick={addRecipient}
                  aria-label={`${t('add')} ${canAddEmail ? toInput.trim() : `${inputDigits}@phonemail.com`}`}
                  className="grid size-7 place-items-center rounded-full bg-[#1a66ff] text-white transition hover:bg-[#0b4fe0]"
                >
                  <Plus className="size-4" />
                </button>
              </span>
            ) : (
              <input
                value={toInput}
                onChange={(event) => {
                  setToInput(event.target.value.slice(0, 254));
                  setError('');
                }}
                onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addRecipient())}
                placeholder={t('emailOrPhonePlaceholder')}
                inputMode="email"
                className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            ))}
          </div>

          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={t('subject')}
            className="w-full border-b border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('writeMessagePlaceholder')}
            rows={10}
            className="w-full resize-none px-4 py-3 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files ?? []);
              const oversized = selected.find((file) => file.size > 10 * 1024 * 1024);
              if (oversized) {
                setError(`${oversized.name} ${t('attachmentSizeLimit')}`);
              } else if (attachments.length + selected.length > 5) {
                setError(t('attachmentLimit'));
              } else {
                setAttachments((previous) => [...previous, ...selected]);
                setError('');
              }
              event.currentTarget.value = '';
            }}
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {attachments.map((file, index) => (
                <span key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-2.5 pr-1.5 text-xs text-slate-600">
                  <Paperclip className="size-3 shrink-0" />
                  <span className="max-w-[12rem] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label={`${t('removeRecipient')} ${file.name}`}
                    className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-slate-200"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <p role="alert" className="px-4 pb-2 text-sm text-rose-600">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <button
            onClick={() => { void discardDraft(); }}
            aria-label={t('discard')}
            className="grid size-10 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <Button
              disabled={savingDraft || sending}
              onClick={() => fileInputRef.current?.click()}
              variant="secondary"
              aria-label={t('attachFile')}
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              disabled={savingDraft || sending}
              onClick={() => { void persistDraft(); }}
              variant="secondary"
            >
              {t('saveDraft')}
            </Button>
            <Button loading={sending} onClick={handleSend}>{t('send')}</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
