import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Globe,
  KeyRound,
  Palette,
  ShieldCheck,
  AtSign,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../context/LanguageProvider';
import { changePassword, resetPasswordWithOtp, sendPasswordResetOtp } from '../api/auth.api';
import { addAlias, getAliases, getSmsNotificationsEnabled, removeAlias, setSmsNotificationsEnabled, type AccountAlias } from '../api/user.api';
import { getErrorMessage } from '../api/axios';
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
    id: 'instructions',
    title: 'instructions',
    description: 'instructionsDescription',
    detail: 'instructionsDetail',
    icon: BookOpen,
  },
  {
    id: 'notifications',
    title: 'notifications',
    description: 'notificationDescription',
    detail: 'notificationDetail',
    icon: Bell,
  },
  {
    id: 'password',
    title: 'password',
    description: 'passwordSettingDescription',
    detail: 'passwordSettingDetail',
    icon: KeyRound,
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
    id: 'aliases',
    title: 'aliasIds',
    description: 'aliasDescription',
    detail: 'aliasDetail',
    icon: AtSign,
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
  appearance: 'phonemail_setting_dark_mode',
};

const INSTRUCTIONS: { title: TranslationKey; body: TranslationKey }[] = [
  { title: 'guideAccount', body: 'guideAccountHelp' },
  { title: 'guideInbox', body: 'guideInboxHelp' },
  { title: 'guideSend', body: 'guideSendHelp' },
  { title: 'guideMessages', body: 'guideMessagesHelp' },
  { title: 'guideDrafts', body: 'guideDraftsHelp' },
  { title: 'guideProfile', body: 'guideProfileHelp' },
  { title: 'guideSettings', body: 'guideSettingsHelp' },
  { title: 'guideSafety', body: 'guideSafetyHelp' },
];

function readPreference(key: string, defaultValue: boolean) {
  const saved = localStorage.getItem(key);
  return saved === null ? defaultValue : saved === 'true';
}

export default function Settings() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const option = OPTIONS.find((item) => item.id === section);
  const [enabled, setEnabled] = useState(false);
  const [preferenceLoading, setPreferenceLoading] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [sendingResetOtp, setSendingResetOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [aliases, setAliases] = useState<AccountAlias[]>([]);
  const [primaryAddress, setPrimaryAddress] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasError, setAliasError] = useState('');
  const [aliasStatus, setAliasStatus] = useState('');

  const handlePreferenceChange = async (value: boolean) => {
    if (!option) return;
    const preferenceKey = PREFERENCE_KEYS[option.id];
    if (!preferenceKey) return;

    if (option.id !== 'notifications') {
      setEnabled(value);
      localStorage.setItem(preferenceKey, String(value));
      if (option.id === 'appearance') applyDarkMode(value);
      return;
    }

    const previousValue = enabled;
    setPreferenceSaving(true);
    setPreferenceError('');
    try {
      const savedValue = await setSmsNotificationsEnabled(value);
      setEnabled(savedValue);
      localStorage.setItem(preferenceKey, String(savedValue));
    } catch (error) {
      setEnabled(previousValue);
      setPreferenceError(getErrorMessage(error, t('notificationSaveFailed')));
    } finally {
      setPreferenceSaving(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordStatus('');
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError(t('passwordLength'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordStatus(t('passwordChanged'));
    } catch (error) {
      setPasswordError(getErrorMessage(error, t('passwordChangeFailed')));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendPasswordResetOtp = async () => {
    setPasswordError('');
    setPasswordStatus('');
    setSendingResetOtp(true);
    try {
      await sendPasswordResetOtp();
      setResetOtpSent(true);
      setPasswordStatus(t('resetOtpSent'));
    } catch (error) {
      setPasswordError(getErrorMessage(error, t('passwordResetFailed')));
    } finally {
      setSendingResetOtp(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordStatus('');
    if (!resetOtpSent) {
      setPasswordError(t('sendResetOtpFirst'));
      return;
    }
    if (!/^\d{6}$/.test(resetOtp)) {
      setPasswordError(t('otpOnly'));
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordError(t('passwordLength'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    setResettingPassword(true);
    try {
      await resetPasswordWithOtp(resetOtp, newPassword);
      setResetOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetMode(false);
      setResetOtpSent(false);
      setPasswordStatus(t('passwordResetSuccess'));
    } catch (error) {
      setPasswordError(getErrorMessage(error, t('passwordResetFailed')));
    } finally {
      setResettingPassword(false);
    }
  };

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
    if (!option || !PREFERENCE_KEYS[option.id]) return;
    if (option.id !== 'notifications') {
      setEnabled(readPreference(PREFERENCE_KEYS[option.id], false));
      setPreferenceError('');
      return;
    }

    let active = true;
    setPreferenceLoading(true);
    setPreferenceError('');
    void getSmsNotificationsEnabled()
      .then((value) => {
        if (!active) return;
        setEnabled(value);
        localStorage.setItem(PREFERENCE_KEYS.notifications, String(value));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setEnabled(false);
        setPreferenceError(getErrorMessage(error, t('notificationSaveFailed')));
      })
      .finally(() => {
        if (active) setPreferenceLoading(false);
      });
    return () => { active = false; };
  }, [option, t]);

  useEffect(() => {
    if (!option || option.id !== 'aliases') return;
    let active = true;
    setAliasLoading(true);
    setAliasError('');
    void getAliases()
      .then((result) => {
        if (!active) return;
        setPrimaryAddress(result.primaryAddress);
        setAliases(result.aliases);
      })
      .catch((error: unknown) => {
        if (active) setAliasError(getErrorMessage(error, t('aliasSaveFailed')));
      })
      .finally(() => {
        if (active) setAliasLoading(false);
      });
    return () => { active = false; };
  }, [option, t]);

  const handleAddAlias = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAliasError('');
    setAliasStatus('');
    setAliasSaving(true);
    try {
      const alias = await addAlias(aliasInput);
      setAliases((current) => [...current, alias]);
      setAliasInput('');
      setAliasStatus(t('aliasAdded'));
    } catch (error) {
      setAliasError(getErrorMessage(error, t('aliasSaveFailed')));
    } finally {
      setAliasSaving(false);
    }
  };

  const handleRemoveAlias = async (aliasId: string) => {
    setAliasError('');
    setAliasStatus('');
    try {
      await removeAlias(aliasId);
      setAliases((current) => current.filter((alias) => alias.id !== aliasId));
      setAliasStatus(t('aliasRemoved'));
    } catch (error) {
      setAliasError(getErrorMessage(error, t('aliasRemoveFailed')));
    }
  };

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
          {option.id === 'aliases' && (
            <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{t('primaryAddress')}:</span>{' '}
                {primaryAddress || t('loading')}
              </p>
              <form onSubmit={(event) => { void handleAddAlias(event); }} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={aliasInput}
                  onChange={(event) => setAliasInput(event.target.value)}
                  placeholder={t('aliasPlaceholder')}
                  aria-label={t('addAlias')}
                  maxLength={30}
                  required
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                />
                <button
                  type="submit"
                  disabled={aliasSaving || aliasLoading}
                  className="rounded-xl bg-[#1a66ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b4fe0] disabled:opacity-60"
                >
                  {aliasSaving ? t('saving') : t('addAlias')}
                </button>
              </form>
              <p className="text-xs text-slate-500">{t('aliasFormat')}</p>
              {aliases.length === 0 && !aliasLoading && <p className="text-sm text-slate-500">{t('noAliases')}</p>}
              {aliases.map((alias) => (
                <div key={alias.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <span className="break-all text-sm text-slate-700">{alias.address}</span>
                  <button
                    type="button"
                    onClick={() => { void handleRemoveAlias(alias.id); }}
                    className="shrink-0 text-sm font-medium text-rose-600 hover:underline"
                  >
                    {t('removeAlias')}
                  </button>
                </div>
              ))}
              {aliasError && <p role="alert" className="text-sm text-rose-600">{aliasError}</p>}
              {aliasStatus && <p role="status" className="text-sm text-emerald-700">{aliasStatus}</p>}
            </div>
          )}
          {option.id === 'security' && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold text-slate-800">{t('webSecurity')}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t('webSecurityDetail')}</p>
            </div>
          )}
          {option.id === 'instructions' && (
            <ol className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
              {INSTRUCTIONS.map((instruction, index) => (
                <li key={instruction.title} className="flex gap-3 py-4">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-[#1a66ff]">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">{t(instruction.title)}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t(instruction.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {option.id === 'password' && !resetMode && (
            <form onSubmit={(event) => { void handlePasswordChange(event); }} className="mt-5 space-y-4 border-t border-slate-100 pt-4">
              <label className="block text-sm font-medium text-slate-700">
                {t('currentPassword')}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">{t('currentPasswordHelp')}</span>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('newPassword')}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('confirmNewPassword')}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                />
              </label>
              {passwordError && (
                <p
                  role={passwordError.includes('Current password is incorrect') ? 'status' : 'alert'}
                  className={passwordError.includes('Current password is incorrect') ? 'text-sm text-amber-700' : 'text-sm text-rose-600'}
                >
                  {passwordError}
                </p>
              )}
              {passwordStatus && <p role="status" className="text-sm text-emerald-700">{passwordStatus}</p>}
              {(currentPassword || newPassword || confirmNewPassword) && (
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1a66ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b4fe0] disabled:opacity-60"
                >
                  {changingPassword ? t('saving') : t('changePassword')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setResetMode(true);
                  setPasswordError('');
                  setPasswordStatus('');
                }}
                className="block text-sm font-medium text-[#1a66ff] hover:underline"
              >
                {t('forgotPassword')}
              </button>
            </form>
          )}
          {option.id === 'password' && resetMode && (
            <form onSubmit={(event) => { void handlePasswordReset(event); }} className="mt-5 space-y-4 border-t border-slate-100 pt-4">
              <p className="text-sm leading-6 text-slate-600">{t('forgotPasswordHelp')}</p>
              <button
                type="button"
                onClick={() => {
                  void handleSendPasswordResetOtp();
                }}
                disabled={sendingResetOtp}
                className="inline-flex items-center justify-center rounded-xl border border-[#1a66ff] px-4 py-2.5 text-sm font-semibold text-[#1a66ff] transition hover:bg-blue-50 disabled:opacity-60"
              >
                {sendingResetOtp ? t('saving') : t('sendResetOtp')}
              </button>
              {resetOtpSent && (
                <label className="block text-sm font-medium text-slate-700">
                  {t('resetOtp')}
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={resetOtp}
                    onChange={(event) => setResetOtp(event.target.value.replace(/\D/g, ''))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                {t('newPassword')}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('confirmNewPassword')}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                />
              </label>
              {passwordError && <p role="alert" className="text-sm text-rose-600">{passwordError}</p>}
              {passwordStatus && <p role="status" className="text-sm text-emerald-700">{passwordStatus}</p>}
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={resettingPassword || !resetOtpSent}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1a66ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b4fe0] disabled:opacity-60"
                >
                  {resettingPassword ? t('saving') : t('resetPassword')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetMode(false);
                    setResetOtp('');
                    setResetOtpSent(false);
                    setPasswordError('');
                    setPasswordStatus('');
                  }}
                  className="text-sm font-medium text-slate-600 hover:underline"
                >
                  {t('backToPasswordChange')}
                </button>
              </div>
            </form>
          )}
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
                : t('useDarkMode')}
              <input
                type="checkbox"
                checked={enabled}
                disabled={preferenceLoading || preferenceSaving}
                onChange={(event) => { void handlePreferenceChange(event.target.checked); }}
                className="size-5 accent-[#1a66ff]"
              />
            </label>
          )}
          {option.id === 'notifications' && preferenceError && (
            <p role="alert" className="mt-3 text-sm text-rose-600">{preferenceError}</p>
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
