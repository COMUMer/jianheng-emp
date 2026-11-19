import { expect, test } from 'vitest';
import type { Model } from '../api';
import { donutOption, ledgerDepartmentDonut, ledgerStatusDonut, ledgerTrendOption } from './ledgerCharts';

type Summary = Model<'Summary'>;

const rows: Summary[] = [
    { id: 1, status: 'PAID', amount: 100, submittedAt: '2026-11-15T10:00:00', departmentName: '财务部' },
    { id: 2, status: 'IN_REVIEW', amount: 25, submittedAt: '2026-11-16T10:00:00', departmentName: '研发部' },
    { id: 3, status: 'AWAITING_PAYMENT', amount: 5, submittedAt: '2026-11-16T12:00:00', departmentName: '研发部' },
    { id: 4, status: 'DRAFT', amount: 999, submittedAt: '2026-11-17T10:00:00', departmentName: '研发部' },
];

test('draws the trend over the points it is given', () => {
    const option = ledgerTrendOption([{ date: '2026-11-15', value: 100 }, { date: '2026-11-16', value: 30 }]);

    expect((option.xAxis as unknown as { data: string[] }).data).toEqual(['11/15', '11/16']);
    expect((option.series as unknown as { data: number[] }[])[0].data).toEqual([100, 30]);
});

test('lists status segments in the shared display order and skips drafts', () => {
    expect(ledgerStatusDonut(rows).map(segment => [segment.name, segment.value]))
        .toEqual([['待付款', 1], ['审批中', 1], ['已付款', 1]]);
});

test('groups the department ring by count, largest first', () => {
    expect(ledgerDepartmentDonut(rows).map(segment => [segment.name, segment.value]))
        .toEqual([['研发部', 3], ['财务部', 1]]);
});

test('folds departments past the fifth into 其他', () => {
    const many: Summary[] = Array.from({ length: 6 }, (_, index) => ({
        id: index + 1, status: 'PAID', amount: 1, departmentName: `部门${index + 1}`,
    }));

    const segments = ledgerDepartmentDonut(many);

    expect(segments).toHaveLength(6);
    expect(segments[5]).toMatchObject({ name: '其他', value: 1 });
});

test('draws the donut in the same order as the legend and centres the total', () => {
    const segments = ledgerStatusDonut(rows);
    const option = donutOption(segments);
    const data = (option.series as unknown as { data: { name: string; value: number }[] }[])[0].data;

    expect(data.map(item => [item.name, item.value])).toEqual([['待付款', 1], ['审批中', 1], ['已付款', 1]]);
    expect((option.title as { text: string }).text).toBe('3');
});
