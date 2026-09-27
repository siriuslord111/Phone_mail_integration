import {
  Bell,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Lock,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface SettingsOption {
  id: string;
  title: string;
  description: string;
  detail: string;
  icon: LucideIcon;
}

const OPTIONS: SettingsOption[] = [
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Get notified about new messages',
    detail: 'Choose whether PhoneMail should show message notifications.',
    icon: Bell,
  },
  {
    id: 'conversations',
    title: 'Compact conversations',
    description: 'Show more messages in the chat list',
    detail: 'Use a compact layout for conversation lists.',
    icon: SlidersHorizontal,
  },
  {
    id: 'password',
    title: 'Password',
    description: 'Your password protects your PhoneMail account',
    detail: 'Password changes are not available in the app yet. Use the sign-in screen to manage account access.',
    icon: KeyRound,
  },
  {
    id: 'privacy',
    title: 'Privacy',
    description: 'Your PhoneMail conversations are private',
    detail: 'Your messages are associated with your account and are only shown after you sign in.',
    icon: Lock,
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'PhoneMail uses a light, WhatsApp-inspired theme',
    detail: 'The light appearance is currently the only available theme.',
    icon: Palette,
  },
  {
    id: 'security',
    title: 'Account security',
    description: 'Your phone number identifies your account',
    detail: 'Sign-in is protected by your password or a one-time verification code, depending on the method you choose.',
    icon: ShieldCheck,
  },
];

const PREFERENCE_KEYS: Record<string, string> = {
  notifications: 'phonemail_setting_notifications',
  conversations: 'phonemail_setting_compact_conversations',
};

function readPreference(key: string, defaultValue: boolean) {
  const saved = localStorage.getItem(key);
  return saved === null ? defaultValue : saved === 'true';
}

export default function Settings() {
  const { section } = useParams();
  const option = OPTIONS.find((item) => item.id === section);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (option && PREFERENCE_KEYS[option.id]) {
      setEnabled(readPreference(PREFERENCE_KEYS[option.id], option.id === 'notifications'));
    }
  }, [option]);

  if (section) {
    if (!option) {
      return (
        <div className="mx-auto max-w-2xl p-5 md:p-8">
          <Link to="/settings" className="mb-5 inline-flex items-center gap-1 text-sm text-[#1a66ff]">
            <ChevronLeft className="size-4" /> All settings
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">Settings page not found</h1>
        </div>
      );
    }
    const Icon = option.icon;
    const preferenceKey = PREFERENCE_KEYS[option.id];
    return (
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link to="/settings" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-[#1a66ff]">
          <ChevronLeft className="size-4" /> All settings
        </Link>
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-[#1a66ff]">
              <Icon className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{option.title}</h1>
              <p className="text-sm text-slate-500">{option.description}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-600">{option.detail}</p>
          {preferenceKey && (
            <label className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-medium text-slate-700">
              {option.id === 'notifications' ? 'Enable notifications' : 'Use compact conversations'}
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  const value = event.target.checked;
                  setEnabled(value);
                  localStorage.setItem(preferenceKey, String(value));
                }}
                className="size-5 accent-[#1a66ff]"
              />
            </label>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5 md:p-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#1a66ff]">PhoneMail</p>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Personalise your inbox and conversation experience.</p>
      </div>
      <div className="space-y-3">
        {OPTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={`/settings/${item.id}`}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-[#1a66ff]">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-slate-800">{item.title}</strong>
                <span className="text-xs text-slate-500">{item.description}</span>
              </span>
              <ChevronRight className="size-5 text-slate-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
