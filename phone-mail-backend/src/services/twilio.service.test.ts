import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TwilioService } from './twilio.service';

test('voice enrollment asks for consent and gathers a six-digit OTP', () => {
  const menu = TwilioService.generateIVRMenu('https://public.example/api/auth/ivr/start-registration');
  const otpPrompt = TwilioService.promptForIvrOtp('https://public.example/api/auth/ivr/verify-registration');

  assert.match(menu, /Press 1 to create an account/);
  assert.match(menu, /numDigits="1"/);
  assert.match(menu, /https:\/\/public\.example\/api\/auth\/ivr\/start-registration/);
  assert.match(otpPrompt, /six digit verification code/);
  assert.match(otpPrompt, /numDigits="6"/);
  assert.match(otpPrompt, /https:\/\/public\.example\/api\/auth\/ivr\/verify-registration/);
});

test('voice completion messages do not echo sensitive caller data', () => {
  const response = TwilioService.sayIvrMessage('created');
  assert.match(response, /Your PhoneMail account has been created/);
  assert.doesNotMatch(response, /\+?\d{10,}/);
});
