import { Paperclip, Search, Star, Users } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '../../utils/cn';
import { formatListTime, getContactInitials, avatarColor } from '../../utils/formatters';
import { MailListSkeleton } from '../common/LoadingSpinner';
import { useLanguage } from '../../context/LanguageProvider';
import type { Conversation, MailFilter } from '../../types';
import type { TranslationKey } from '../../utils/i18n';

const FILTERS: { id: MailFilter; label: TranslationKey }[] = [
  { id: 'all', label: 'allFilter' },
  { id: 'unread', label: 'unreadFilter' },
  { id: 'favourites', label: 'favouritesFilter' },
  { id: 'attachments', label: 'attachmentsFilter' },
];

interface MailListProps {
  conversations: Conversation[];
  loading: boolean;
  filter: MailFilter;
  onFilterChange: (f: MailFilter) => void;
  activeId?: string;
  onOpen: (conversation: Conversation) => void;
  search: string;
  compact?: boolean;
}

export function MailList({
  conversations,
  loading,
  filter,
  onFilterChange,
  activeId,
  onOpen,
  search,
  compact = false,
}: MailListProps) {
  const { t } = useLanguage();
  const drag = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean; captured: boolean } | null>(null);
  const suppressClick = useRef(false);

  return (
    <div className="flex h-full flex-col">
      <div
        className="no-scrollbar flex touch-pan-x cursor-grab select-none gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 pt-3 active:cursor-grabbing md:px-5 md:pt-4"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: event.currentTarget.scrollLeft,
            moved: false,
            captured: false,
          };
        }}
        onPointerMove={(event) => {
          const currentDrag = drag.current;
          if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - currentDrag.startX;
          if (Math.abs(deltaX) > 5 && !currentDrag.moved) {
            currentDrag.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            currentDrag.captured = true;
          }
          if (currentDrag.moved) event.currentTarget.scrollLeft = currentDrag.startScrollLeft - deltaX;
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          suppressClick.current = drag.current.moved;
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150',
              filter === f.id
                ? 'bg-[#1a66ff] text-white shadow-sm shadow-blue-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <MailListSkeleton />
        ) : conversations.length === 0 ? (
          <EmptyState search={search} filter={filter} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onOpen(c)}
                  className={cn(
                    cn(
                      'flex w-full items-center gap-3 px-4 text-left transition-colors duration-100 md:px-5',
                      compact ? 'py-2' : 'py-3.5',
                    ),
                    activeId === c.id ? 'bg-blue-50' : 'hover:bg-slate-50 active:bg-slate-100',
                  )}
                >
                  <Avatar conversation={c} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-[15px]', c.unreadCount > 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
                        {c.title}
                      </span>
                      <span className={cn('shrink-0 text-xs', c.unreadCount > 0 ? 'font-semibold text-[#1a66ff]' : 'text-slate-400')}>
                        {formatListTime(c.lastMessage.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className={cn('truncate text-[13px]', c.unreadCount > 0 ? 'text-slate-600' : 'text-slate-400')}>
                        {c.lastMessage.direction === 'out' && <span className="text-slate-400">{t('sentPrefix')} </span>}
                        {c.lastMessage.hasAttachment && <Paperclip className="mr-1 inline size-3 -translate-y-px" />}
                        {c.lastMessage.preview}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.isFavourite && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                        {c.unreadCount > 0 && (
                          <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-[#1a66ff] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Avatar({ conversation }: { conversation: Conversation }) {
  if (conversation.isGroup) {
    return (
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
        <Users className="size-5" />
      </span>
    );
  }
  const seed = conversation.participants[0]?.phone ?? conversation.title;
  return (
    <span
      className="grid size-12 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white shadow-sm"
      style={{
        backgroundColor: avatarColor(seed),
        backgroundImage: conversation.avatarUrl ? `url("${conversation.avatarUrl}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {!conversation.avatarUrl && getContactInitials(conversation.title, conversation.participants[0]?.phone)}
    </span>
  );
}

function EmptyState({ search, filter }: { search: string; filter: MailFilter }) {
  const { t } = useLanguage();
  if (search) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-slate-100 text-slate-300">
          <Search className="size-6" />
        </span>
        <p className="font-medium text-slate-600">{t('noSearchResults')} "{search}"</p>
        <p className="max-w-[22rem] text-sm text-slate-400">
          {t('trySearchHint')}
        </p>
      </div>
    );
  }

  const copy: Record<MailFilter, { title: TranslationKey; body: TranslationKey }> = {
    all: { title: 'nothingHereYet', body: 'newEmailsChatsHint' },
    unread: { title: 'caughtUp', body: 'unreadAppearHere' },
    favourites: { title: 'noFavouritesYet', body: 'starConversationHint' },
    attachments: { title: 'noAttachmentsYet', body: 'emailsWithFilesHint' },
  };
  const { title, body } = copy[filter];

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-blue-50 text-[#1a66ff]">
        <Star className="size-6" />
      </span>
      <p className="font-medium text-slate-600">{t(title)}</p>
      <p className="max-w-[22rem] text-sm text-slate-400">{t(body)}</p>
    </div>
  );
}
