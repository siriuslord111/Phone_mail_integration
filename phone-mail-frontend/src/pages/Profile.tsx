import { Camera, FileText, Image, Link2, PlaySquare, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageProvider';

export default function Profile() {
  const { user, saveProfile } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name || '');
    setBio(user?.bio || '');
    setAvatarUrl(user?.avatarUrl || '');
  }, [user?.name, user?.bio, user?.avatarUrl]);

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
        setSaved(false);
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
    setSaved(false);
    try {
      await saveProfile({ name: name.trim(), bio: bio.trim(), avatarUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('couldNotSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-5 md:p-8">
      <div className="rounded-3xl bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="relative size-20 overflow-visible">
            <div className="grid size-full place-items-center overflow-hidden rounded-full bg-white/20 text-3xl font-semibold ring-2 ring-white/70">
              {avatarUrl
                ? <img src={avatarUrl} alt={t('profile')} className="size-full object-cover" />
                : (name || user?.phone || '?').slice(0, 1).toUpperCase()}
            </div>
            <button type="button" onClick={() => photoInput.current?.click()} aria-label={t('changeProfilePicture')} className="absolute -bottom-1 -right-1 z-10 grid size-7 place-items-center rounded-full bg-white text-[#1a66ff] shadow ring-2 ring-[#1a66ff]"><Camera className="size-4" /></button>
          </div>
          <div><h1 className="text-xl font-semibold">{name || t('yourProfile')}</h1><p className="text-sm text-blue-100">{user?.phone}@phonemail.com</p><p className="mt-1 text-sm text-blue-100">{bio || t('availableForMessages')}</p></div>
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
        {avatarUrl && <button type="button" onClick={() => { setAvatarUrl(''); setSaved(false); }} className="inline-flex items-center gap-1 text-sm text-slate-500"><X className="size-4" /> {t('removeProfilePhoto')}</button>}
        <button onClick={save} disabled={saving} className="rounded-xl bg-[#1a66ff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? t('saving') : saved ? t('saved') : t('saveProfile')}</button>
      </div>
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold text-slate-800">{t('sharedContent')}</h2>
        <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
          <Shared icon={Image} label={t('photos')} /><Shared icon={FileText} label={t('files')} /><Shared icon={Link2} label={t('links')} /><Shared icon={PlaySquare} label={t('media')} />
        </div>
        <p className="mt-4 text-sm text-slate-400">{t('sharedContentHint')}</p>
      </div>
    </div>
  );
}

function Shared({ icon: Icon, label }: { icon: typeof Image; label: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><Icon className="mx-auto mb-1 size-5 text-[#1a66ff]" />{label}</div>;
}
