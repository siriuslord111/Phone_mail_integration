import twilio from 'twilio';
import { env } from '../config/env';

export class TwilioService {
  static messageNotificationBody(sender: string) {
    return env.twilioTrialMode
      ? 'sms_account_alerts'
      : `New PhoneMail message from ${sender}. Open PhoneMail to read it.`;
  }

  static messageNotificationParameters(toPhone: string, sender: string) {
    const body = TwilioService.messageNotificationBody(sender);
    return env.twilioTrialMode
      ? { body, from: env.twilioTrialPhoneNumber, to: toPhone }
      : { body, from: env.twilioPhoneNumber, to: toPhone };
  }

  static webhookUrl(path: string) {
    return `${env.twilioWebhookBaseUrl}${path}`;
  }

  static isWebhookSignatureValid(url: string, signature: string, params: Record<string, string>) {
    return Boolean(
      env.twilioAuthToken &&
      signature &&
      twilio.validateRequest(env.twilioAuthToken, signature, url, params),
    );
  }

  static generateIVRMenu(actionUrl: string) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    const gather = response.gather({
      input: ['dtmf'],
      numDigits: 1,
      action: actionUrl,
      method: 'POST',
      timeout: 8,
    });

    gather.say('Welcome to PhoneMail. Press 1 to create an account.');
    response.say("We didn't receive any input. Goodbye!");

    return response.toString();
  }

  static promptForIvrOtp(actionUrl: string) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const gather = response.gather({
      input: ['dtmf'],
      numDigits: 6,
      action: actionUrl,
      method: 'POST',
      timeout: 30,
    });
    gather.say('We sent a six digit verification code to your phone. Enter the code using your keypad.');
    response.say('We did not receive the verification code. Please call again to restart account creation.');
    return response.toString();
  }

  static sayIvrMessage(message: 'invalid' | 'alreadyRegistered' | 'otpUnavailable' | 'otpInvalid' | 'created') {
    const messages = {
      invalid: 'We could not verify your phone number. Please call again from a valid mobile number.',
      alreadyRegistered: 'An account already exists for this phone number. Please log in using the PhoneMail app.',
      otpUnavailable: 'We could not send a verification code right now. Please try again later.',
      otpInvalid: 'The code was incorrect or expired. Call again to retry. If you used all five attempts, wait fifteen minutes before trying again.',
      created: 'Your PhoneMail account has been created. You can now log in using a phone verification code.',
    };
    const response = new twilio.twiml.VoiceResponse();
    response.say(messages[message]);
    response.hangup();
    return response.toString();
  }

  static async sendMessageNotificationSMS(toPhone: string, sender: string) {
    const client = /^AC[a-zA-Z0-9]+$/.test(env.twilioAccountSid)
      && env.twilioAuthToken
      ? twilio(env.twilioAccountSid, env.twilioAuthToken)
      : null;
    try {
      if (
        !client ||
        (env.twilioTrialMode && !env.twilioTrialPhoneNumber) ||
        (!env.twilioTrialMode && (!env.twilioPhoneNumber || env.twilioPhoneNumber === '+15005550006'))
      ) {
        console.warn('Notification SMS was not sent because Twilio is not configured.');
        return false;
      }

      await client.messages.create(TwilioService.messageNotificationParameters(toPhone, sender));

      return true;
    } catch (error) {
      const providerError = error && typeof error === 'object'
        ? error as { code?: unknown; status?: unknown }
        : {};
      console.warn('Notification SMS delivery failed via Twilio.', {
        code: typeof providerError.code === 'number' ? providerError.code : undefined,
        status: typeof providerError.status === 'number' ? providerError.status : undefined,
      });
      return false;
    }
  }
}
