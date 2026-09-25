import { ArrowLeft, Paperclip, Reply } from 'lucide-react';
import { Button } from '../common/Buttons';
import { formatBytes, formatFullDate, getInitials, avatarColor } from '../../utils/formatters';
import type { Message } from '../../types';

interface ExpandedEmailViewProps {
  message: Message;
  senderName: string;
  onBack: () => void;
  /** Only offered when the message hasn't already been replied to once. */
  onReply?: (message: Message) => void;
}

/** Full-screen "traditional" reading view for a long email, opened by tapping a chat bubble. */
export function ExpandedEmailView({ message, senderName, onBack, onReply }: ExpandedEmailViewProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button
          onClick={onBack}
          aria-label="Back to conversation"
          className="grid size-10 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-90"
        >
          <ArrowLeft className="size-5" />
        </button>
        <p className="truncate text-[15px] font-semibold text-slate-800">
          {message.subject ?? 'Email'}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: avatarColor(message.fromPhone) }}
          >
            {getInitials(senderName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{senderName}</p>
            <p className="truncate text-sm text-slate-400">{message.fromPhone}@phonemail.com</p>
          </div>
          <p className="shrink-0 text-xs text-slate-400">{formatFullDate(message.createdAt)}</p>
        </div>

        {message.isReply && message.quotedText && (
          <div className="mt-4 rounded-xl border-l-[3px] border-[#1a66ff]/40 bg-blue-50 px-3.5 py-2.5 text-sm text-slate-500">
            <p className="mb-0.5 text-xs font-semibold text-[#1a66ff]">In reply to</p>
            <p className="line-clamp-2">{message.quotedText}</p>
          </div>
        )}

        <div className="mt-5 whitespace-pre-wrap text-[15px] leading-[1.75] text-slate-800">
          {message.body}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-6 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
            </p>
            {message.attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
                  <Paperclip className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{att.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(att.size)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {onReply && !message.replied && (
        <div className="border-t border-slate-100 p-4">
          <Button variant="secondary" fullWidth onClick={() => onReply(message)} className="justify-center">
            <Reply className="size-4" />
            Reply
          </Button>
        </div>
      )}
    </div>
  );
}
