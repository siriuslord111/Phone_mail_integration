const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecipients(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [input];
  if (values.length === 0 || values.length > 20) {
    throw new Error('Add between 1 and 20 recipients.');
  }

  const recipients = values.map((raw) => {
    if (typeof raw !== 'string') {
      throw new Error('Each recipient must be an email address or phone number.');
    }
    const value = raw.trim();
    if (EMAIL_PATTERN.test(value)) return value.toLowerCase();
    if (!/^\+?[\d\s()-]+$/.test(value)) {
      throw new Error(`Invalid recipient: ${value}`);
    }
    const phone = value.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      throw new Error('Phone number recipients must contain 10 to 15 digits.');
    }
    return `${phone}@phonemail.com`;
  });

  return [...new Set(recipients)];
}
