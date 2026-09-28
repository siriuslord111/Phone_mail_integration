import twilio from 'twilio';
import { env } from '../config/env';

export class TwilioService {
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

  static async sendEmailNotificationSMS(toPhone: string, senderName: string, subject: string) {
    const client = /^AC[a-zA-Z0-9]+$/.test(process.env.TWILIO_ACCOUNT_SID ?? '')
      && process.env.TWILIO_AUTH_TOKEN
      ? twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN)
      : null;
    const message = `You have received an email from ${senderName}. Subject: ${subject}.`;

    try {
      if (!client || !process.env.TWILIO_PHONE_NUMBER) {
        console.log(`Mock SMS to ${toPhone}: ${message}`);
        return false;
      }

      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: toPhone,
      });

      return true;
    } catch (error) {
      console.warn('Notification SMS not delivered via Twilio, using demo message:', error);
      console.log(`Mock SMS to ${toPhone}: ${message}`);
      return false;
    }
  }
}
