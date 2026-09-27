import { env } from '../config/env';

export class OtpProviderError extends Error {}

export async function sendOtp(phone: string, otp: string) {
  if (!env.twoFactorApiKey || !env.twoFactorOtpTemplate) {
    throw new OtpProviderError(
      'OTP delivery is not configured. Use password sign-up or add 2Factor API credentials and an approved OTP template.',
    );
  }

  const digits = phone.replace(/\D/g, '');
  const endpoint = [
    'https://2factor.in/API/V1',
    encodeURIComponent(env.twoFactorApiKey),
    'SMS',
    encodeURIComponent(digits),
    encodeURIComponent(otp),
    encodeURIComponent(env.twoFactorOtpTemplate),
  ].join('/');

  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new OtpProviderError('OTP provider could not be reached. Use password sign-up or try again later.');
  }

  let result: { Status?: string } | undefined;
  try {
    result = await response.json() as { Status?: string };
  } catch {
    throw new OtpProviderError('OTP provider returned an invalid response. Use password sign-up or try again later.');
  }

  if (!response.ok || result.Status?.toLowerCase() !== 'success') {
    throw new OtpProviderError('OTP delivery failed. Use password sign-up or check the 2Factor account and template.');
  }
}
