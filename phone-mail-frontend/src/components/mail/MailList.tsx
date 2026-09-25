import { Paperclip, Search, Star, Users } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatListTime, getInitials, avatarColor } from '../../utils/formatters';
import { MailListSkeleton } from '../common/LoadingSpinner';
import type { Conversation, MailFilter } from '../../types';

const FILTERS: { id: MailFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'attachments', label: 'Attachments' },
];

interface MailListProps {
  conversations: Conversation[];
  loading: boolean;
  filter: MailFilter;
  onFilterChange: (f: MailFilter) => void;
  activeId?: string;
  onOpen: (conversation: Conversation) => void;
  search: string;
}

export function MailList({
  conversations,
  loading,
  filter,
  onFilterChange,
  activeId,
  onOpen,
  search,
}: MailListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 pt-3 md:px-5 md:pt-4">
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
            {f.label}
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
                    'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-100 md:px-5',
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
                        {c.lastMessage.direction === 'out' && <span className="text-slate-400">You: </span>}
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
      style={{ backgroundColor: avatarColor(seed) }}
    >
      {getInitials(conversation.title)}
    </span>
  );
}

function EmptyState({ search, filter }: { search: string; filter: MailFilter }) {
  if (search) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-slate-100 text-slate-300">
          <Search className="size-6" />
        </span>
        <p className="font-medium text-slate-600">No results for "{search}"</p>
        <p className="max-w-[22rem] text-sm text-slate-400">
          Try a name, phone number, or part of an email address.
        </p>
      </div>
    );
  }

  const copy: Record<MailFilter, { title: string; body: string }> = {
    all: { title: 'Nothing here yet', body: 'New emails and chats will show up in this list.' },
    unread: { title: "You're all caught up", body: 'Unread conversations will appear here.' },
    favourites: { title: 'No favourites yet', body: 'Star a conversation to pin it here.' },
    attachments: { title: 'No attachments yet', body: 'Emails with files will be listed here.' },
  };
  const { title, body } = copy[filter];

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-blue-50 text-[#1a66ff]">
        <Star className="size-6" />
      </span>
      <p className="font-medium text-slate-600">{title}</p>
      <p className="max-w-[22rem] text-sm text-slate-400">{body}</p>
    </div>
  );
}
