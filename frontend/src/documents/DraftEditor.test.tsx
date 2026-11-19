import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../api';
import { DraftEditor } from './DraftEditor';

vi.mock('../api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api')>()),
    api: vi.fn(),
}));

beforeEach(() => { vi.mocked(api).mockReset(); });

test('shows the expense total and required marks', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/expenses/categories') return [{ id: 1, name: '差旅费' }] as never;
        throw new Error(`Unexpected request: ${path}`);
    });
    render(<App><DraftEditor kind="EXPENSE" close={vi.fn()} saved={vi.fn()} /></App>);

    fireEvent.click(await screen.findByRole('button', { name: '添加明细' }));
    fireEvent.click(screen.getByRole('button', { name: '添加明细' }));

    const amounts = screen.getAllByRole('spinbutton');
    expect(amounts).toHaveLength(2);
    fireEvent.change(amounts[0], { target: { value: '1017' } });
    fireEvent.change(amounts[1], { target: { value: '339' } });

    await waitFor(() => expect(screen.getByText(/1,356\.00/)).toBeTruthy());
    expect(document.querySelectorAll('.ant-form-item-required').length).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll('.required-mark')).toHaveLength(3);
});

test.each([['LEAVE', 4], ['TRIP', 5], ['PURCHASE', 3]] as const)('marks required fields for %s applications', async (kind, count) => {
    render(<App><DraftEditor kind={kind} close={vi.fn()} saved={vi.fn()} /></App>);

    await screen.findByRole('dialog');
    expect(document.querySelectorAll('.required-mark')).toHaveLength(count);
});

test('requires the departure and destination when submitting a trip', async () => {
    const user = userEvent.setup();
    render(<App><DraftEditor kind="TRIP" close={vi.fn()} saved={vi.fn()} /></App>);

    await user.type(await screen.findByLabelText('申请标题'), '出差');
    await user.click(screen.getByRole('button', { name: '提交审批' }));

    expect(await screen.findByText('请填写出发地点')).toBeTruthy();
    expect(screen.getByText('请填写出差地点')).toBeTruthy();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
});

test('requires the conditional fields when submitting but keeps drafts flexible', async () => {
    const user = userEvent.setup();
    render(<App><DraftEditor kind="LEAVE" close={vi.fn()} saved={vi.fn()} /></App>);

    await user.type(await screen.findByLabelText('申请标题'), '请假');
    await user.click(screen.getByRole('button', { name: '提交审批' }));

    expect(await screen.findByText('请选择请假类型')).toBeTruthy();
    expect(screen.getByText('请选择开始日期')).toBeTruthy();
    expect(screen.getByText('请选择结束日期')).toBeTruthy();
    expect(screen.getByText('请填写申请事由')).toBeTruthy();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
});

test('requires a purchase attachment before submitting', async () => {
    const user = userEvent.setup();
    render(<App><DraftEditor kind="PURCHASE" close={vi.fn()} saved={vi.fn()} /></App>);

    await user.type(await screen.findByLabelText(/申请标题/), '采购电脑');
    await user.type(screen.getByLabelText(/预计金额/), '1000');
    await user.type(screen.getByLabelText(/申请事由/), '办公需要');
    await user.click(screen.getByRole('button', { name: '提交审批' }));

    expect(await screen.findByText('请上传采购附件')).toBeTruthy();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
});