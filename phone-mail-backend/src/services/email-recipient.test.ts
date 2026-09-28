import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeRecipients } from './email-recipient';
import { normalizePhone } from '../store';

test('normalizes phone recipients and preserves real email addresses', () => {
  assert.deepEqual(
    normalizeRecipients(['9876543210', 'Person@example.com', '+919876543210']),
    ['919876543210@phonemail.com', 'person@example.com'],
  );
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.equal(normalizePhone('+919876543210'), '+919876543210');
});

test('rejects invalid recipients and recipient counts', () => {
  assert.throws(() => normalizeRecipients(['not-an-address']), /Invalid recipient/);
  assert.throws(() => normalizeRecipients([]), /between 1 and 20/);
  assert.throws(() => normalizeRecipients(Array(21).fill('person@example.com')), /between 1 and 20/);
});
