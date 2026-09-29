import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Globe,
  KeyRound,
  Lock,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../context/LanguageProvider';
import { isLanguageCode, LANGUAGES, type TranslationKey } from '../utils/i18n';
import { applyDarkMode } from '../utils/theme';

interface SettingsOption {
  id: string;
  title: TranslationKey;
  description: TranslationKey;
  detail: TranslationKey;
  icon: LucideIcon;
}

const OPTIONS: SettingsOption[] = [
  {
    id: 'notifications',
    title: 'notifications',
    description: 'notificationDescription',
    detail: 'notificationDetail',
    icon: Bell,
  },
  {
    id: 'conversations',
    title: 'compactConversations',
    description: 'compactDescription',
    detail: 'compactDetail',
    icon: SlidersHorizontal,
  },
  {
    id: 'password',
    title: 'password',
    description: 'passwordSettingDescription',
    detail: 'passwordSettingDetail',
    icon: KeyRound,
  },
  {
    id: 'privacy',
    title: 'privacy',
    description: 'privacyDescription',
    detail: 'privacyDetail',
    icon: Lock,
  },
  {
    id: 'appearance',
    title: 'appearance',
    description: 'appearanceDescription',
    detail: 'appearanceDetail',
    icon: Palette,
  },
  {
    id: 'security',
    title: 'security',
    description: 'securityDescription',
    detail: 'securityDetail',
    icon: ShieldCheck,
  },
  {
    id: 'language',
    title: 'language',
    description: 'languageDescription',
    detail: 'languageDetail',
    icon: Globe,
  },
];

const PREFERENCE_KEYS: Record<string, string> = {
  notifications: 'phonemail_setting_notifications',
  conversations: 'phonemail_setting_compact_conversations',
  appearance: 'phonemail_setting_dark_mode',
};

function readPreference(key: string, defaultValue: boolean) {
  const saved = localStorage.getItem(key);
  return saved === null ? defaultValue : saved === 'true';
}

export default function Settings() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const option = OPTIONS.find((item) => item.id === section);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!section) return;
    const goBackOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      navigate('/settings');
    };
    document.addEventListener('keydown', goBackOnEscape);
    return () => document.removeEventListener('keydown', goBackOnEscape);
  }, [navigate, section]);

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
            <ChevronLeft className="size-4" /> {t('allSettings')}
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">{t('settingsNotFound')}</h1>
        </div>
      );
    }
    const Icon = option.icon;
    const preferenceKey = PREFERENCE_KEYS[option.id];
    return (
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link to="/settings" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-[#1a66ff]">
          <ChevronLeft className="size-4" /> {t('allSettings')}
        </Link>
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-[#1a66ff]">
              <Icon className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{t(option.title)}</h1>
              <p className="text-sm text-slate-500">{t(option.description)}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-600">{t(option.detail)}</p>
          {option.id === 'language' && (
            <label className="mt-5 block border-t border-slate-100 pt-4 text-sm font-medium text-slate-700">
              {t('language')}
              <select
                value={language}
                onChange={(event) => {
                  if (isLanguageCode(event.target.value)) setLanguage(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
              >
                {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
          )}
          {preferenceKey && (
            <label className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-medium text-slate-700">
              {option.id === 'notifications'
                ? t('enableNotifications')
                : option.id === 'appearance'
                  ? t('useDarkMode')
                  : t('useCompactConversations')}
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  const value = event.target.checked;
                  setEnabled(value);
                  localStorage.setItem(preferenceKey, String(value));
                  if (option.id === 'appearance') applyDarkMode(value);
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
        <h1 className="text-2xl font-semibold text-slate-900">{t('settings')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('settingsDescription')}</p>
      </div>
      <div className="space-y-3">
        <Link
          to="/profile"
          className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-[#1a66ff]">
            <UserRound className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-slate-800">{t('editProfile')}</strong>
            <span className="text-xs text-slate-500">{t('yourProfile')}</span>
          </span>
          <ChevronRight className="size-5 text-slate-400" />
        </Link>
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
                <strong className="block text-sm text-slate-800">{t(item.title)}</strong>
                <span className="text-xs text-slate-500">{t(item.description)}</span>
              </span>
              <ChevronRight className="size-5 text-slate-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
