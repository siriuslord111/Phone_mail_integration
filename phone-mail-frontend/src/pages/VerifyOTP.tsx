import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, User } from 'lucide-react';
import { Button } from '../components/common/Buttons';
import { OtpField, TextField } from '../components/common/Inputs';
import { useAuth } from '../hooks/useAuth';
import { formatPhone } from '../utils/formatters';
import { getErrorMessage } from '../api/axios';
import { requestOtp } from '../api/auth.api';

type Step = 'otp' | 'name';

const RESEND_SECONDS = 30;

/**
 * Screen 4 from the brief (OTP, auto-verified when complete) plus the
 * "What's your name?" step, shown only for a brand-new account.
 */
export default function VerifyOTP() {
  const navigate = useNavigate();
  const { pendingPhone, confirmOtp, completeProfile } = useAuth();

  const [step, setStep] = useState<Step>('otp');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  if (!pendingPhone) return <Navigate to="/login" replace />;

  const verify = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const { isNewUser } = await confirmOtp(code);
      if (isNewUser) {
        setStep('name');
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Incorrect code. Please try again.'));
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (seconds > 0) return;
    setSeconds(RESEND_SECONDS);
    setOtp('');
    setError('');
    await requestOtp(pendingPhone);
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      setError('Tell us what to call you.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await completeProfile(name.trim());
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'name') {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">What&apos;s your name?</h1>
        <p className="mb-5 text-sm text-slate-500">This is how people will see you across PhoneMail.</p>

        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          leadingIcon={<User className="size-5 text-slate-400" />}
          error={error}
          autoFocus
        />

        <div className="mt-auto pt-6">
          <Button fullWidth size="lg" loading={loading} onClick={handleSaveName} className="justify-center">
            Enter PhoneMail
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Verify your number</h1>
      <p className="mb-5 text-sm text-slate-500">
        Enter the code sent to <span className="font-medium text-slate-700">{formatPhone(pendingPhone)}</span>.{' '}
        <button onClick={() => navigate('/login')} className="font-medium text-[#1a66ff] underline underline-offset-2">
          Change
        </button>
      </p>

      <OtpField value={otp} onChange={setOtp} onComplete={verify} error={error} autoFocus />
      <p className="mt-3 text-xs text-slate-400">Demo code is any 6 digits.</p>

      <div className="mt-auto space-y-3 pt-6">
        <Button
          fullWidth
          size="lg"
          loading={loading}
          disabled={otp.length !== 6}
          onClick={() => verify(otp)}
          className="justify-center"
        >
          Verify
        </Button>
        <button
          onClick={handleResend}
          disabled={seconds > 0}
          className="w-full text-center text-sm font-medium text-[#1a66ff] disabled:text-slate-400"
        >
          {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
