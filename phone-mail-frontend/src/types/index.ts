export type Folder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';
export type MailFilter = 'all' | 'unread' | 'favourites' | 'attachments';

export interface User {
  id: string;
  phone: string; // 10 digits, e.g. "9876543211"
  name: string;  // empty until onboarding "What's your name?" is done
  avatarUrl?: string;
  bio?: string;
}

export interface Participant {
  phone: string;
  name: string;
  online?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  size: number; // bytes
  url?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  fromPhone: string;
  subject?: string;
  body: string;
  createdAt: string; // ISO
  /** true when this message is a reply to another message */
  isReply?: boolean;
  inReplyToId?: string;
  /** Snippet of the original message shown in the blue quote chip */
  quotedText?: string;
  /** "Each message can be replied to only once" */
  replied?: boolean;
  isStarred?: boolean;
  mailbox?: 'inbox' | 'sent' | 'spam' | 'trash';
  read?: boolean;
  attachments?: Attachment[];
  status?: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  title: string;
  isGroup: boolean;
  avatarUrl?: string;
  description?: string;
  participants: Participant[];
  lastMessage: {
    preview: string;
    subject?: string;
    createdAt: string;
    hasAttachment: boolean;
    direction: 'in' | 'out';
  };
  unreadCount: number;
  isFavourite: boolean;
  hasAttachments: boolean;
}

export interface SendPayload {
  to: string[];
  cc?: string[];
  subject?: string;
  body: string;
  inReplyTo?: string;
  attachments?: File[];
}

export type MessageAction = 'star' | 'spam' | 'trash' | 'restore' | 'delete' | 'markRead';
