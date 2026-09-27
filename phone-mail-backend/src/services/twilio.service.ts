import twilio from 'twilio';

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
