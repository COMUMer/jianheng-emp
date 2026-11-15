import { describe, expect, it } from 'vitest';
import { formatMoney, statusLabel } from './format';

describe('document display', () => {
    it('formats yuan without losing fractional digits', () => {
        expect(formatMoney(1234.5)).toContain('1,234.50');
    });

    it('distinguishes review from payment', () => {
        expect(statusLabel.IN_REVIEW).toBe('审批中');
        expect(statusLabel.AWAITING_PAYMENT).toBe('待付款');
    });
});
