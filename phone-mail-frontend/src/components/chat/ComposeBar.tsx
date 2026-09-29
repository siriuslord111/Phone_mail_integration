import { useRef, useState, type KeyboardEvent } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { getErrorMessage } from '../../api/axios';
import type { Message } from '../../types';
import { useLanguage } from '../../context/LanguageProvider';

interface ComposeBarProps {
  /** Show the subject input for a new email in this conversation. */
  showSubject: boolean;
  subject: string;
  onSubjectChange: (v: string) => void;
  /** The message being replied to — shown as a dismissible quote chip above the input. */
  replyTarget: Message | null;
  onCancelReply: () => void;
  onSend: (body: string, files: File[]) => Promise<void>;
  sending?: boolean;
  /** WhatsApp's camera-tab slot: opens the traditional compose view with "To" pre-filled+locked. */
  onOpenTraditional: () => void;
}

export function ComposeBar({
  showSubject,
  subject,
  onSubjectChange,
  replyTarget,
  onCancelReply,
  onSend,
  sending,
  onOpenTraditional,
}: ComposeBarProps) {
  const { t } = useLanguage();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [subjectOpen, setSubjectOpen] = useState(showSubject);
  const [sendError, setSendError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = (body.trim().length > 0 || files.length > 0) && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSendError('');
    try {
      await onSend(body.trim(), files);
      setBody('');
      setFiles([]);
    } catch (error) {
      setSendError(getErrorMessage(error, t('couldNotSendMessage')));
    }
  };

  const handleFilesSelected = (selectedFiles: FileList | null) => {
    if (!selectedFiles?.length) return;
    const addedFiles = Array.from(selectedFiles);
    const oversized = addedFiles.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setSendError(`${oversized.name} ${t('attachmentSizeLimit')}`);
      return;
    }
    if (files.length + addedFiles.length > 5) {
      setSendError(t('attachmentLimit'));
      return;
    }
    setSendError('');
    setFiles((previous) => [...previous, ...addedFiles]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-100 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2.5 backdrop-blur">
      {showSubject && !replyTarget && subjectOpen && (
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder={t('subject')}
          className="mb-2 w-full rounded-lg bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-600 outline-none placeholder:text-slate-400 focus:bg-slate-100"
        />
      )}

      {replyTarget && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border-l-[3px] border-[#1a66ff] bg-blue-50 px-3 py-2 anim-pop">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[#1a66ff]">{t('replying')}</p>
            <p className="truncate text-[13px] text-slate-500">{replyTarget.body}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t('cancelReply')}
            className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-200"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-2.5 pr-1.5 text-xs text-slate-600">
              <Paperclip className="size-3" />
              <span className="max-w-[9rem] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label={`${t('removeRecipient')} ${f.name}`}
                className="grid size-4 place-items-center rounded-full hover:bg-slate-300"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('attachFile')}
          className="grid size-11 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 active:scale-90"
        >
          <Paperclip className="size-5" />
        </button>

        {/* Occupies WhatsApp's camera-tab slot: jump to traditional compose, To pre-filled+locked */}
        <button
          type="button"
          onClick={onOpenTraditional}
          className="mb-2 shrink-0 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500 transition hover:border-[#1a66ff] hover:text-[#1a66ff]"
        >
          {t('fullView')}
        </button>

        <div
          className="flex-1 rounded-3xl bg-slate-100 px-4 py-2.5"
        >
          <textarea
            rows={1}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => !replyTarget && !subjectOpen && setSubjectOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={t('message')}
            className="max-h-28 w-full resize-none bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={t('send')}
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full text-white shadow-md shadow-blue-600/30 transition-all duration-150',
            canSend
              ? 'bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] hover:shadow-lg active:scale-90'
              : 'bg-slate-300 shadow-none',
          )}
        >
          <Send className="size-[18px] translate-x-[-1px]" />
        </button>
      </div>
      {sendError && (
        <p role="alert" className="px-2 pt-2 text-xs text-rose-600">
          {sendError}
        </p>
      )}
    </div>
  );
}
