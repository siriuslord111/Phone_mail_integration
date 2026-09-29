import type { Attachment, Conversation, ConversationAction, Folder, MailFilter, Message, MessageAction, SendPayload } from '../types';
import { DEMO_MODE, api, demoDelay } from './axios';
import { CONTACTS, ME, MOCK_CONVERSATIONS, MOCK_MESSAGES } from './mock.data';

// In-memory demo store so sends/reads persist for the session without a backend.
let demoConversations = MOCK_CONVERSATIONS.map((c) => ({ ...c }));
let demoMessages: Record<string, Message[]> = Object.fromEntries(
  Object.entries(MOCK_MESSAGES).map(([id, msgs]) => [id, [...msgs]]),
);
const demoAttachmentFiles = new Map<string, File>();
let nextDemoAttachmentId = 0;
const DEMO_NICKNAMES_KEY = 'phonemail_demo_contact_nicknames';

function loadDemoNicknames(): Map<string, string> {
  try {
    const saved = localStorage.getItem(DEMO_NICKNAMES_KEY);
    if (!saved) return new Map();
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Saved demo nicknames must be an object.');
    }
    return new Map(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch (error) {
    console.warn('Could not load saved demo contact nicknames.', error);
    return new Map();
  }
}

let demoNicknames = loadDemoNicknames();
export interface MailDraft {
  id: string;
  recipients: string[];
  subject: string;
  body: string;
  updatedAt: string;
  attachments?: Array<{ id: string; name: string; mimeType: string; size: number }>;
}
let demoDrafts: MailDraft[] = [];
const demoDraftAttachments = new Map<string, File[]>();

export interface SharedContentItem {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  createdAt: string;
  conversation: string;
  direction: 'in' | 'out';
  url?: string;
}

function demoContactKey(phone: string) {
  return phone.replace(/\D/g, '');
}

function persistDemoMail() {
  sessionStorage.setItem('phonemail_demo_mail', JSON.stringify({ conversations: demoConversations, messages: demoMessages }));
}

/** GET /conversations?filter=&q= */
export async function listConversations(filter: MailFilter = 'all', query = '', folder: Folder = 'inbox'): Promise<Conversation[]> {
  if (DEMO_MODE) {
    await demoDelay(300);
    const q = query.trim().toLowerCase();
    const conversations = folder === 'drafts' ? [] : demoConversations
      .filter((c) => {
        const mail = demoMessages[c.id] ?? [];
        const mailbox = folder === 'inbox' ? ['inbox', 'sent'] : [folder];
        return mail.some((message) => mailbox.includes(message.mailbox ?? (message.direction === 'out' ? 'sent' : 'inbox')));
      })
      .map((conversation) => {
        const mailbox = folder === 'inbox' ? ['inbox', 'sent'] : [folder];
        const messages = (demoMessages[conversation.id] ?? []).filter((message) =>
          mailbox.includes(message.mailbox ?? (message.direction === 'out' ? 'sent' : 'inbox')),
        );
        const latest = messages.reduce((current, message) =>
          message.createdAt > current.createdAt ? message : current,
        );
        return {
          ...conversation,
          title: demoNicknames.get(demoContactKey(conversation.participants[0]?.phone ?? ''))
            || conversation.title,
          actualName: conversation.actualName ?? conversation.title,
          nickname: demoNicknames.get(demoContactKey(conversation.participants[0]?.phone ?? '')) ?? '',
          lastMessage: {
            preview: latest.body,
            subject: latest.subject,
            createdAt: latest.createdAt,
            hasAttachment: Boolean(latest.attachments?.length),
            direction: latest.direction,
          },
          unreadCount: messages.filter((message) => message.direction === 'in' && !message.read).length,
          isFavourite: messages.some((message) => message.isStarred),
          hasAttachments: messages.some((message) => Boolean(message.attachments?.length)),
        };
      })
      .filter((conversation) => {
        if (filter === 'unread' && conversation.unreadCount === 0) return false;
        if (filter === 'favourites' && !conversation.isFavourite) return false;
        if (filter === 'attachments' && !conversation.hasAttachments) return false;
        if (!q) return true;
        return (
          conversation.title.toLowerCase().includes(q) ||
          conversation.participants.some((p) => p.phone.includes(q) || p.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => +new Date(b.lastMessage.createdAt) - +new Date(a.lastMessage.createdAt));
    return conversations;
  }

  const { data } = await api.get('/conversations', { params: { filter, q: query || undefined, folder } });
  return data.conversations ?? data;
}

export async function listDrafts(): Promise<MailDraft[]> {
  if (DEMO_MODE) return demoDrafts.map((draft) => ({ ...draft, attachments: draft.attachments ?? [] }));
  const { data } = await api.get('/drafts');
  return (data.drafts as Array<Omit<MailDraft, 'attachments'> & { attachments?: MailDraft['attachments'] }>).map((draft) => ({
    ...draft,
    attachments: draft.attachments ?? [],
  }));
}

export async function saveDraft(draft: Partial<MailDraft> & Pick<MailDraft, 'recipients' | 'subject' | 'body'> & { files?: File[] }): Promise<MailDraft> {
  if (DEMO_MODE) {
    const id = draft.id ?? `draft-${Date.now()}`;
    const files = draft.files ?? [];
    demoDraftAttachments.set(id, files);
    const saved: MailDraft = {
      id,
      recipients: draft.recipients,
      subject: draft.subject,
      body: draft.body,
      updatedAt: new Date().toISOString(),
      attachments: files.map((file, index) => ({
        id: `${id}-${index}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      })),
    };
    demoDrafts = [saved, ...demoDrafts.filter((item) => item.id !== saved.id)];
    return saved;
  }
  const form = new FormData();
  if (draft.id) form.append('id', draft.id);
  form.append('recipients', JSON.stringify(draft.recipients));
  form.append('subject', draft.subject);
  form.append('body', draft.body);
  draft.files?.forEach((file) => form.append('attachments', file));
  const { data } = await api.post('/drafts', form);
  return data.draft;
}

export async function getDraftAttachment(draftId: string, attachmentId: string, filename: string, mimeType: string): Promise<File> {
  if (DEMO_MODE) {
    const index = Number(attachmentId.slice(draftId.length + 1));
    const file = demoDraftAttachments.get(draftId)?.[index];
    if (!file) throw new Error('Draft attachment was not found.');
    return file;
  }
  const { data } = await api.get(`/drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    responseType: 'blob',
  });
  return new File([data as Blob], filename, { type: mimeType });
}

export async function deleteDraft(id: string): Promise<void> {
  if (DEMO_MODE) {
    demoDrafts = demoDrafts.filter((draft) => draft.id !== id);
    demoDraftAttachments.delete(id);
    return;
  }
  await api.delete(`/drafts/${id}`);
}

export async function updateMessage(messageId: string, action: MessageAction): Promise<Message> {
  if (DEMO_MODE) {
    await demoDelay(150);
    for (const messages of Object.values(demoMessages)) {
      const message = messages.find((item) => item.id === messageId);
      if (!message) continue;
      if (action === 'star') message.isStarred = !message.isStarred;
      if (action === 'spam') message.mailbox = 'spam';
      if (action === 'trash') message.mailbox = 'trash';
      if (action === 'restore') message.mailbox = 'inbox';
      if (action === 'delete') messages.splice(messages.indexOf(message), 1);
      if (action === 'markRead') message.read = true;
      persistDemoMail();
      return message;
    }
    throw new Error('Message not found.');
  }
  const { data } = await api.patch(`/messages/${messageId}`, { action });
  return data.message ?? data;
}

export async function updateConversationAction(conversationId: string, action: ConversationAction): Promise<void> {
  if (DEMO_MODE) {
    await demoDelay(180);
    const conversation = demoConversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    const conversationMessages = demoMessages[conversationId] ?? [];
    if (action === 'delete') {
      conversationMessages.forEach((message) => { message.mailbox = 'trash'; });
    } else if (action === 'spam') {
      conversationMessages.forEach((message) => { message.mailbox = 'spam'; });
    } else {
      conversationMessages.forEach((message) => {
        if (message.direction === 'in') message.read = action === 'markRead';
      });
    }
    persistDemoMail();
    return;
  }
  await api.patch(`/conversations/${encodeURIComponent(conversationId)}/actions`, { action });
}

/** GET /conversations/:id/messages */
export async function getMessages(conversationId: string): Promise<Message[]> {
  if (DEMO_MODE) {
    await demoDelay(250);
    const conv = demoConversations.find((c) => c.id === conversationId);
    if (conv) conv.unreadCount = 0; // opening a chat marks it read, like WhatsApp
    return (demoMessages[conversationId] ?? []).map((message) => ({
      ...message,
      isGroup: conv?.isGroup ?? message.isGroup,
      senderName: conv?.isGroup
        ? conv.participants.find((participant) => participant.phone === message.fromPhone)?.name
        : message.senderName,
    }));
  }
  const { data } = await api.get(`/conversations/${conversationId}/messages`);
  return data.messages ?? data;
}

/** POST /messages — send a chat reply or a new/traditional email */
export async function sendMessage(payload: SendPayload): Promise<Message> {
  if (DEMO_MODE) {
    await demoDelay(400);
    const isGroup = payload.to.length > 1;
    const toPhone = payload.to[0];
    let conv = payload.conversationId
      ? demoConversations.find((item) => item.id === payload.conversationId)
      : isGroup
        ? demoConversations.find((item) => item.isGroup
          && item.participants.filter((participant) => participant.phone !== ME).length === payload.to.length
          && payload.to.every((phone) => item.participants.some((participant) => participant.phone === phone)))
        : demoConversations.find((item) => !item.isGroup
          && item.participants.some((participant) => participant.phone === toPhone));

    if (!conv) {
      conv = {
        id: `c${demoConversations.length + 1}-${Date.now()}`,
        title: isGroup
          ? payload.to.map((p) => CONTACTS[p] ?? p).join(', ')
          : CONTACTS[toPhone] ?? toPhone,
        isGroup,
        participants: [
          ...payload.to.map((phone) => ({ phone, name: CONTACTS[phone] ?? phone })),
          ...(isGroup ? [{ phone: ME, name: 'You' }] : []),
        ],
        lastMessage: { preview: '', createdAt: new Date().toISOString(), hasAttachment: false, direction: 'out' },
        unreadCount: 0,
        isFavourite: false,
        hasAttachments: false,
      };
      demoConversations = [conv, ...demoConversations];
      demoMessages[conv.id] = [];
    }

    const original = payload.inReplyTo
      ? demoMessages[conv.id]?.find((m) => m.id === payload.inReplyTo)
      : undefined;
    if (original) original.replied = true;

    const msg: Message = {
      id: `m-${Date.now()}`,
      conversationId: conv.id,
      direction: 'out',
      fromPhone: ME,
      subject: payload.subject,
      body: payload.body,
      createdAt: new Date().toISOString(),
      isReply: Boolean(payload.inReplyTo),
      inReplyToId: payload.inReplyTo,
      quotedText: original?.body,
      status: 'sent',
      attachments: payload.attachments?.map((file) => {
        const id = `demo-file-${Date.now()}-${nextDemoAttachmentId++}`;
        demoAttachmentFiles.set(id, file);
        return {
          id,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          url: `/api/attachments/${encodeURIComponent(id)}`,
        };
      }),
    };
    if (isGroup) msg.isGroup = true;

    demoMessages[conv.id] = [...(demoMessages[conv.id] ?? []), msg];
    conv.lastMessage = {
      preview: payload.body,
      subject: payload.subject,
      createdAt: msg.createdAt,
      hasAttachment: Boolean(msg.attachments?.length),
      direction: 'out',
    };
    persistDemoMail();
    return msg;
  }

  const form = new FormData();
  payload.to.forEach((recipient) => form.append('to[]', recipient));
  if (payload.conversationId) form.append('conversationId', payload.conversationId);
  if (payload.subject) form.append('subject', payload.subject);
  if (payload.inReplyTo) form.append('inReplyTo', payload.inReplyTo);
  if (payload.quotedText) form.append('quotedText', payload.quotedText);
  form.append('body', payload.body);
  payload.attachments?.forEach((file) => form.append('attachments', file));

  const { data } = payload.attachments?.length
    ? await api.post('/messages', form)
    : await api.post('/messages', {
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        conversationId: payload.conversationId,
        inReplyTo: payload.inReplyTo,
        quotedText: payload.quotedText,
      });
  return data.message ?? data;
}

export async function downloadAttachment(id: string, filename: string): Promise<void> {
  const data = DEMO_MODE
    ? demoAttachmentFiles.get(id)
    : (await api.get(`/attachments/${encodeURIComponent(id)}`, { responseType: 'blob' })).data as Blob;
  if (!data) throw new Error('This attachment is no longer available.');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function isPreviewableAttachment(attachment: Pick<Attachment, 'name'> & Partial<Pick<Attachment, 'mimeType'>>) {
  const mimeType = attachment.mimeType?.toLowerCase().split(';', 1)[0];
  if (mimeType && ['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
    return true;
  }
  return /\.(?:pdf|txt|jpe?g|png|gif|webp)$/i.test(attachment.name);
}

export async function openAttachment(id: string, filename: string): Promise<void> {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) throw new Error('Allow pop-ups to open this attachment.');
  previewWindow.opener = null;

  try {
    const data = DEMO_MODE
      ? demoAttachmentFiles.get(id)
      : (await api.get(`/attachments/${encodeURIComponent(id)}`, { responseType: 'blob' })).data as Blob;
    if (!data) throw new Error('This attachment is no longer available.');
    const suppliedType = data.type.toLowerCase().split(';', 1)[0];
    const extensionType: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const extension = filename.split('.').pop()?.toLowerCase();
    const mimeType = ['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(suppliedType)
      ? suppliedType
      : extensionType[extension ?? ''] ?? suppliedType;
    if (!['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
      throw new Error('Preview is unavailable for this file type. Download it to open it.');
    }

    const preview = suppliedType === mimeType ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(preview);
    previewWindow.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    previewWindow.close();
    throw error;
  }
}

export async function listSharedContent(): Promise<SharedContentItem[]> {
  if (DEMO_MODE) {
    await demoDelay(150);
    return Object.entries(demoMessages).flatMap(([conversationId, messages]) => {
      const conversation = demoConversations.find((item) => item.id === conversationId);
      return messages.flatMap((message) => (message.attachments ?? []).map((attachment) => ({
        ...attachment,
        createdAt: message.createdAt,
        conversation: conversation?.title ?? conversationId,
        direction: message.direction,
      })));
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  const { data } = await api.get('/shared-content');
  return data.attachments ?? [];
}

/** PATCH /conversations/:id  { isFavourite } */
export async function toggleFavourite(conversationId: string, value: boolean): Promise<void> {
  if (DEMO_MODE) {
    await demoDelay(150);
    const conv = demoConversations.find((c) => c.id === conversationId);
    if (conv) conv.isFavourite = value;
    return;
  }

  await api.patch(`/conversations/${conversationId}`, { isFavourite: value });
}

export async function updateConversation(
  conversationId: string,
  patch: Pick<Conversation, 'title' | 'avatarUrl' | 'description'>,
): Promise<Conversation> {
  if (DEMO_MODE) {
    await demoDelay(180);
    const conversation = demoConversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');
    Object.assign(conversation, patch);
    persistDemoMail();
    return conversation;
  }
  const { data } = await api.patch(`/conversations/${conversationId}`, patch);
  return data.conversation ?? data;
}

export async function saveContactNickname(phone: string, nickname: string): Promise<string> {
  if (DEMO_MODE) {
    await demoDelay(120);
    const key = demoContactKey(phone);
    if (!key) throw new Error('Choose a valid contact to save a nickname for.');
    const nextNicknames = new Map(demoNicknames);
    if (nickname.trim()) nextNicknames.set(key, nickname.trim());
    else nextNicknames.delete(key);
    localStorage.setItem(DEMO_NICKNAMES_KEY, JSON.stringify(Object.fromEntries(nextNicknames)));
    demoNicknames = nextNicknames;
    return nickname.trim();
  }
  const { data } = await api.patch(`/contacts/${encodeURIComponent(phone)}/nickname`, { nickname });
  return data.nickname;
}

/** Resolve a phone number to a display name, for the "To" field while composing. */
export function lookupName(phone: string): string {
  return CONTACTS[phone] ?? phone;
}
