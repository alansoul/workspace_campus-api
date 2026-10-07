import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService (Argon2id)', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    passwordService = new PasswordService();
  });

  it('should successfully hash a password', async () => {
    const plain = 'SecretPassword123!';
    const hash = await passwordService.hash(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toEqual(plain);
    expect(hash).toContain('$argon2id$');
  });

  it('should correctly verify valid password against hash', async () => {
    const plain = 'SecretPassword123!';
    const hash = await passwordService.hash(plain);
    const isValid = await passwordService.verify(hash, plain);

    expect(isValid).toBe(true);
  });

  it('should return false for incorrect password', async () => {
    const plain = 'SecretPassword123!';
    const hash = await passwordService.hash(plain);
    const isValid = await passwordService.verify(hash, 'WrongPassword!');

    expect(isValid).toBe(false);
  });
});