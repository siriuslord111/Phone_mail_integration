import { ArrowLeft, Camera, FileText, Image, Link2, PlaySquare, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Conversation, Message, Participant } from '../../types';
import { getInitials, avatarColor } from '../../utils/formatters';

interface ConversationProfilePanelProps {
  conversation: Conversation;
  messages: Message[];
  onClose: () => void;
  onSave: (patch: Pick<Conversation, 'title' | 'avatarUrl' | 'description' | 'participants'>) => Promise<void>;
  onSaveNickname: (nickname: string) => Promise<void>;
}

export function ConversationProfilePanel({ conversation, messages, onClose, onSave, onSaveNickname }: ConversationProfilePanelProps) {
  const [title, setTitle] = useState(conversation.title);
  const [nickname, setNickname] = useState(conversation.nickname ?? '');
  const [description, setDescription] = useState(conversation.description ?? conversation.participants[0]?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatarUrl ?? conversation.participants[0]?.avatarUrl ?? '');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>(conversation.participants);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameSaved, setNicknameSaved] = useState(false);
  const [nicknameError, setNicknameError] = useState('');
  const isAdmin = conversation.isGroup;
  const attachments = messages.flatMap((message) => message.attachments ?? []);

  useEffect(() => {
    if (!photoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhotoOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [photoOpen]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || conversation.title, description: description.trim(), avatarUrl, participants });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const saveNickname = async () => {
    setNicknameSaving(true);
    setNicknameError('');
    setNicknameSaved(false);
    try {
      await onSaveNickname(nickname.trim());
      setNicknameSaved(true);
    } catch (error) {
      setNicknameError(error instanceof Error ? error.message : 'Could not save nickname.');
    } finally {
      setNicknameSaving(false);
    }
  };

  const addMember = () => {
    const normalized = phone.replace(/\D/g, '');
    if (normalized.length !== 10 || participants.some((item) => item.phone === normalized)) return;
    setParticipants((current) => [...current, { phone: normalized, name: normalized }]);
    setPhone('');
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-y-auto bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <button onClick={onClose} aria-label="Back" className="grid size-9 place-items-center rounded-full hover:bg-slate-100"><ArrowLeft className="size-5" /></button>
        <h2 className="font-semibold text-slate-800">{conversation.isGroup ? 'Group info' : 'Contact info'}</h2>
      </header>

      <section className="bg-white px-5 py-6 text-center">
        <div
          role={avatarUrl ? 'button' : undefined}
          tabIndex={avatarUrl ? 0 : undefined}
          aria-label={avatarUrl ? 'View profile picture enlarged' : 'Profile picture'}
          onClick={() => avatarUrl && setPhotoOpen(true)}
          onKeyDown={(event) => {
            if (avatarUrl && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              setPhotoOpen(true);
            }
          }}
          className={`relative mx-auto grid size-24 place-items-center rounded-full bg-cover bg-center text-3xl font-semibold text-white ${avatarUrl ? 'cursor-zoom-in' : ''}`}
          style={{ backgroundColor: avatarColor(conversation.title), backgroundImage: avatarUrl ? `url("${avatarUrl}")` : undefined }}
        >
          {!avatarUrl && getInitials(conversation.actualName || conversation.title)}
          {isAdmin && (
            <label aria-label="Change group picture" onClick={(event) => event.stopPropagation()} className="absolute bottom-0 right-0 grid size-8 cursor-pointer place-items-center rounded-full bg-[#1a66ff] text-white">
              <Camera className="size-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setAvatarUrl(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
        </div>
        {isAdmin ? (
          <div className="mx-auto mt-4 max-w-sm space-y-2 text-left">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl bg-slate-50 px-3 py-2 text-center font-semibold outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" aria-label="Group name" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add group description" className="w-full rounded-xl bg-slate-50 px-3 py-2 text-center text-sm outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" aria-label="Group description" />
          </div>
        ) : (
          <>
            <h3 className="mt-3 text-lg font-semibold text-slate-900">{conversation.title}</h3>
            <p className="text-sm text-slate-500">{conversation.participants[0]?.phone}@phonemail.com</p>
            <label className="mx-auto mt-4 block max-w-sm text-left text-xs font-medium text-slate-500">
              Save a nickname (only you can see this)
              <div className="mt-1 flex gap-2">
                <input
                  value={nickname}
                  onChange={(event) => { setNickname(event.target.value); setNicknameSaved(false); }}
                  maxLength={100}
                  placeholder={conversation.actualName || 'Save a nickname'}
                  className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]"
                  aria-label="Your private nickname for this contact"
                />
                <button
                  type="button"
                  onClick={() => void saveNickname()}
                  disabled={nicknameSaving}
                  className="shrink-0 rounded-xl bg-[#1a66ff] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {nicknameSaving ? 'Saving…' : nicknameSaved ? 'Saved' : 'Save'}
                </button>
              </div>
            </label>
            {nicknameError && <p role="alert" className="mt-2 text-xs text-rose-600">{nicknameError}</p>}
            <p className="mt-4 text-xs text-slate-500">{conversation.actualName || conversation.participants[0]?.name || conversation.title}</p>
            {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
          </>
        )}
      </section>

      {conversation.isGroup && (
        <section className="mt-2 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">{participants.length} members</h3>
            <span className="text-xs text-emerald-600">You are admin</span>
          </div>
          <div className="mb-3 flex gap-2">
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-200" />
            <button onClick={addMember} className="grid size-10 place-items-center rounded-xl bg-blue-50 text-[#1a66ff]" aria-label="Add member"><UserPlus className="size-4" /></button>
          </div>
          <div className="space-y-2">
            {participants.map((member) => (
              <div key={member.phone} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="grid size-9 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-[#1a66ff]">{getInitials(member.name)}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-700">{member.name}</strong><small className="text-xs text-slate-400">{member.phone}</small></span>
                {member.phone !== '9876543210' && <button onClick={() => setParticipants((current) => current.filter((item) => item.phone !== member.phone))} aria-label={`Remove ${member.name}`} className="text-slate-400 hover:text-rose-500"><UserMinus className="size-4" /></button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-2 bg-white p-4">
        <h3 className="mb-3 font-semibold text-slate-800">Shared content</h3>
        <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
          <Shared icon={Image} label="Photos" /><Shared icon={FileText} label="Files" count={attachments.length} /><Shared icon={Link2} label="Links" /><Shared icon={PlaySquare} label="Media" />
        </div>
        {attachments.length > 0 && <div className="mt-3 space-y-2">{attachments.map((attachment) => <div key={attachment.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{attachment.name}</div>)}</div>}
      </section>

      {isAdmin && <button disabled={saving} onClick={save} className="m-4 rounded-xl bg-[#1a66ff] py-3 font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save group changes'}</button>}
      <button onClick={onClose} aria-label="Close profile" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
      {photoOpen && avatarUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${conversation.actualName || conversation.title}'s profile picture`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPhotoOpen(false)}
        >
          <button
            type="button"
            aria-label="Close enlarged profile picture"
            className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
            onClick={() => setPhotoOpen(false)}
          >
            <X className="size-6" />
          </button>
          <img
            src={avatarUrl}
            alt={`${conversation.actualName || conversation.title}'s profile`}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Shared({ icon: Icon, label, count }: { icon: typeof Image; label: string; count?: number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><Icon className="mx-auto mb-1 size-5 text-[#1a66ff]" />{label}{count ? ` (${count})` : ''}</div>;
}
