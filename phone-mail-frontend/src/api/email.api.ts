import type { Conversation, MailFilter, Message, MessageAction, SendPayload } from '../types';
import { DEMO_MODE, api, demoDelay } from './axios';
import { CONTACTS, ME, MOCK_CONVERSATIONS, MOCK_MESSAGES } from './mock.data';

// In-memory demo store so sends/reads persist for the session without a backend.
let demoConversations = MOCK_CONVERSATIONS.map((c) => ({ ...c }));
let demoMessages: Record<string, Message[]> = Object.fromEntries(
  Object.entries(MOCK_MESSAGES).map(([id, msgs]) => [id, [...msgs]]),
);

function persistDemoMail() {
  sessionStorage.setItem('phonemail_demo_mail', JSON.stringify({ conversations: demoConversations, messages: demoMessages }));
}

/** GET /conversations?filter=&q= */
export async function listConversations(filter: MailFilter = 'all', query = ''): Promise<Conversation[]> {
  if (DEMO_MODE) {
    await demoDelay(300);
    const q = query.trim().toLowerCase();
    return demoConversations
      .filter((c) => {
        if (filter === 'unread' && c.unreadCount === 0) return false;
        if (filter === 'favourites' && !c.isFavourite) return false;
        if (filter === 'attachments' && !c.hasAttachments) return false;
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.participants.some((p) => p.phone.includes(q) || p.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => +new Date(b.lastMessage.createdAt) - +new Date(a.lastMessage.createdAt));
  }

  const { data } = await api.get('/conversations', { params: { filter, q: query || undefined } });
  return data.conversations ?? data;
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

/** GET /conversations/:id/messages */
export async function getMessages(conversationId: string): Promise<Message[]> {
  if (DEMO_MODE) {
    await demoDelay(250);
    const conv = demoConversations.find((c) => c.id === conversationId);
    if (conv) conv.unreadCount = 0; // opening a chat marks it read, like WhatsApp
    return demoMessages[conversationId] ?? [];
  }
  const { data } = await api.get(`/conversations/${conversationId}/messages`);
  return data.messages ?? data;
}

/** POST /messages — send a chat reply or a new/traditional email */
export async function sendMessage(payload: SendPayload): Promise<Message> {
  if (DEMO_MODE) {
    await demoDelay(400);
    const toPhone = payload.to[0];
    let conv = demoConversations.find(
      (c) => !c.isGroup && c.participants.some((p) => p.phone === toPhone),
    );

    const isGroup = payload.to.length > 1;
    if (!conv) {
      conv = {
        id: `c${demoConversations.length + 1}-${Date.now()}`,
        title: isGroup
          ? payload.to.map((p) => CONTACTS[p] ?? p).join(', ')
          : CONTACTS[toPhone] ?? toPhone,
        isGroup,
        participants: payload.to.map((phone) => ({ phone, name: CONTACTS[phone] ?? phone })),
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
      attachments: payload.attachments?.map((f, i) => ({ id: `f${i}`, name: f.name, size: f.size })),
    };

    demoMessages[conv.id] = [...(demoMessages[conv.id] ?? []), msg];
    conv.lastMessage = {
      preview: payload.body,
      subject: payload.subject,
      createdAt: msg.createdAt,
      hasAttachment: Boolean(msg.attachments?.length),
      direction: 'out',
    };
    return msg;
  }

  const form = new FormData();
  payload.to.forEach((t) => form.append('to[]', t));
  payload.cc?.forEach((c) => form.append('cc[]', c));
  if (payload.subject) form.append('subject', payload.subject);
  form.append('body', payload.body);
  if (payload.inReplyTo) form.append('inReplyTo', payload.inReplyTo);
  payload.attachments?.forEach((f) => form.append('attachments', f));

  const { data } = await api.post('/messages', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.message ?? data;
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
  patch: Pick<Conversation, 'title' | 'avatarUrl' | 'description' | 'participants'>,
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

/** Resolve a phone number to a display name, for the "To" field while composing. */
export function lookupName(phone: string): string {
  return CONTACTS[phone] ?? phone;
}
