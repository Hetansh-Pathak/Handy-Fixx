import { describe, it, expect } from 'vitest';
import { cleanPayout, validatePayout } from '@/lib/payoutDetails';

const empty = { bank_account_name: '', bank_account_number: '', bank_ifsc: '', upi_id: '' };

describe('validatePayout', () => {
  it('needs a bank account or a UPI id', () => expect(validatePayout(empty)).toMatch(/bank account or a UPI/));
  it('accepts UPI alone', () => expect(validatePayout({ ...empty, upi_id: 'ravi@okhdfcbank' })).toBeNull());
  it('accepts a full bank account (spaces and lowercase IFSC tolerated)', () =>
    expect(validatePayout({ bank_account_name: 'Ravi Patel', bank_account_number: '1234 5678 9012', bank_ifsc: 'hdfc0001234', upi_id: '' })).toBeNull());
  it('rejects a partial bank account', () => expect(validatePayout({ ...empty, bank_account_number: '123456789012' })).toMatch(/holder name/));
  it('rejects bad account number, IFSC and UPI', () => {
    expect(validatePayout({ ...empty, bank_account_name: 'A', bank_account_number: '12ab', bank_ifsc: 'HDFC0001234' })).toMatch(/9 to 18/);
    expect(validatePayout({ ...empty, bank_account_name: 'A', bank_account_number: '123456789', bank_ifsc: 'BAD' })).toMatch(/IFSC/);
    expect(validatePayout({ ...empty, upi_id: 'no-at-sign' })).toMatch(/UPI/);
  });
});
describe('cleanPayout', () => {
  it('normalises and nulls blanks', () =>
    expect(cleanPayout({ bank_account_name: ' Ravi ', bank_account_number: '1234 5678 9012', bank_ifsc: 'hdfc0001234', upi_id: ' ' }))
      .toEqual({ bank_account_name: 'Ravi', bank_account_number: '123456789012', bank_ifsc: 'HDFC0001234', upi_id: null }));
});
