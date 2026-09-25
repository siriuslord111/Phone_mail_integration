import type { Conversation, Message } from '../types';

/** The signed-in demo user is 9876543210. Everyone else below is a contact. */
export const ME = '9876543210';

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const CONTACTS: Record<string, string> = {
  '9876543211': 'Rahul Mehta',
  '9876543212': 'Priya Sharma',
  '9876500021': 'Arun Kumar',
  '1800111999': 'HDFC Bank',
  '1800258999': 'Passport Seva',
};

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    title: 'Rahul Mehta',
    isGroup: false,
    participants: [{ phone: '9876543211', name: 'Rahul Mehta', online: true }],
    lastMessage: {
      preview: 'Are we meeting tomorrow?',
      subject: 'Project Meeting',
      createdAt: hoursAgo(1),
      hasAttachment: false,
      direction: 'in',
    },
    unreadCount: 2,
    isFavourite: true,
    hasAttachments: false,
  },
  {
    id: 'c2',
    title: 'Priya Sharma',
    isGroup: false,
    participants: [{ phone: '9876543212', name: 'Priya Sharma' }],
    lastMessage: {
      preview: "Here's the project document.",
      createdAt: daysAgo(1),
      hasAttachment: true,
      direction: 'in',
    },
    unreadCount: 0,
    isFavourite: false,
    hasAttachments: true,
  },
  {
    id: 'c3',
    title: 'Team Alpha',
    isGroup: true,
    participants: [
      { phone: '9876543211', name: 'Rahul Mehta' },
      { phone: '9876543212', name: 'Priya Sharma' },
      { phone: '9876500021', name: 'Arun Kumar' },
      { phone: ME, name: 'You' },
    ],
    lastMessage: {
      preview: "Tomorrow's meeting is at 10.",
      createdAt: daysAgo(1),
      hasAttachment: false,
      direction: 'in',
    },
    unreadCount: 5,
    isFavourite: false,
    hasAttachments: false,
  },
  {
    id: 'c4',
    title: 'HDFC Bank',
    isGroup: false,
    participants: [{ phone: '1800111999', name: 'HDFC Bank' }],
    lastMessage: {
      preview: 'Please find attached your account statement for September.',
      createdAt: hoursAgo(5),
      hasAttachment: true,
      direction: 'in',
    },
    unreadCount: 0,
    isFavourite: false,
    hasAttachments: true,
  },
  {
    id: 'c5',
    title: 'Arun Kumar',
    isGroup: false,
    participants: [{ phone: '9876500021', name: 'Arun Kumar', online: false }],
    lastMessage: {
      preview: 'Thanks for the update, will revert soon.',
      createdAt: daysAgo(4),
      hasAttachment: false,
      direction: 'out',
    },
    unreadCount: 0,
    isFavourite: true,
    hasAttachments: false,
  },
  {
    id: 'c6',
    title: 'Passport Seva',
    isGroup: false,
    participants: [{ phone: '1800258999', name: 'Passport Seva' }],
    lastMessage: {
      preview: 'Please find attached the latest update on your application.',
      createdAt: hoursAgo(26),
      hasAttachment: true,
      direction: 'in',
    },
    unreadCount: 1,
    isFavourite: false,
    hasAttachments: true,
  },
];

export const MOCK_MESSAGES: Record<string, Message[]> = {
  c1: [
    {
      id: 'm1',
      conversationId: 'c1',
      direction: 'in',
      fromPhone: '9876543211',
      subject: 'Project Meeting',
      body: 'Hey there, are you free tomorrow to sync on the PhoneMail launch plan?',
      createdAt: hoursAgo(3),
      replied: true,
    },
    {
      id: 'm2',
      conversationId: 'c1',
      direction: 'out',
      fromPhone: ME,
      body: 'Yes, after 5 PM works great for me.',
      createdAt: hoursAgo(2.5),
      isReply: true,
      inReplyToId: 'm1',
      quotedText: 'Hey there, are you free tomorrow to sync on the PhoneMail launch plan?',
      status: 'read',
    },
    {
      id: 'm3',
      conversationId: 'c1',
      direction: 'in',
      fromPhone: '9876543211',
      body: 'Perfect. Are we meeting tomorrow at the office or over a call?',
      createdAt: hoursAgo(1),
    },
  ],
  c2: [
    {
      id: 'm4',
      conversationId: 'c2',
      direction: 'in',
      fromPhone: '9876543212',
      subject: 'Design files',
      body: "Here's the project document, let me know if anything is missing.",
      createdAt: daysAgo(1),
      attachments: [{ id: 'a1', name: 'project-brief.pdf', size: 482_000 }],
    },
  ],
  c3: [
    {
      id: 'm5',
      conversationId: 'c3',
      direction: 'in',
      fromPhone: '9876543211',
      subject: 'Sprint sync',
      body: "Tomorrow's meeting is at 10. Conference room B.",
      createdAt: daysAgo(1),
    },
  ],
  c4: [
    {
      id: 'm6',
      conversationId: 'c4',
      direction: 'in',
      fromPhone: '1800111999',
      subject: 'Your September statement',
      body: 'Please find attached your account statement for September.',
      createdAt: hoursAgo(5),
      attachments: [{ id: 'a2', name: 'statement-sep-2026.pdf', size: 210_000 }],
    },
  ],
  c5: [
    {
      id: 'm7',
      conversationId: 'c5',
      direction: 'out',
      fromPhone: ME,
      subject: 'Vendor onboarding',
      body: 'Sharing the onboarding checklist, please review and confirm.',
      createdAt: daysAgo(5),
    },
    {
      id: 'm8',
      conversationId: 'c5',
      direction: 'in',
      fromPhone: '9876500021',
      body: 'Thanks for the update, will revert soon.',
      createdAt: daysAgo(4),
      isReply: true,
      inReplyToId: 'm7',
      quotedText: 'Sharing the onboarding checklist, please review and confirm.',
    },
  ],
  c6: [
    {
      id: 'm9',
      conversationId: 'c6',
      direction: 'in',
      fromPhone: '1800258999',
      subject: 'Application update',
      body: 'Please find attached the latest update on your application status.',
      createdAt: hoursAgo(26),
      attachments: [{ id: 'a3', name: 'application-status.pdf', size: 96_000 }],
    },
  ],
};
