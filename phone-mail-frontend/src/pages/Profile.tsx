import { Camera, FileText, Image, Link2, PlaySquare } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { updateProfile } from '../api/user.api';

export default function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await updateProfile({ name: name.trim(), bio: bio.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="mx-auto max-w-2xl p-5 md:p-8">
      <div className="rounded-3xl bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="relative grid size-20 place-items-center rounded-full bg-white/20 text-3xl font-semibold ring-2 ring-white/70">
            {(name || 'Y').slice(0, 1).toUpperCase()}
            <button aria-label="Change profile picture" className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-white text-[#1a66ff]"><Camera className="size-4" /></button>
          </div>
          <div><h1 className="text-xl font-semibold">{name || 'Your profile'}</h1><p className="text-sm text-blue-100">{user?.phone}@phonemail.com</p></div>
        </div>
      </div>
      <div className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <label className="block text-sm font-medium text-slate-600">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" /></label>
        <label className="block text-sm font-medium text-slate-600">About<input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Available for messages" className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 outline-none ring-1 ring-slate-200 focus:ring-[#1a66ff]" /></label>
        <button onClick={save} className="rounded-xl bg-[#1a66ff] px-4 py-2 text-sm font-semibold text-white">{saved ? 'Saved' : 'Save profile'}</button>
      </div>
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold text-slate-800">Shared content</h2>
        <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
          <Shared icon={Image} label="Photos" /><Shared icon={FileText} label="Files" /><Shared icon={Link2} label="Links" /><Shared icon={PlaySquare} label="Media" />
        </div>
        <p className="mt-4 text-sm text-slate-400">Shared media and files from this conversation will appear here.</p>
      </div>
    </div>
  );
}

function Shared({ icon: Icon, label }: { icon: typeof Image; label: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><Icon className="mx-auto mb-1 size-5 text-[#1a66ff]" />{label}</div>;
}
