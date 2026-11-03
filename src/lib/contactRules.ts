// Customer details at checkout. The browser form and the server both use these
// rules, so a value the form accepts can't be refused later with a vague message.

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 255;

// Same shape the server has always accepted: ASCII local part, dotted domain, 2+ letter ending
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const INVISIBLE_CHARS_RE = /[\s​-‍⁠﻿]/g;

/**
 * The 10-digit subscriber number from whatever was typed. Only a real prefix is
 * dropped (+91, 91, 0, 091). Any other length stays as typed so it fails
 * validation, instead of quietly becoming somebody else's number.
 */
export function toMobileDigits(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  return digits;
}

export const isValidMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

export const isValidEmail = (email: string) => email.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(email);

export const isValidName = (name: string) =>
  name.length <= NAME_MAX_LENGTH && !CONTROL_CHARS_RE.test(name) && name.replace(INVISIBLE_CHARS_RE, '').length > 0;

export type ContactErrors = Partial<Record<'name' | 'phone' | 'email', string>>;

/** One plain message per field that is wrong. Email is optional. */
export function validateContact(name: string, phone: string, email: string): ContactErrors {
  const errors: ContactErrors = {};
  const trimmedName = name.trim();
  if (!trimmedName) errors.name = 'Enter the name for this booking.';
  else if (trimmedName.length > NAME_MAX_LENGTH) errors.name = `Use ${NAME_MAX_LENGTH} characters or fewer for the name.`;
  else if (!isValidName(trimmedName)) errors.name = 'Enter a name using letters people can read.';

  const digits = toMobileDigits(phone);
  if (!digits) errors.phone = 'Enter your mobile number.';
  else if (!isValidMobile(digits)) errors.phone = 'Enter a 10-digit mobile number.';

  const trimmedEmail = email.trim();
  if (trimmedEmail && !isValidEmail(trimmedEmail)) errors.email = 'Check the email address, or leave it blank.';
  return errors;
}
