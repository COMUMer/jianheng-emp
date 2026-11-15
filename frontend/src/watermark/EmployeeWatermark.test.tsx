import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Model } from '../api';

vi.mock('antd', async importOriginal => ({
    ...await importOriginal<typeof import('antd')>(),
    Watermark: ({ content }: { content: string | string[] }) => <span data-testid="watermark">{content}</span>,
}));

import { EmployeeWatermark } from './EmployeeWatermark';

function account(overrides: Model<'CurrentUser'> = {}): Model<'CurrentUser'> {
    return { id: 1, username: '1', ...overrides };
}

test('stamps the mis of the signed-in employee', () => {
    render(<EmployeeWatermark user={account({ username: 'zhangsan01', mis: 'zhangsan' })} />);

    expect(screen.getByTestId('watermark').textContent).toBe('mis zhangsan');
});

test('stamps the login account when no employee is linked', () => {
    render(<EmployeeWatermark user={account()} />);

    expect(screen.getByTestId('watermark').textContent).toBe('mis 1');
});

test('renders no watermark before the account is identified', () => {
    const { container } = render(<EmployeeWatermark user={{}} />);

    expect(container.querySelector('.watermark-layer')).toBeNull();
});
