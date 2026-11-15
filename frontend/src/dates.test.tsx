import { Form } from 'antd';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { expect, test } from 'vitest';
import { DateField, DateTimeField } from './dates';

type FieldKind = 'date' | 'datetime';

function renderField(kind: FieldKind, initial: string, props: { disabledDate?: (date: dayjs.Dayjs) => boolean; notBefore?: string } = {}) {
    const values: Record<string, string> = {};
    const user = userEvent.setup();
    render(<Form initialValues={{ when: initial }} onValuesChange={(_, all) => Object.assign(values, all)}>
        <Form.Item name="when" label="单据日期">
            {kind === 'date' ? <DateField {...props} /> : <DateTimeField {...props} />}
        </Form.Item>
    </Form>);
    return { user, values };
}

test('a date field shows and writes the same YYYY-MM-DD string', async () => {
    const { user, values } = renderField('date', '2026-11-15');
    const input = screen.getByLabelText('单据日期') as HTMLInputElement;
    expect(input.value).toBe('2026-11-15');

    await user.click(input);
    await user.click(screen.getByTitle('2026-11-16'));

    expect(values.when).toBe('2026-11-16');
    expect((screen.getByLabelText('单据日期') as HTMLInputElement).value).toBe('2026-11-16');
});

test('a date field cannot pick a day disabled by the caller', async () => {
    const { user, values } = renderField('date', '2026-11-15', { disabledDate: date => date.date() === 18 });
    await user.click(screen.getByLabelText('单据日期'));

    const blocked = screen.getByTitle('2026-11-18');
    expect(blocked.className).toContain('ant-picker-cell-disabled');
    await user.click(blocked);

    expect(values.when).toBeUndefined();
    expect((screen.getByLabelText('单据日期') as HTMLInputElement).value).toBe('2026-11-15');
});

test('a date time field displays minutes and writes a local ISO date time', async () => {
    const { user, values } = renderField('datetime', '2026-11-15T09:30');
    const input = screen.getByLabelText('单据日期') as HTMLInputElement;
    expect(input.value).toBe('2026-11-15 09:30');
    expect(input.placeholder).toBe('请选择时间');

    await user.click(input);
    await user.click(screen.getByTitle('2026-11-16'));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(values.when).toBe('2026-11-16T09:30');
    expect((screen.getByLabelText('单据日期') as HTMLInputElement).value).toBe('2026-11-16 09:30');
});

test('a date time field blocks every moment up to its lower bound', async () => {
    const { user } = renderField('datetime', '2026-11-16T10:00', { notBefore: '2026-11-15T09:30' });
    await user.click(screen.getByLabelText('单据日期'));

    expect(screen.getByTitle('2026-11-14').className).toContain('ant-picker-cell-disabled');
    expect(screen.getByTitle('2026-11-15').className).not.toContain('ant-picker-cell-disabled');
    await user.click(screen.getByTitle('2026-11-15'));

    const columns = [...document.querySelectorAll('.ant-picker-time-panel-column')];
    const disabled = (column: Element) => [...column.querySelectorAll('.ant-picker-time-panel-cell')]
        .filter(cell => cell.className.includes('ant-picker-time-panel-cell-disabled'))
        .map(cell => cell.textContent?.trim());
    expect(disabled(columns[0])).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08']);

    await user.click(within(columns[0] as HTMLElement).getByText('09'));
    expect(disabled(columns[1])).toEqual(Array.from({ length: 31 }, (_, minute) => String(minute).padStart(2, '0')));
});