import { Bell, ChevronRight, KeyRound, Lock, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { updateProfile } from '../api/user.api';

export default function Settings() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [compact, setCompact] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (patch: { name?: string; bio?: string }) => {
    await updateProfile(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="mx-auto max-w-2xl p-5 md:p-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#1a66ff]">PhoneMail</p>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Personalise your inbox and conversation experience.</p>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <Link to="/profile" className="flex items-center gap-3 p-4 hover:bg-slate-50">
          <span className="grid size-12 place-items-center rounded-full bg-blue-100 text-lg font-semibold text-[#1a66ff]">
            {(user?.name || 'Y').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-slate-800">{user?.name || 'Your profile'}</strong>
            <span className="block truncate text-xs text-slate-500">{user?.phone}@phonemail.com</span>
          </span>
          <ChevronRight className="size-5 text-slate-400" />
        </Link>
      </section>

      <div className="mt-5 space-y-3">
        <SettingRow icon={Bell} title="Notifications" description="Get notified about new messages">
          <button onClick={() => setNotifications((value) => !value)} className={`h-6 w-11 rounded-full p-1 transition ${notifications ? 'bg-[#1a66ff]' : 'bg-slate-300'}`}>
            <span className={`block size-4 rounded-full bg-white transition ${notifications ? 'translate-x-5' : ''}`} />
          </button>
        </SettingRow>
        <SettingRow icon={SlidersHorizontal} title="Compact conversations" description="Show more messages in the chat list">
          <button onClick={() => setCompact((value) => !value)} className={`h-6 w-11 rounded-full p-1 transition ${compact ? 'bg-[#1a66ff]' : 'bg-slate-300'}`}>
            <span className={`block size-4 rounded-full bg-white transition ${compact ? 'translate-x-5' : ''}`} />
          </button>
        </SettingRow>
        <SettingRow icon={KeyRound} title="Password" description="Use a password as an alternative to OTP">
          <span className="text-xs text-emerald-600">Available at login</span>
        </SettingRow>
        <SettingRow icon={Lock} title="Privacy" description="Your PhoneMail conversations are private" />
        <SettingRow icon={Palette} title="Appearance" description="PhoneMail uses a light, WhatsApp-inspired theme" />
        <SettingRow icon={ShieldCheck} title="Account security" description="Phone number verification is required for recovery" />
      </div>
      <button onClick={() => save({})} className="mt-5 text-sm font-medium text-[#1a66ff]">
        {saved ? 'Saved' : 'Save preferences'}
      </button>
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, children }: { icon: typeof Bell; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-[#1a66ff]"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">{title}</strong><span className="text-xs text-slate-500">{description}</span></span>
      {children}
    </div>
  );
}
