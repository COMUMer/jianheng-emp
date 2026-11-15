import { expect, test } from 'vitest';
import { maskBankCard, maskIdCard } from './mask';

test('masks the middle of an id card and keeps the last four digits visible', () => {
    expect(maskIdCard('11010519491231002X')).toBe('110105********002X');
});

test('masks a short id value completely', () => {
    expect(maskIdCard('12345678')).toBe('********');
});

test('shows only the last four bank card digits', () => {
    expect(maskBankCard('6222 0202 0011 2233 445')).toBe('**** 3445');
    expect(maskBankCard('1234')).toBe('****');
});