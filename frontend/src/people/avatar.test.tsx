import { expect, test } from 'vitest';
import { avatarText, avatarUrl } from './avatar';

test('uses the given name for the default avatar', () => {
    expect(avatarText('向鸿锐')).toBe('鸿锐');
    expect(avatarText('张三')).toBe('张三');
    expect(avatarText('欧阳娜娜')).toBe('娜娜');
    expect(avatarText('测试员工')).toBe('员工');
});

test('uses an initial for names without Chinese characters', () => {
    expect(avatarText('yuanyuwei')).toBe('Y');
    expect(avatarText('1')).toBe('1');
    expect(avatarText('')).toBe('?');
});

test('builds the avatar url only when a key exists', () => {
    expect(avatarUrl()).toBeUndefined();
    expect(avatarUrl('avatar.jpg')).toBe('/api/people/avatars/avatar.jpg');
});
