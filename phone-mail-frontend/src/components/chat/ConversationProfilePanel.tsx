import { ArrowLeft, Camera, Download, FileText, Image, Link2, PlaySquare, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/axios';
import { downloadAttachment } from '../../api/email.api';
import type { Attachment, Conversation, Message } from '../../types';
import { getInitials, avatarColor } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageProvider';

interface ConversationProfilePanelProps {
  conversation: Conversation;
  messages: Message[];
  onClose: () => void;
  onSave: (patch: Pick<Conversation, 'title' | 'avatarUrl' | 'description'>) => Promise<void>;
  onSaveNickname: (nickname: string) => Promise<void>;
}

type SharedCategory = 'photos' | 'files' | 'links' | 'media';

const PHOTO_EXTENSIONS = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;
const MEDIA_EXTENSIONS = /\.(aac|flac|m4a|mkv|mov|mp3|mp4|ogg|wav|webm)$/i;
const LINK_PATTERN = /https?:\/\/[^\s<>"']+/gi;

export function ConversationProfilePanel({ conversation, messages, onClose, onSave, onSaveNickname }: ConversationProfilePanelProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(conversation.title);
  const [nickname, setNickname] = useState(conversation.nickname ?? '');
  const [description, setDescription] = useState(conversation.description ?? conversation.participants[0]?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatarUrl ?? conversation.participants[0]?.avatarUrl ?? '');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameSaved, setNicknameSaved] = useState(false);
  const [nicknameError, setNicknameError] = useState('');
  const [sharedCategory, setSharedCategory] = useState<SharedCategory | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const sharedItems = useMemo(() => {
    const photos: Attachment[] = [];
    const files: Attachment[] = [];
    const media: Attachment[] = [];
    const links = new Map<string, string>();

    for (const message of messages) {
      for (const attachment of message.attachments ?? []) {
        if (PHOTO_EXTENSIONS.test(attachment.name)) photos.push(attachment);
        else if (MEDIA_EXTENSIONS.test(attachment.name)) media.push(attachment);
        else files.push(attachment);
      }
      for (const match of message.body.matchAll(LINK_PATTERN)) {
        const url = match[0].replace(/[),.!?;:}\]]+$/, '');
        links.set(url, url);
      }
    }

    return { photos, files, links: [...links.values()], media };
  }, [messages]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (photoOpen) setPhotoOpen(false);
      else onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, photoOpen]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || conversation.title, description: description.trim(), avatarUrl });
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
      setNicknameError(error instanceof Error ? error.message : t('couldNotSaveNickname'));
    } finally {
      setNicknameSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="absolute inset-0 z-30 flex flex-col overflow-y-auto bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <button onClick={onClose} aria-label={t('back')} className="grid size-9 place-items-center rounded-full hover:bg-slate-100"><ArrowLeft className="size-5" /></button>
        <h2 className="font-semibold text-slate-800">{conversation.isGroup ? t('groupInfo') : t('contactInfo')}</h2>
      </header>

      <section className="bg-white px-5 py-6 text-center">
        <div
          role={avatarUrl ? 'button' : undefined}
          tabIndex={avatarUrl ? 0 : undefined}
          aria-label={avatarUrl ? t('viewProfilePicture') : t('profilePicture')}
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
          {conversation.isGroup && (
            <label aria-label={t('changeProfilePicture')} onClick={(event) => event.stopPropagation()} className="absolute bottom-0 right-0 grid size-8 cursor-pointer place-items-center rounded-full bg-[#1a66ff] text-white">
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
        {conversation.isGroup ? (
          <div className="mx-auto mt-4 max-w-sm space-y-2 text-left">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl bg-slate-50 px-3 py-2 text-center font-semibold outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" aria-label={t('groupName')} />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('groupDescriptionPlaceholder')} className="w-full rounded-xl bg-slate-50 px-3 py-2 text-center text-sm outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" aria-label={t('description')} />
          </div>
        ) : (
          <>
            <h3 className="mt-3 text-lg font-semibold text-slate-900">{conversation.title}</h3>
            <p className="text-sm text-slate-500">{conversation.participants[0]?.phone}@phonemail.com</p>
            <label className="mx-auto mt-4 block max-w-sm text-left text-xs font-medium text-slate-500">
              {t('saveNickname')}
              <div className="mt-1 flex gap-2">
                <input
                  value={nickname}
                  onChange={(event) => { setNickname(event.target.value); setNicknameSaved(false); }}
                  maxLength={100}
                  placeholder={conversation.actualName || t('save')}
                  className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]"
                  aria-label={t('privateNickname')}
                />
                <button
                  type="button"
                  onClick={() => void saveNickname()}
                  disabled={nicknameSaving}
                  className="shrink-0 rounded-xl bg-[#1a66ff] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {nicknameSaving ? t('saving') : nicknameSaved ? t('nicknameSaved') : t('save')}
                </button>
              </div>
            </label>
            {nicknameError && <p role="alert" className="mt-2 text-xs text-rose-600">{nicknameError}</p>}
            <p className="mt-4 text-xs text-slate-500">{conversation.actualName || conversation.participants[0]?.name || conversation.title}</p>
            {description && <><p className="mt-2 text-xs font-medium text-slate-500">{t('about')}</p><p className="text-sm text-slate-600">{description}</p></>}
          </>
        )}
      </section>

      {conversation.isGroup && (
        <section className="mt-2 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">{conversation.participants.length} {t('groupParticipants')}</h3>
          </div>
          <div className="space-y-2">
            {conversation.participants.map((member) => (
              <div key={member.phone} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="grid size-9 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-[#1a66ff]">{getInitials(member.name)}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-700">{member.name}</strong><small className="text-xs text-slate-400">{member.phone}</small></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-2 bg-white p-4">
        <h3 className="mb-3 font-semibold text-slate-800">{t('sharedContent')}</h3>
        <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
          <Shared icon={Image} label={t('photos')} count={sharedItems.photos.length} active={sharedCategory === 'photos'} onClick={() => { setSharedCategory('photos'); setAttachmentError(''); }} />
          <Shared icon={FileText} label={t('files')} count={sharedItems.files.length} active={sharedCategory === 'files'} onClick={() => { setSharedCategory('files'); setAttachmentError(''); }} />
          <Shared icon={Link2} label={t('links')} count={sharedItems.links.length} active={sharedCategory === 'links'} onClick={() => { setSharedCategory('links'); setAttachmentError(''); }} />
          <Shared icon={PlaySquare} label={t('media')} count={sharedItems.media.length} active={sharedCategory === 'media'} onClick={() => { setSharedCategory('media'); setAttachmentError(''); }} />
        </div>
        {sharedCategory && (
          <div className="mt-3 space-y-2">
            {sharedCategory === 'links' ? (
              sharedItems.links.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all rounded-lg bg-slate-50 px-3 py-2 text-sm text-[#1a66ff] underline underline-offset-2"
                >
                  {url}
                </a>
              ))
            ) : (
              sharedItems[sharedCategory].map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => {
                    setAttachmentError('');
                    void downloadAttachment(attachment.id, attachment.name).catch((error: unknown) => {
                      setAttachmentError(getErrorMessage(error, t('couldNotDownloadAttachment')));
                    });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
                >
                  <Download className="size-4 shrink-0 text-[#1a66ff]" />
                  <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                </button>
              ))
            )}
            {sharedItems[sharedCategory].length === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">{t('noSharedItems')}</p>
            )}
            {attachmentError && <p role="alert" className="text-sm text-rose-600">{attachmentError}</p>}
          </div>
        )}
      </section>

      {conversation.isGroup && <button disabled={saving} onClick={save} className="m-4 rounded-xl bg-[#1a66ff] py-3 font-semibold text-white disabled:opacity-60">{saving ? t('saving') : t('saveGroupChanges')}</button>}
      <button onClick={onClose} aria-label={t('closeProfile')} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
      {photoOpen && avatarUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('profilePicture')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPhotoOpen(false)}
        >
          <button
            type="button"
            aria-label={t('closeEnlargedPicture')}
            className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
            onClick={() => setPhotoOpen(false)}
          >
            <X className="size-6" />
          </button>
          <img
            src={avatarUrl}
            alt={t('profilePicture')}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Shared({ icon: Icon, label, count, active, onClick }: { icon: typeof Image; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl p-3 transition-colors ${active ? 'bg-blue-50 text-[#1a66ff] ring-1 ring-blue-200' : 'bg-slate-50 hover:bg-blue-50'}`}
    >
      <Icon className="mx-auto mb-1 size-5 text-[#1a66ff]" />
      {label}
      <span className="ml-1">({count})</span>
    </button>
  );
}
