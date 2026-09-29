import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Star } from 'lucide-react';
import { MailList } from '../components/mail/MailList';
import { ExpandedEmailView } from '../components/mail/ExpandedEmailView';
import { ComposeBar } from '../components/chat/ComposeBar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ConversationProfilePanel } from '../components/chat/ConversationProfilePanel';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useLayoutContext } from '../hooks/useLayoutContext';
import { useLanguage } from '../context/LanguageProvider';
import {
  getMessages,
  listConversations,
  listDrafts,
  sendMessage,
  saveContactNickname,
  toggleFavourite,
  updateConversation,
  updateMessage,
} from '../api/email.api';
import { formatDay, getContactInitials, avatarColor, normalizePhone } from '../utils/formatters';
import type { TranslationKey } from '../utils/i18n';
import type { Conversation, Folder, MailFilter, Message } from '../types';
import type { MailDraft } from '../api/email.api';

const FOLDER_BY_PATH: Record<string, Folder> = {
  '/': 'inbox',
  '/sent': 'sent',
  '/drafts': 'drafts',
  '/spam': 'spam',
  '/trash': 'trash',
};
const FOLDER_LABELS: Record<Folder, TranslationKey> = {
  inbox: 'inbox',
  sent: 'sent',
  drafts: 'drafts',
  spam: 'spam',
  trash: 'trash',
};
const CONVERSATION_LIST_WIDTH_KEY = 'phonemail_setting_conversation_list_width';
const MIN_CONVERSATION_LIST_WIDTH = 260;
const MAX_CONVERSATION_LIST_WIDTH = 560;
const MIN_READING_PANE_WIDTH = 320;

function clampConversationListWidth(width: number, availableWidth: number) {
  const maxWidth = Math.max(
    MIN_CONVERSATION_LIST_WIDTH,
    Math.min(MAX_CONVERSATION_LIST_WIDTH, availableWidth - MIN_READING_PANE_WIDTH),
  );
  return Math.min(maxWidth, Math.max(MIN_CONVERSATION_LIST_WIDTH, width));
}

function readConversationListWidth() {
  const stored = Number(localStorage.getItem(CONVERSATION_LIST_WIDTH_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 352;
}

export default function Dashboard() {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const { search } = useLayoutContext();
  const [params, setParams] = useSearchParams();

  const chatId = params.get('chat');
  const composeMode = params.get('compose');

  const [filter, setFilter] = useState<MailFilter>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [drafts, setDrafts] = useState<MailDraft[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [conversationListWidth, setConversationListWidth] = useState(readConversationListWidth);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const compact = localStorage.getItem('phonemail_setting_compact_conversations') === 'true';

  const folder = FOLDER_BY_PATH[pathname] ?? 'inbox';

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    const load = folder === 'drafts'
      ? listDrafts().then((items) => {
          if (!cancelled) setDrafts(items);
          return [] as Conversation[];
        })
      : listConversations(filter, search, folder);
    load.then((data) => {
      if (!cancelled) {
        setConversations(data);
        setListLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter, search, pathname, composeMode, folder]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === chatId) ?? null,
    [conversations, chatId],
  );

  const openChat = (c: Conversation) => setParams({ chat: c.id });
  const closeChat = () => setParams({});
  const openCompose = (prefill?: string) => setParams((p) => ({ ...Object.fromEntries(p), compose: prefill || '1' }));
  const refreshList = useCallback(
    () => listConversations(filter, search, folder).then(setConversations),
    [filter, folder, search],
  );

  useEffect(() => {
    localStorage.setItem(CONVERSATION_LIST_WIDTH_KEY, String(conversationListWidth));
  }, [conversationListWidth]);

  useEffect(() => {
    const container = splitPaneRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => {
      if (!window.matchMedia('(min-width: 768px)').matches) return;
      setConversationListWidth((width) => clampConversationListWidth(width, container.clientWidth));
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const resizeConversationList = (clientX: number) => {
    const container = splitPaneRef.current;
    if (!container) return;
    setConversationListWidth(
      clampConversationListWidth(clientX - container.getBoundingClientRect().left, container.clientWidth),
    );
  };

  const splitPaneStyle = {
    '--conversation-list-width': `${conversationListWidth}px`,
  } as CSSProperties;

  return (
    <div
      ref={splitPaneRef}
      style={splitPaneStyle}
      className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[var(--conversation-list-width)_6px_minmax(0,1fr)]"
    >
      {/* ── Conversation list ──────────────────────────────────────── */}
      <div
        className={`flex min-h-0 w-full flex-col md:w-[var(--conversation-list-width)] ${
          chatId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="hidden items-center justify-between px-5 pt-4 md:flex">
          <h1 className="text-xl font-semibold text-slate-900">{t(FOLDER_LABELS[folder])}</h1>
        </div>
        {folder === 'drafts' ? (
          <DraftList
            drafts={drafts}
            loading={listLoading}
            onOpen={(draft) => openCompose(`draft:${draft.id}`)}
          />
        ) : (
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
        )}
      </div>

      <div
        role="separator"
        aria-label={t('resizeConversationList')}
        aria-orientation="vertical"
        aria-valuemin={MIN_CONVERSATION_LIST_WIDTH}
        aria-valuemax={Math.min(MAX_CONVERSATION_LIST_WIDTH, Math.max(MIN_CONVERSATION_LIST_WIDTH, (splitPaneRef.current?.clientWidth ?? 0) - MIN_READING_PANE_WIDTH))}
        aria-valuenow={Math.round(conversationListWidth)}
        tabIndex={0}
        className="group hidden cursor-col-resize touch-none items-center justify-center bg-slate-100 outline-none hover:bg-blue-100 focus-visible:bg-blue-100 md:flex"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          resizingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        onPointerMove={(event) => {
          if (resizingRef.current) resizeConversationList(event.clientX);
        }}
        onPointerUp={() => {
          resizingRef.current = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }}
        onPointerCancel={() => {
          resizingRef.current = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const delta = event.key === 'ArrowLeft' ? -24 : 24;
            setConversationListWidth((width) =>
              clampConversationListWidth(width + delta, splitPaneRef.current?.clientWidth ?? window.innerWidth),
            );
          }
        }}
      >
        <span className="h-10 w-0.5 rounded-full bg-slate-300 transition-colors group-hover:bg-blue-400 group-focus-visible:bg-blue-500" />
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
            onRead={refreshList}
            onSaveNickname={async (phone, nickname) => {
              await saveContactNickname(phone, nickname);
              await refreshList();
            }}
          />
        ) : (
          <EmptyPane />
        )}
      </div>

    </div>
  );
}

function DraftList({ drafts, loading, onOpen }: {
  drafts: MailDraft[];
  loading: boolean;
  onOpen: (draft: MailDraft) => void;
}) {
  const { t } = useLanguage();
  if (loading) return <div className="flex-1"><LoadingSpinner label={t('loadingDrafts')} /></div>;
  if (drafts.length === 0) return (
    <div className="grid flex-1 place-items-center text-sm text-slate-400">{t('noSavedDrafts')}</div>
  );
  return (
    <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
      {drafts.map((draft) => (
        <li key={draft.id}>
          <button
            onClick={() => onOpen(draft)}
            className="w-full px-5 py-4 text-left transition hover:bg-slate-50"
          >
            <p className="truncate text-sm font-medium text-slate-800">
              {draft.recipients.length ? `${t('to')}: ${draft.recipients.join(', ')}` : t('noRecipient')}
            </p>
            <p className="mt-1 truncate text-sm text-slate-600">{draft.subject || t('noSubject')}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{draft.body || t('emptyDraft')}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyPane() {
  const { t } = useLanguage();
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center md:flex">
      <span className="grid size-16 place-items-center rounded-full bg-blue-50 text-[#1a66ff]">
        <Info className="size-7" />
      </span>
      <p className="font-medium text-slate-600">{t('selectConversation')}</p>
      <p className="max-w-xs text-sm text-slate-400">
        {t('chooseChatOrEmail')}
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
  onRead: () => void;
  onSaveNickname: (phone: string, nickname: string) => Promise<void>;
}

function ChatPanel({ conversation, onBack, onFavouriteToggle, onComposeTraditional, onRead, onSaveNickname }: ChatPanelProps) {
  const { t } = useLanguage();
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
      setSubject('');
      setLoading(false);
      onRead();
    });
  }, [conversation.id, onRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    const goBackOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      if (openedMessage) setOpenedMessage(null);
      else if (!showConversationProfile) onBack();
    };
    document.addEventListener('keydown', goBackOnEscape);
    return () => document.removeEventListener('keydown', goBackOnEscape);
  }, [onBack, openedMessage, showConversationProfile]);

  const handleSend = async (body: string, files: File[]): Promise<void> => {
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
        senderName={openedMessage.direction === 'in' ? conversation.title : t('you')}
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
          onSaveNickname={async (nickname) => {
            const contactPhone = conversation.participants[0]?.phone;
            if (!contactPhone) throw new Error(t('phoneUnavailable'));
            await onSaveNickname(contactPhone, nickname);
          }}
        />
      )}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-3 py-2.5 md:px-5 md:py-3.5">
        <button
          onClick={onBack}
          aria-label={t('backToList')}
          className="grid size-10 shrink-0 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-90 md:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>

        <button
          onClick={() => setShowConversationProfile(true)}
          aria-label={t('viewContactProfile')}
          className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-sm"
          style={{
            backgroundColor: avatarColor(singlePhone ?? conversation.title),
            backgroundImage: conversation.avatarUrl ? `url("${conversation.avatarUrl}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!conversation.avatarUrl && getContactInitials(conversation.title, singlePhone)}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{conversation.title}</p>
          <p className="truncate text-xs text-slate-400">
            {conversation.isGroup
              ? `${conversation.participants.length} ${t('groupParticipants')}`
              : singlePhone && `${normalizePhone(singlePhone)}@phonemail.com`}
          </p>
        </div>

        <button
          onClick={() => onFavouriteToggle(!conversation.isFavourite)}
          aria-label={conversation.isFavourite ? t('removeFromFavourites') : t('addToFavourites')}
          className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100"
        >
          <Star className={`size-5 ${conversation.isFavourite ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
      </header>

      <div className="chat-wallpaper flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6">
        {loading ? (
          <div className="grid h-full place-items-center">
            <LoadingSpinner label={t('loadingMessages')} />
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
                      onRead();
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
        showSubject={!replyTarget}
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
