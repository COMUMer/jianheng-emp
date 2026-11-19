import { expect, test } from 'vitest';
import { inDateRange, matchesKeyword } from './filter';

test('matches a keyword across the given fields, ignoring case and blanks', () => {
    expect(matchesKeyword(['差旅报销', '向鸿锐', 12], '差旅')).toBe(true);
    expect(matchesKeyword(['差旅报销', '向鸿锐', 12], '  12 ')).toBe(true);
    expect(matchesKeyword(['差旅报销', '向鸿锐', 12], '苏兴隆')).toBe(false);
    expect(matchesKeyword(['差旅报销'], '')).toBe(true);
});

test('compares dates by day and treats an empty bound as unlimited', () => {
    expect(inDateRange('2026-11-18T18:57:00', '2026-11-01', '2026-11-30')).toBe(true);
    expect(inDateRange('2026-11-18T18:57:00', '2026-11-19')).toBe(false);
    expect(inDateRange('2026-11-18T18:57:00', undefined, '2026-11-18')).toBe(true);
    expect(inDateRange(undefined, '2026-11-01', '2026-11-30')).toBe(false);
    expect(inDateRange(undefined, undefined, undefined)).toBe(true);
});
