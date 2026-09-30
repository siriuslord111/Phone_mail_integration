import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TwilioService } from './twilio.service';
import { notifyIncomingMessage } from './message-notification.service';
import { env } from '../config/env';

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

test('SMS notifications are sent only to users who opted in', async () => {
  const originalSend = TwilioService.sendMessageNotificationSMS;
  const sentPhones: string[] = [];
  TwilioService.sendMessageNotificationSMS = async (phone) => {
    sentPhones.push(phone);
    return true;
  };

  try {
    await notifyIncomingMessage([
      { phoneNumber: '+911234567890', smsNotificationsEnabled: false },
      { phoneNumber: '+919876543210', smsNotificationsEnabled: true },
    ], '+911111111111');
    assert.deepEqual(sentPhones, ['+919876543210']);
  } finally {
    TwilioService.sendMessageNotificationSMS = originalSend;
  }
});

test('trial SMS notifications match the accepted Twilio request shape', () => {
  const originalMode = env.twilioTrialMode;
  const originalPhoneNumber = env.twilioPhoneNumber;
  const originalTrialPhoneNumber = env.twilioTrialPhoneNumber;
  try {
    env.twilioTrialMode = true;
    env.twilioTrialPhoneNumber = '+17372508034';
    assert.equal(TwilioService.messageNotificationBody('+911234567890'), 'sms_account_alerts');
    assert.deepEqual(
      TwilioService.messageNotificationParameters('+919876543210', '+911234567890'),
      { body: 'sms_account_alerts', from: '+17372508034', to: '+919876543210' },
    );
    env.twilioTrialMode = false;
    env.twilioPhoneNumber = '+14155552671';
    assert.equal(
      TwilioService.messageNotificationBody('+911234567890'),
      'New PhoneMail message from +911234567890. Open PhoneMail to read it.',
    );
    assert.deepEqual(
      TwilioService.messageNotificationParameters('+919876543210', '+911234567890'),
      {
        body: 'New PhoneMail message from +911234567890. Open PhoneMail to read it.',
        from: '+14155552671',
        to: '+919876543210',
      },
    );
  } finally {
    env.twilioTrialMode = originalMode;
    env.twilioPhoneNumber = originalPhoneNumber;
    env.twilioTrialPhoneNumber = originalTrialPhoneNumber;
  }
});
