import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { CheckCheck, Copy, EllipsisVertical, Flag, Paperclip, Reply, Star, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatBytes, formatClock } from '../../utils/formatters';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  /** Swipe-right → "tag this message" (reply). Only offered once per message. */
  onSwipeReply?: (message: Message) => void;
  /** Tap a long message to open it in the traditional full-email view. */
  onOpenFull?: (message: Message) => void;
  onAction?: (message: Message, action: 'star' | 'spam' | 'trash' | 'restore' | 'delete' | 'markRead') => void;
}

const LONG_MESSAGE_CHARS = 320;
const SWIPE_TRIGGER_PX = 56;

export function MessageBubble({ message, onSwipeReply, onOpenFull, onAction }: MessageBubbleProps) {
  const [dragX, setDragX] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOut = message.direction === 'out';
  const canSwipe = Boolean(onSwipeReply) && !message.replied;
  const isLong = message.body.length > LONG_MESSAGE_CHARS;

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [menuOpen]);

  const handleTouchStart = (e: TouchEvent) => {
    if (!canSwipe) return;
    setTouchStartX(e.touches[0].clientX);
  };
  const handleTouchMove = (e: TouchEvent) => {
    if (!canSwipe || touchStartX === null) return;
    const delta = Math.max(0, Math.min(e.touches[0].clientX - touchStartX, 84));
    setDragX(delta);
  };
  const handleTouchEnd = () => {
    if (canSwipe && dragX > SWIPE_TRIGGER_PX) onSwipeReply?.(message);
    setDragX(0);
    setTouchStartX(null);
  };

  return (
    <div
      className={cn('relative flex', isOut ? 'justify-end' : 'justify-start')}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* reveal-behind reply icon while swiping */}
      {canSwipe && dragX > 0 && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 text-[#1a66ff] transition-opacity"
          style={{ opacity: Math.min(dragX / SWIPE_TRIGGER_PX, 1) }}
        >
          <Reply className="size-5" />
        </span>
      )}

      <div
        role={isLong ? 'button' : undefined}
        tabIndex={isLong ? 0 : undefined}
        onClick={() => isLong && onOpenFull?.(message)}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
        className={cn(
          'max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm transition-transform duration-100 sm:max-w-[70%]',
          isOut
            ? 'rounded-tr-md bg-gradient-to-br from-[#2a72ff] to-[#1a5ff0] text-white'
            : 'rounded-tl-md bg-white text-slate-800 ring-1 ring-slate-100',
          isLong && 'cursor-pointer',
        )}
      >
        {/* new-email subject header */}
        {message.subject && !message.isReply && (
          <p
            className={cn(
              'mb-1 text-[11px] font-semibold uppercase tracking-wide',
              isOut ? 'text-blue-100' : 'text-[#1a66ff]',
            )}
          >
            {message.subject}
          </p>
        )}

        {/* quoted original, for replies */}
        {message.isReply && message.quotedText && (
          <div
            className={cn(
              'mb-1.5 rounded-lg border-l-[3px] px-2.5 py-1.5 text-[13px] leading-snug',
              isOut ? 'border-white/50 bg-white/10 text-blue-50' : 'border-[#1a66ff]/40 bg-blue-50 text-slate-500',
            )}
          >
            <p className="truncate">{message.quotedText}</p>
          </div>
        )}

        <p className={cn('whitespace-pre-wrap text-[15px] leading-relaxed', isLong && 'line-clamp-6')}>
          {message.body}
        </p>

        {isLong && (
          <span className={cn('mt-1 inline-block text-xs font-medium underline underline-offset-2', isOut ? 'text-blue-100' : 'text-[#1a66ff]')}>
            Open full email
          </span>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs',
                  isOut ? 'bg-white/10' : 'bg-slate-50',
                )}
              >
                <Paperclip className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{att.name}</span>
                <span className="shrink-0 opacity-70">{formatBytes(att.size)}</span>
              </div>
            ))}
          </div>
        )}

        <div className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', isOut ? 'text-blue-100/90' : 'text-slate-400')}>
          <span>{formatClock(message.createdAt)}</span>
          {isOut && <CheckCheck className={cn('size-3.5', message.status === 'read' && 'text-sky-200')} />}
          {message.isStarred && <Star className="size-3 fill-amber-400 text-amber-400" />}
        </div>
      </div>
      {onAction && (
        <div ref={menuRef} className="relative self-start">
          <button
            type="button"
            aria-label="Message actions"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-white/80"
          >
            <EllipsisVertical className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl bg-white p-1 text-left text-xs text-slate-700 shadow-xl ring-1 ring-slate-200">
              {message.direction === 'in' && !message.replied && (
                <button className="menu-action" onClick={() => { setMenuOpen(false); onSwipeReply?.(message); }}>
                  <Reply className="size-3.5" /> Reply
                </button>
              )}
              <button className="menu-action" onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(message.body); }}>
                <Copy className="size-3.5" /> Copy
              </button>
              <button className="menu-action" onClick={() => { setMenuOpen(false); onAction(message, 'star'); }}>
                <Star className="size-3.5" /> {message.isStarred ? 'Unstar' : 'Star'}
              </button>
              <button className="menu-action" onClick={() => { setMenuOpen(false); onAction(message, 'markRead'); }}>
                <CheckCheck className="size-3.5" /> Mark as read
              </button>
              <button className="menu-action" onClick={() => { setMenuOpen(false); onAction(message, message.mailbox === 'spam' ? 'restore' : 'spam'); }}>
                <Flag className="size-3.5" /> {message.mailbox === 'spam' ? 'Move to inbox' : 'Move to spam'}
              </button>
              <button className="menu-action text-rose-600" onClick={() => { setMenuOpen(false); onAction(message, 'trash'); }}>
                <Trash2 className="size-3.5" /> Move to trash
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
