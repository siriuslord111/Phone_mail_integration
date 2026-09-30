import { Camera, FileText, Image, Link2, PlaySquare, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageProvider';
import { listSharedContent, type SharedContentItem } from '../api/email.api';
import { getErrorMessage } from '../api/axios';
import { SharedFileActions } from '../components/common/SharedFileActions';

type SharedCategory = 'photos' | 'files' | 'links' | 'media';

const PHOTO_EXTENSIONS = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;
const MEDIA_EXTENSIONS = /\.(aac|flac|m4a|mkv|mov|mp3|mp4|ogg|wav|webm)$/i;

function getSharedCategory(file: SharedContentItem): Exclude<SharedCategory, 'links'> {
  const mimeType = file.mimeType?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/') || PHOTO_EXTENSIONS.test(file.name)) return 'photos';
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/') || MEDIA_EXTENSIONS.test(file.name)) return 'media';
  return 'files';
}

export default function Profile() {
  const { user, saveProfile } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sharedFiles, setSharedFiles] = useState<SharedContentItem[]>([]);
  const [sharedLoading, setSharedLoading] = useState(true);
  const [sharedError, setSharedError] = useState('');
  const [sharedCategory, setSharedCategory] = useState<SharedCategory | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name || '');
    setBio(user?.bio || '');
    setAvatarUrl(user?.avatarUrl || '');
  }, [user?.name, user?.bio, user?.avatarUrl]);

  useEffect(() => {
    let cancelled = false;
    void listSharedContent()
      .then((files) => {
        if (!cancelled) setSharedFiles(files);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setSharedError(getErrorMessage(loadError, t('couldNotLoadSharedFiles')));
        }
      })
      .finally(() => {
        if (!cancelled) setSharedLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  const selectPhoto = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError(t('chooseValidImage'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('photoLimit'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        setError('');
      } else {
        setError(t('couldNotReadPhoto'));
      }
    };
    reader.onerror = () => setError(t('couldNotReadPhoto'));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveProfile({ name: name.trim(), bio: bio.trim(), avatarUrl });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('couldNotSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  const profileChanged = name.trim() !== (user?.name || '').trim()
    || bio.trim() !== (user?.bio || '').trim()
    || avatarUrl !== (user?.avatarUrl || '');
  const photoFiles = sharedFiles.filter((file) => getSharedCategory(file) === 'photos');
  const mediaFiles = sharedFiles.filter((file) => getSharedCategory(file) === 'media');
  const otherFiles = sharedFiles.filter((file) => getSharedCategory(file) === 'files');
  const visibleFiles = sharedCategory === null
    ? sharedFiles
    : sharedCategory === 'photos'
      ? photoFiles
      : sharedCategory === 'files'
        ? otherFiles
        : sharedCategory === 'media'
          ? mediaFiles
          : [];

  return (
    <div className="mx-auto max-w-2xl p-5 md:p-8">
      <div className="rounded-3xl bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] p-6 text-white">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative size-20 shrink-0 overflow-visible">
            <div className="grid size-full place-items-center overflow-hidden rounded-full bg-white/20 text-3xl font-semibold ring-2 ring-white/70">
              {avatarUrl
                ? <img src={avatarUrl} alt={t('profile')} className="size-full object-cover" />
                : (name || user?.phone || '?').slice(0, 1).toUpperCase()}
            </div>
            <button type="button" onClick={() => photoInput.current?.click()} aria-label={t('changeProfilePicture')} className="absolute -bottom-1 -right-1 z-10 grid size-7 place-items-center rounded-full bg-white text-[#1a66ff] shadow ring-2 ring-[#1a66ff]"><Camera className="size-4" /></button>
          </div>
          <div className="min-w-0 flex-1"><h1 className="break-words text-xl font-semibold">{name || t('yourProfile')}</h1><p className="break-all text-sm text-blue-100">{user?.phone}@phonemail.com</p><p className="mt-1 break-words text-sm text-blue-100">{bio || t('availableForMessages')}</p></div>
        </div>
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          selectPhoto(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <div className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <label className="block text-sm font-medium text-slate-600">{t('name')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" /></label>
        <label className="block text-sm font-medium text-slate-600">{t('description')}<input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder={t('availableForMessages')} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" /></label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {avatarUrl && <button type="button" onClick={() => setAvatarUrl('')} className="inline-flex items-center gap-1 text-sm text-slate-500"><X className="size-4" /> {t('removeProfilePhoto')}</button>}
        {profileChanged && <button onClick={save} disabled={saving} className="rounded-xl bg-[#1a66ff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? t('saving') : t('saveProfile')}</button>}
      </div>
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold text-slate-800">{t('sharedContent')}</h2>
        <div className="grid grid-cols-2 gap-2 text-center text-xs text-slate-500 sm:grid-cols-4">
          <Shared icon={Image} label={t('photos')} count={photoFiles.length} active={sharedCategory === 'photos'} onClick={() => setSharedCategory('photos')} />
          <Shared icon={FileText} label={t('files')} count={otherFiles.length} active={sharedCategory === 'files'} onClick={() => setSharedCategory('files')} />
          <Shared icon={Link2} label={t('links')} count={0} active={sharedCategory === 'links'} onClick={() => setSharedCategory('links')} />
          <Shared icon={PlaySquare} label={t('media')} count={mediaFiles.length} active={sharedCategory === 'media'} onClick={() => setSharedCategory('media')} />
        </div>
        {sharedLoading ? (
          <p className="mt-4 text-sm text-slate-400">{t('loadingSharedFiles')}</p>
        ) : sharedError ? (
          <p role="alert" className="mt-4 text-sm text-rose-600">{sharedError || t('couldNotLoadSharedFiles')}</p>
        ) : visibleFiles.length ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {visibleFiles.map((file) => (
              <li key={file.id} className="flex min-w-0 items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
                  <p className="truncate text-xs text-slate-400">{file.conversation}</p>
                </div>
                <SharedFileActions attachment={file} />
              </li>
            ))}
          </ul>
        ) : sharedCategory !== null || sharedFiles.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            {t(sharedCategory === null ? 'noSharedFiles' : 'noSharedItems')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Shared({ icon: Icon, label, count, active, onClick }: {
  icon: typeof Image;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-0 rounded-xl p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a66ff] ${
        active ? 'bg-blue-50 text-[#1a66ff]' : 'bg-slate-50 hover:bg-slate-100'
      }`}
    >
      <Icon className="mx-auto mb-1 size-5 text-[#1a66ff]" />
      <span className="block break-words">{label} ({count})</span>
    </button>
  );
}
