import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Globe, ShieldCheck } from 'lucide-react';
import { Button } from '../components/common/Buttons';
import { Checkbox, PhoneField } from '../components/common/Inputs';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../api/axios';
import { getAuthOptions, sendOtp, startDemoIvrRegistration, type AuthOptions } from '../api/auth.api';

type Step = 'language' | 'terms' | 'phone';
type AuthMode = 'login' | 'register';
type AuthMethod = 'otp' | 'password';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
];

export default function Login() {
  const navigate = useNavigate();
  const { registerPassword, loginPassword, authenticateOtp, authenticateDemoIvr } = useAuth();
  const [step, setStep] = useState<Step>('language');
  const [language, setLanguage] = useState('en');
  const [agreed, setAgreed] = useState(false);
  const [phone, setPhone] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [method, setMethod] = useState<AuthMethod>('otp');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authOptions, setAuthOptions] = useState<AuthOptions | null>(null);
  const [authOptionsError, setAuthOptionsError] = useState('');
  const [demoIvrCode, setDemoIvrCode] = useState('');
  const [demoIvrOtp, setDemoIvrOtp] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getAuthOptions()
      .then((options) => {
        if (!cancelled) setAuthOptions(options);
      })
      .catch((optionsError: unknown) => {
        if (!cancelled) {
          setAuthOptionsError(getErrorMessage(optionsError, 'Phone registration options could not be loaded.'));
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (method === 'password' && (password.length < 8 || password.length > 128)) {
      setError('Password must be between 8 and 128 characters.');
      return;
    }
    if (method === 'password' && mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (method === 'otp' && otpSent && !/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code sent to your phone.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      if (method === 'otp' && !otpSent) {
        await sendOtp(phone, mode);
        setOtpSent(true);
      } else if (method === 'otp') {
        await authenticateOtp(phone, otp, mode);
        navigate('/', { replace: true });
      } else if (mode === 'register') {
        await registerPassword(phone, password);
        navigate('/', { replace: true });
      } else {
        await loginPassword(phone, password);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(
        err,
        method === 'otp' ? 'Could not send or verify the OTP.' : mode === 'register' ? "Couldn't create the account." : "Couldn't log in.",
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoCall = async () => {
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError('');
    setDemoIvrCode('');
    setDemoIvrOtp('');
    setLoading(true);
    try {
      const result = await startDemoIvrRegistration(phone);
      setDemoIvrCode(result.demoOtp);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't start the simulated call."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDemoCall = async () => {
    if (!/^\d{6}$/.test(demoIvrOtp)) {
      setError('Enter the 6-digit code spoken in the simulated call.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authenticateDemoIvr(phone, demoIvrOtp);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't verify the simulated call."));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'language') {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mb-1 flex items-center gap-2 text-[#1a66ff]">
          <Globe className="size-5" />
          <h1 className="text-lg font-semibold text-slate-900">Choose your language</h1>
        </div>
        <p className="mb-5 text-sm text-slate-500">You can change this later in settings.</p>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              onClick={() => setLanguage(item.code)}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-[15px] transition-all duration-150 ${
                language === item.code
                  ? 'border-[#1a66ff] bg-blue-50 font-medium text-[#0b4fe0]'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {item.label}
              {language === item.code && <Check className="size-5 text-[#1a66ff]" />}
            </button>
          ))}
        </div>
        <Button fullWidth size="lg" onClick={() => setStep('terms')} className="mt-5 justify-center">
          Continue
          <ChevronRight className="size-4" />
        </Button>
      </div>
    );
  }

  if (step === 'terms') {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mb-1 flex items-center gap-2 text-[#1a66ff]">
          <ShieldCheck className="size-5" />
          <h1 className="text-lg font-semibold text-slate-900">Terms &amp; permissions</h1>
        </div>
        <p className="mb-5 text-sm text-slate-500">PhoneMail needs your agreement before creating an account.</p>
        <div className="flex-1 space-y-3 overflow-y-auto">
          <PermissionRow title="Phone number" body="Used as your PhoneMail address." granted={permissionGranted} />
          <PermissionRow title="Contacts" body="Optional contact matching for your inbox." />
        </div>
        <div className="mt-5 space-y-4">
          <Checkbox checked={agreed} onChange={setAgreed}>
            I agree to the{' '}
            <a href="#" className="font-medium text-[#1a66ff] underline underline-offset-2">Terms of Service</a>{' '}
            and Privacy Policy.
          </Checkbox>
          <Button
            fullWidth
            size="lg"
            disabled={!agreed}
            onClick={() => {
              setPermissionGranted(true);
              setStep('phone');
            }}
            className="justify-center"
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">
        {mode === 'register' ? 'Create your PhoneMail account' : 'Log in to PhoneMail'}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        Sign in with a phone OTP, or choose password as a fallback.
      </p>
      <PhoneField
        value={phone}
        onChange={(value) => {
          setPhone(value);
          setOtp('');
          setOtpSent(false);
          setDemoIvrCode('');
          setDemoIvrOtp('');
          setError('');
        }}
        error={error}
        autoFocus
      />
      <div className="mt-5 flex rounded-xl bg-slate-100 p-1 text-sm">
        <button onClick={() => { setMode('login'); setOtpSent(false); setOtp(''); setError(''); }} className={`flex-1 rounded-lg py-2 ${mode === 'login' ? 'bg-white font-semibold text-[#1a66ff] shadow-sm' : 'text-slate-500'}`}>Log in</button>
        <button onClick={() => { setMode('register'); setOtpSent(false); setOtp(''); setError(''); }} className={`flex-1 rounded-lg py-2 ${mode === 'register' ? 'bg-white font-semibold text-[#1a66ff] shadow-sm' : 'text-slate-500'}`}>Register</button>
      </div>
      <div className="mt-3 flex rounded-xl bg-slate-100 p-1 text-sm">
        <button onClick={() => { setMethod('otp'); setOtpSent(false); setError(''); }} className={`flex-1 rounded-lg py-2 ${method === 'otp' ? 'bg-white font-semibold text-[#1a66ff] shadow-sm' : 'text-slate-500'}`}>Phone OTP</button>
        <button onClick={() => { setMethod('password'); setOtpSent(false); setError(''); }} className={`flex-1 rounded-lg py-2 ${method === 'password' ? 'bg-white font-semibold text-[#1a66ff] shadow-sm' : 'text-slate-500'}`}>Password</button>
      </div>
      {mode === 'register' && (
        <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-800">
          {authOptionsError ? (
            <p role="alert">{authOptionsError}</p>
          ) : !authOptions ? (
            <p>Loading phone-call registration options…</p>
          ) : authOptions.ivrDemoEnabled ? (
            <div className="space-y-2">
              <p className="font-semibold">No real toll-free number needed for this demo.</p>
              {!demoIvrCode ? (
                <Button
                  fullWidth
                  variant="secondary"
                  loading={loading}
                  onClick={handleDemoCall}
                >
                  Simulate call and press 1
                </Button>
              ) : (
                <>
                  <p>
                    Simulated call: you pressed 1. The caller hears code{' '}
                    <span className="font-bold tracking-[0.2em]">{demoIvrCode}</span>.
                  </p>
                  <input
                    type="text"
                    value={demoIvrOtp}
                    onChange={(event) => setDemoIvrOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter the spoken 6-digit code"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a66ff]"
                  />
                  <Button fullWidth loading={loading} onClick={handleVerifyDemoCall}>
                    Verify demo call and create account
                  </Button>
                </>
              )}
              <p className="text-[11px]">Local demonstration only. The displayed code is not delivered by call or SMS.</p>
            </div>
          ) : authOptions.tollFreeNumber ? (
            authOptions.otpConfigured ? (
              <p>
                Prefer a call? Dial <a className="font-semibold underline" href={`tel:${authOptions.tollFreeNumber}`}>{authOptions.tollFreeNumber}</a>,
                press 1, then enter the OTP sent to your phone.
              </p>
            ) : (
              <p>Call registration is set up, but SMS verification is not configured yet.</p>
            )
          ) : (
            <p>Phone-call registration is not configured yet. You can create an account here using OTP or password.</p>
          )}
        </div>
      )}
      {method === 'password' && (
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          placeholder="Password (8–128 characters)"
          maxLength={128}
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1a66ff]"
        />
      )}
      {method === 'password' && mode === 'register' && (
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          maxLength={128}
          placeholder="Confirm password"
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1a66ff]"
        />
      )}
      {method === 'otp' && otpSent && (
        <input
          type="text"
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit verification code"
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1a66ff]"
        />
      )}
      {method === 'otp' && (
        <button
          type="button"
          onClick={() => { setMethod('password'); setOtpSent(false); setError(''); }}
          className="mt-3 self-start text-xs font-medium text-[#1a66ff] underline underline-offset-2"
        >
          Use password instead
        </button>
      )}
      {permissionGranted && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
          <Check className="size-3.5" />
          Your phone number will be used as your PhoneMail address.
        </p>
      )}
      <div className="mt-auto pt-6">
        <Button fullWidth size="lg" loading={loading} onClick={handleSubmit} className="justify-center">
          {method === 'otp'
            ? otpSent ? 'Verify and continue' : 'Send OTP'
            : mode === 'register' ? 'Create account' : 'Log in'}
        </Button>
      </div>
    </div>
  );
}

function PermissionRow({ title, body, granted }: { title: string; body: string; granted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{body}</p>
      </div>
      {granted && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">Ready</span>}
    </div>
  );
}
