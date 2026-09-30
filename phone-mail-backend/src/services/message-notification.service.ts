import type { User } from '../store';
import { TwilioService } from './twilio.service';

type SmsRecipient = Pick<User, 'phoneNumber' | 'smsNotificationsEnabled'>;

export async function notifyIncomingMessage(recipients: SmsRecipient[], sender: string) {
  await Promise.all(recipients
    .filter((recipient) => recipient.smsNotificationsEnabled)
    .map(async (recipient) => {
      try {
        const sent = await TwilioService.sendMessageNotificationSMS(recipient.phoneNumber, sender);
        if (!sent) console.warn('An opted-in message notification could not be sent.');
      } catch {
        console.warn('An opted-in message notification could not be sent.');
      }
    }));
}