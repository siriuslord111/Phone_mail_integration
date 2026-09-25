import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Plus, Star, Trash2, X } from 'lucide-react';
import { MailList } from '../components/mail/MailList';
import { ExpandedEmailView } from '../components/mail/ExpandedEmailView';
import { ComposeBar } from '../components/chat/ComposeBar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ConversationProfilePanel } from '../components/chat/ConversationProfilePanel';
import { Button } from '../components/common/Buttons';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useLayoutContext } from '../hooks/useLayoutContext';
import {
  getMessages,
  listConversations,
  lookupName,
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
  const composeMode = params.get('compose'); // '1' = new email, or a phone number for a locked reply-in-full-view

  const [filter, setFilter] = useState<MailFilter>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);

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
  }, [filter, search, pathname]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === chatId) ?? null,
    [conversations, chatId],
  );

  const openChat = (c: Conversation) => setParams({ chat: c.id });
  const closeChat = () => setParams({});
  const openCompose = (prefill?: string) => setParams((p) => ({ ...Object.fromEntries(p), compose: prefill || '1' }));
  const closeCompose = () =>
    setParams((p) => {
      const next = Object.fromEntries(p);
      delete next.compose;
      return next;
    });

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

      {composeMode && (
        <ComposeModal
          lockedTo={composeMode !== '1' ? composeMode : undefined}
          onClose={closeCompose}
          onSent={() => {
            closeCompose();
            refreshList();
          }}
        />
      )}
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

// ── Traditional compose (also used for "reply in traditional view") ─

interface ComposeModalProps {
  /** A single phone number → To is pre-filled and locked (per the rulebook, inside a chat you can't add recipients). */
  lockedTo?: string;
  onClose: () => void;
  onSent: () => void;
}

function ComposeModal({ lockedTo, onClose, onSent }: ComposeModalProps) {
  const [to, setTo] = useState(lockedTo ? [lockedTo] : []);
  const [toInput, setToInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const addRecipient = () => {
    const digits = normalizePhone(toInput);
    if (digits.length !== 10) {
      setError('Enter a valid 10-digit PhoneMail number.');
      return;
    }
    if (to.includes(digits)) {
      setToInput('');
      return;
    }
    setTo((prev) => [...prev, digits]);
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
    try {
      await sendMessage({ to, subject: subject || undefined, body: body.trim() });
      onSent();
    } catch {
      setError("Couldn't send. Please try again.");
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
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-0 overflow-y-auto bg-white">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm text-slate-400">To</span>
            {to.map((phone) => (
              <span
                key={phone}
                className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1.5 text-sm text-[#0b4fe0]"
              >
                {lookupName(phone)}
                {!lockedTo && (
                  <button
                    onClick={() => setTo((prev) => prev.filter((p) => p !== phone))}
                    aria-label={`Remove ${phone}`}
                    className="grid size-4 place-items-center rounded-full hover:bg-blue-100"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            ))}
            {!lockedTo && (
              <input
                value={toInput}
                onChange={(e) => setToInput(e.target.value.replace(/[^\d+]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                onBlur={addRecipient}
                placeholder="Phone number"
                className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            )}
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full border-b border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={10}
            className="w-full resize-none px-4 py-3 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
          />

          {error && <p className="px-4 pb-2 text-sm text-rose-600">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <button
            onClick={() => {
              setTo([]);
              setSubject('');
              setBody('');
            }}
            aria-label="Discard"
            className="grid size-10 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 className="size-5" />
          </button>
          <Button loading={sending} onClick={handleSend}>
            Send
          </Button>
        </footer>
      </div>
    </div>
  );
}
