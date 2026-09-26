import twilio from 'twilio';

import { env } from '../config/env';

const client = /^AC[a-zA-Z0-9]+$/.test(env.twilioAccountSid) && env.twilioAuthToken
  ? twilio(env.twilioAccountSid, env.twilioAuthToken)
  : null;

export class TwilioService {
  static generateIVRMenu() {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    const gather = response.gather({
      numDigits: 1,
      action: '/api/auth/ivr/process',
      method: 'POST',
    });

    gather.say('Welcome to PhoneMail. Press 1 to create an account.');
    response.say("We didn't receive any input. Goodbye!");

    return response.toString();
  }

  static handleIVRInput(digits: string, callerNumber: string) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    if (digits === '1') {
      response.say(`Thanks! Your PhoneMail account is being created for ${callerNumber}.`);
      response.say('You can now log in using your phone number and OTP.');
      return response.toString();
    }

    response.say('Invalid input. Goodbye.');
    return response.toString();
  }

  static generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  static async sendOTP(toPhone: string, otp: string) {
    try {
      if (!client || !env.twilioPhoneNumber) {
        console.log(`Demo OTP for ${toPhone}: ${otp}`);
        return false;
      }

      await client.messages.create({
        body: env.twilioOtpTemplate,
        from: env.twilioPhoneNumber,
        to: toPhone,
      });

      return true;
    } catch (error) {
      console.warn('Twilio SMS failed, falling back to demo mode:', error);
      console.log(`Demo OTP for ${toPhone}: ${otp}`);
      return false;
    }
  }

  static async sendEmailNotificationSMS(toPhone: string, senderName: string, subject: string) {
    const message = `You have received an email from ${senderName}. Subject: ${subject}.`;

    try {
      if (!client || !env.twilioPhoneNumber) {
        console.log(`Mock SMS to ${toPhone}: ${message}`);
        return false;
      }

      await client.messages.create({
        body: message,
        from: env.twilioPhoneNumber,
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
