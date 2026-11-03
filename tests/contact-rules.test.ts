import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidMobile, isValidName, toMobileDigits, validateContact } from '../src/lib/contactRules';

describe('toMobileDigits', () => {
  it('drops only a real prefix', () => {
    expect(toMobileDigits('+91 98765 43210')).toBe('9876543210');
    expect(toMobileDigits('919876543210')).toBe('9876543210');
    expect(toMobileDigits('09876543210')).toBe('9876543210');
    expect(toMobileDigits('0919876543210')).toBe('9876543210');
    expect(toMobileDigits('98765-43210')).toBe('9876543210');
  });

  it('never turns a typo into somebody else\'s number', () => {
    // 11 digits with one too many: the old code kept the last 10, a different person
    expect(isValidMobile(toMobileDigits('98765432101'))).toBe(false);
    expect(isValidMobile(toMobileDigits('987654321'))).toBe(false);
    expect(isValidMobile(toMobileDigits('1234567890'))).toBe(false);
  });

  it('copes with nothing at all', () => {
    expect(toMobileDigits(null)).toBe('');
    expect(toMobileDigits(undefined)).toBe('');
    expect(toMobileDigits('')).toBe('');
  });
});

describe('validateContact', () => {
  const ok = { name: 'Asha Devi', phone: '9876543210', email: '' };
  const check = (changes: Partial<typeof ok>) => {
    const v = { ...ok, ...changes };
    return validateContact(v.name, v.phone, v.email);
  };

  it('accepts a normal customer, with or without an email', () => {
    expect(check({})).toEqual({});
    expect(check({ email: 'asha@example.com' })).toEqual({});
    expect(check({ phone: '+91 98765 43210' })).toEqual({});
  });

  it('names the field that is wrong', () => {
    expect(check({ name: '   ' }).name).toBeTruthy();
    expect(check({ phone: '12345' }).phone).toBeTruthy();
    expect(check({ email: 'a@b' }).email).toBeTruthy();
  });

  it('refuses names nobody can read', () => {
    expect(isValidName('​‍﻿')).toBe(false); // zero-width only
    expect(isValidName('Asha\u0000Devi')).toBe(false); // NUL byte: Postgres refuses it
    expect(isValidName('x'.repeat(101))).toBe(false);
    expect(isValidName("O'Brien")).toBe(true);
    expect(isValidName('आशा देवी')).toBe(true);
  });

  it('agrees with the server about emails, so the form can\'t pass what the server refuses', () => {
    for (const email of ['a@b', 'a b@c.in', 'a@b..in', 'a@b.c', '@b.in', 'a@.in']) expect(isValidEmail(email), email).toBe(false);
    for (const email of ['a@b.in', 'first.last+tag@sub.example.co.in', "o'brien@example.com"]) expect(isValidEmail(email), email).toBe(true);
    expect(isValidEmail(`${'a'.repeat(251)}@b.in`)).toBe(false);
  });
});
