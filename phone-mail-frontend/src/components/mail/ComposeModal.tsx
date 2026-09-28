import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '../common/Buttons';
import { deleteDraft, listDrafts, saveDraft, sendMessage } from '../../api/email.api';
import type { MailDraft } from '../../api/email.api';
import { digitsOnly, normalizePhone } from '../../utils/formatters';
import { getErrorMessage } from '../../api/axios';

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
  onSent: () => void;
}

export function ComposeModal({ lockedTo, draftId, onClose, onSent }: ComposeModalProps) {
  const [to, setTo] = useState(lockedTo ? [normalizeLockedRecipient(lockedTo)] : []);
  const [toInput, setToInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeDraftId, setActiveDraftId] = useState(draftId);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    void listDrafts().then((drafts) => {
      const draft = drafts.find((item) => item.id === draftId);
      if (cancelled || !draft) return;
      setTo(draft.recipients);
      setSubject(draft.subject);
      setBody(draft.body);
      setActiveDraftId(draft.id);
    }).catch((loadError) => {
      if (!cancelled) setError(getErrorMessage(loadError, "Couldn't load this draft."));
    });
    return () => { cancelled = true; };
  }, [draftId]);

  const persistDraft = async (): Promise<MailDraft | undefined> => {
    if (to.length === 0 && !subject.trim() && !body.trim()) return undefined;
    setSavingDraft(true);
    setError('');
    try {
      const draft = await saveDraft({
        id: activeDraftId,
        recipients: to,
        subject,
        body,
      });
      setActiveDraftId(draft.id);
      return draft;
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Couldn't save the draft."));
      return undefined;
    } finally {
      setSavingDraft(false);
    }
  };

  const closeAndSave = async () => {
    if (await persistDraft() || (to.length === 0 && !subject.trim() && !body.trim())) onClose();
  };

  const discardDraft = async () => {
    if (activeDraftId) {
      try {
        await deleteDraft(activeDraftId);
      } catch (discardError) {
        setError(getErrorMessage(discardError, "Couldn't discard the draft."));
        return;
      }
    }
    onClose();
  };

  const inputDigits = digitsOnly(toInput);
  const canAddPhone = inputDigits.length === 10 && /^\+?[\d\s()-]+$/.test(toInput);
  const canAddEmail = EMAIL_PATTERN.test(toInput.trim());
  const canAddRecipient = canAddPhone || canAddEmail;

  const addRecipient = () => {
    if (!canAddRecipient) {
      setError('Enter a valid email address or a 10-digit PhoneMail number.');
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
      setError('Add at least one recipient.');
      return;
    }
    if (!body.trim()) {
      setError('Write a message before sending.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await sendMessage({ to, subject: subject || undefined, body: body.trim() });
      if (activeDraftId) await deleteDraft(activeDraftId);
      onSent();
    } catch (sendError) {
      setError(getErrorMessage(sendError, "Couldn't send. Check your SMTP setup and try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white md:items-center md:justify-center md:bg-slate-900/40 md:backdrop-blur-sm">
      <div className="anim-sheet flex h-full w-full flex-col md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-3xl md:shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:pt-3">
          <h2 className="text-[15px] font-semibold text-slate-900">New email</h2>
          <button
            onClick={() => { void closeAndSave(); }}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-0 overflow-y-auto bg-white">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm text-slate-400">To</span>
            {to.map((recipient) => (
              <span
                key={recipient}
                className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1.5 text-sm text-[#0b4fe0]"
              >
                {recipient.includes('@') ? recipient : `${recipient}@phonemail.com`}
                {!lockedTo && (
                  <button
                    onClick={() => setTo((prev) => prev.filter((entry) => entry !== recipient))}
                    aria-label={`Remove ${recipient}`}
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
                  aria-label={`Add ${canAddEmail ? toInput.trim() : `${inputDigits}@phonemail.com`}`}
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
                placeholder="Email address or phone number"
                inputMode="email"
                className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            ))}
          </div>

          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            className="w-full border-b border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write your message…"
            rows={10}
            className="w-full resize-none px-4 py-3 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
          />

          {error && <p role="alert" className="px-4 pb-2 text-sm text-rose-600">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <button
            onClick={() => { void discardDraft(); }}
            aria-label="Discard"
            className="grid size-10 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <Button
              disabled={savingDraft || sending}
              onClick={() => { void persistDraft(); }}
              variant="secondary"
            >
              Save draft
            </Button>
            <Button loading={sending} onClick={handleSend}>Send</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
