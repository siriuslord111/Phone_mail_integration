import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Plus, Star } from 'lucide-react';
import { MailList } from '../components/mail/MailList';
import { ExpandedEmailView } from '../components/mail/ExpandedEmailView';
import { ComposeBar } from '../components/chat/ComposeBar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ConversationProfilePanel } from '../components/chat/ConversationProfilePanel';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useLayoutContext } from '../hooks/useLayoutContext';
import {
  getMessages,
  listConversations,
  sendMessage,
  toggleFavourite,
  updateConversation,
  updateMessage,
} from '../api/email.api';
import { formatDay, getInitials, avatarColor, normalizePhone } from '../utils/formatters';
import type { Conversation, MailFilter, Message } from '../types';

const FOLDER_BY_PATH: Record<string, string> = {
  '/': 'Inbox',
  '/sent': 'Sent',
  '/drafts': 'Drafts',
  '/spam': 'Spam',
  '/trash': 'Trash',
};

export default function Dashboard() {
  const { pathname } = useLocation();
  const { search } = useLayoutContext();
  const [params, setParams] = useSearchParams();

  const chatId = params.get('chat');
  const composeMode = params.get('compose');

  const [filter, setFilter] = useState<MailFilter>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const compact = localStorage.getItem('phonemail_setting_compact_conversations') === 'true';

  const folder = FOLDER_BY_PATH[pathname] ?? 'Inbox';

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    listConversations(filter, search).then((data) => {
      if (!cancelled) {
        setConversations(data);
        setListLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter, search, pathname, composeMode]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === chatId) ?? null,
    [conversations, chatId],
  );

  const openChat = (c: Conversation) => setParams({ chat: c.id });
  const closeChat = () => setParams({});
  const openCompose = (prefill?: string) => setParams((p) => ({ ...Object.fromEntries(p), compose: prefill || '1' }));
  const refreshList = () => listConversations(filter, search).then(setConversations);

  return (
    <div className="flex h-full min-h-0">
      {/* ── Conversation list ──────────────────────────────────────── */}
      <div
        className={`flex min-h-0 w-full flex-col md:w-[22rem] md:shrink-0 md:border-r md:border-slate-100 ${
          chatId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="hidden items-center justify-between px-5 pt-4 md:flex">
          <h1 className="text-xl font-semibold text-slate-900">{folder}</h1>
          <button
            onClick={() => openCompose()}
            aria-label="New email"
            className="grid size-9 place-items-center rounded-full text-[#1a66ff] transition hover:bg-blue-50"
          >
            <Plus className="size-5" />
          </button>
        </div>
        <MailList
          conversations={conversations}
          loading={listLoading}
          filter={filter}
          onFilterChange={setFilter}
          activeId={chatId ?? undefined}
          onOpen={openChat}
          search={search}
          compact={compact}
        />
      </div>

      {/* ── Chat / reading pane ────────────────────────────────────── */}
      <div className={`min-h-0 flex-1 ${chatId ? 'flex' : 'hidden md:flex'}`}>
        {activeConversation ? (
          <ChatPanel
            key={activeConversation.id}
            conversation={activeConversation}
            onBack={closeChat}
            onFavouriteToggle={async (next) => {
              await toggleFavourite(activeConversation.id, next);
              refreshList();
            }}
            onComposeTraditional={(phone) => openCompose(phone)}
          />
        ) : (
          <EmptyPane />
        )}
      </div>

    </div>
  );
}

function EmptyPane() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center md:flex">
      <span className="grid size-16 place-items-center rounded-full bg-blue-50 text-[#1a66ff]">
        <Info className="size-7" />
      </span>
      <p className="font-medium text-slate-600">Select a conversation</p>
      <p className="max-w-xs text-sm text-slate-400">
        Choose a chat from the list, or start a new email.
      </p>
    </div>
  );
}

// ── Chat panel ──────────────────────────────────────────────────────

interface ChatPanelProps {
  conversation: Conversation;
  onBack: () => void;
  onFavouriteToggle: (next: boolean) => void;
  onComposeTraditional: (lockedPhone: string) => void;
}

function ChatPanel({ conversation, onBack, onFavouriteToggle, onComposeTraditional }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [openedMessage, setOpenedMessage] = useState<Message | null>(null);
  const [showConversationProfile, setShowConversationProfile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const singlePhone = !conversation.isGroup ? conversation.participants[0]?.phone : undefined;

  useEffect(() => {
    setLoading(true);
    getMessages(conversation.id).then((data) => {
      setMessages(data);
      setSubject(data.find((m) => m.subject)?.subject ?? '');
      setLoading(false);
    });
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading]);

  const hasSubject = messages.some((m) => m.subject) || subject.length > 0;

  const handleSend = async (body: string, files: File[]) => {
    setSending(true);
    try {
      const msg = await sendMessage({
        to: conversation.participants.map((p) => p.phone),
        subject: !replyTarget && subject ? subject : undefined,
        body,
        inReplyTo: replyTarget?.id,
        attachments: files.length ? files : undefined,
      });
      setMessages((prev) => prev.map((m) => (m.id === replyTarget?.id ? { ...m, replied: true } : m)).concat(msg));
      setReplyTarget(null);
    } finally {
      setSending(false);
    }
  };

  if (openedMessage) {
    return (
      <ExpandedEmailView
        message={openedMessage}
        senderName={openedMessage.direction === 'in' ? conversation.title : 'You'}
        onBack={() => setOpenedMessage(null)}
        onReply={(m) => {
          setOpenedMessage(null);
          setReplyTarget(m);
        }}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {showConversationProfile && (
        <ConversationProfilePanel
          conversation={conversation}
          messages={messages}
          onClose={() => setShowConversationProfile(false)}
          onSave={async (patch) => {
            await updateConversation(conversation.id, patch);
          }}
        />
      )}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-3 py-2.5 md:px-5 md:py-3.5">
        <button
          onClick={onBack}
          aria-label="Back to list"
          className="grid size-10 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-90 md:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>

        <button
          onClick={() => setShowConversationProfile(true)}
          aria-label="View contact profile"
          className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: avatarColor(singlePhone ?? conversation.title) }}
        >
          {getInitials(conversation.title)}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{conversation.title}</p>
          <p className="truncate text-xs text-slate-400">
            {conversation.isGroup
              ? `${conversation.participants.length} participants`
              : singlePhone && `${normalizePhone(singlePhone)}@phonemail.com`}
          </p>
        </div>

        <button
          onClick={() => onFavouriteToggle(!conversation.isFavourite)}
          aria-label={conversation.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100"
        >
          <Star className={`size-5 ${conversation.isFavourite ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
      </header>

      <div className="chat-wallpaper flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6">
        {loading ? (
          <div className="grid h-full place-items-center">
            <LoadingSpinner label="Loading messages…" />
          </div>
        ) : (
          groupByDay(messages).map(([day, msgs]) => (
            <div key={day}>
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                  {day}
                </span>
              </div>
              <div className="space-y-2.5">
                {msgs.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onSwipeReply={(target) => setReplyTarget(target)}
                    onOpenFull={setOpenedMessage}
                    onAction={async (target, action) => {
                      const updated = await updateMessage(target.id, action);
                      if (action === 'spam' || action === 'trash' || action === 'delete') {
                        setMessages((prev) => prev.filter((item) => item.id !== target.id));
                      } else {
                        setMessages((prev) => prev.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <ComposeBar
        showSubject={!replyTarget && !hasSubject}
        subject={subject}
        onSubjectChange={setSubject}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onSend={handleSend}
        sending={sending}
        onOpenTraditional={() => singlePhone && onComposeTraditional(singlePhone)}
      />
    </div>
  );
}

function groupByDay(messages: Message[]): [string, Message[]][] {
  const groups = new Map<string, Message[]>();
  for (const m of messages) {
    const key = formatDay(m.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return Array.from(groups.entries());
}
