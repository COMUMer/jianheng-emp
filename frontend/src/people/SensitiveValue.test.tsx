import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { maskIdCard } from './mask';
import { SensitiveValue } from './SensitiveValue';

test('starts masked and reveals the value on demand', async () => {
    const session = userEvent.setup();
    render(<SensitiveValue value="11010519491231002X" mask={maskIdCard} label="身份证号" />);

    expect(screen.getByText('110105********002X')).toBeTruthy();
    await session.click(screen.getByRole('button', { name: '显示身份证号' }));
    expect(screen.getByText('11010519491231002X')).toBeTruthy();
    await session.click(screen.getByRole('button', { name: '隐藏身份证号' }));
    expect(screen.getByText('110105********002X')).toBeTruthy();
});