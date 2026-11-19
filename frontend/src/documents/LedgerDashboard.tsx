import { Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { Model } from '../api';
import { EChart } from '../charts/EChart';
import { donutOption, ledgerDepartmentDonut, ledgerStatusDonut, ledgerTrendOption } from './ledgerCharts';
import type { DonutSegment, TrendPoint } from './ledgerCharts';
import './ledger-dashboard.css';

type Period = 'month' | '7d' | '30d';
type Summary = Model<'Summary'>;

const periods: { value: Period; label: string }[] = [
    { value: 'month', label: '本月' },
    { value: '7d', label: '近 7 天' },
    { value: '30d', label: '近 30 天' },
];

function rangeFor(period: Period) {
    const today = dayjs();
    if (period === 'month') return { start: today.startOf('month'), end: today.endOf('day') };
    const days = period === '7d' ? 7 : 30;
    return { start: today.subtract(days - 1, 'day').startOf('day'), end: today.endOf('day') };
}

function inRange(value: string | undefined, start: dayjs.Dayjs, end: dayjs.Dayjs) {
    if (!value) return false;
    const date = dayjs(value);
    return !date.isBefore(start, 'day') && !date.isAfter(end, 'day');
}

/** 区间内逐日补零，图上看不出断点。 */
function trendPoints(rows: Summary[], start: dayjs.Dayjs, end: dayjs.Dayjs): TrendPoint[] {
    const totals = new Map<string, number>();
    for (const row of rows) {
        if (!row.submittedAt) continue;
        const key = dayjs(row.submittedAt).format('YYYY-MM-DD');
        totals.set(key, (totals.get(key) ?? 0) + Number(row.amount ?? 0));
    }
    const points: TrendPoint[] = [];
    for (let date = start; !date.isAfter(end, 'day'); date = date.add(1, 'day')) {
        const key = date.format('YYYY-MM-DD');
        points.push({ date: key, value: totals.get(key) ?? 0 });
    }
    return points;
}

function TrendChart({ points }: { points: TrendPoint[] }) {
    return <div className="ledger-trend-chart"><EChart option={ledgerTrendOption(points)} label="费用总览图" /></div>;
}

function DonutBlock({ segments, label }: { segments: DonutSegment[]; label: string }) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);

    return <div className="ledger-status-body">
        {!!segments.length && <div className="ledger-donut-chart"><EChart option={donutOption(segments)} label={label} /></div>}
        <ul className="ledger-status-legend">
            {segments.map(segment => <li key={segment.name}>
                <span className="ledger-status-dot" style={{ background: segment.color }} aria-hidden />
                <span className="ledger-status-name">{segment.name}</span>
                <strong>{segment.value}</strong>
                <small>{total ? Math.round(segment.value / total * 100) : 0}%</small>
            </li>)}
            {!segments.length && <li className="ledger-status-empty">本期暂无申请</li>}
        </ul>
    </div>;
}

export function LedgerDashboard({ rows }: { rows: Summary[] }) {
    const [period, setPeriod] = useState<Period>('month');
    const range = rangeFor(period);
    const periodRows = rows.filter(row => inRange(row.submittedAt, range.start, range.end));
    const points = trendPoints(rows, range.start, range.end);
    const statusSegments = ledgerStatusDonut(periodRows);
    const departmentSegments = ledgerDepartmentDonut(periodRows);

    return <section className="ledger-dashboard" aria-label="费用概览">
        <article className="ledger-panel ledger-trend-panel">
            <div className="ledger-panel-head">
                <div><h3>费用总览</h3><p className="ledger-panel-sub">本期提交的报销金额</p></div>
                <Select className="ledger-period-select" size="small" value={period} onChange={setPeriod} options={periods}
                    popupMatchSelectWidth={false} aria-label="费用概览周期" />
            </div>
            <TrendChart points={points} />
        </article>
        <div className="ledger-dashboard-side">
            <article className="ledger-panel">
                <div className="ledger-panel-head"><div><h3>申请分布</h3><p className="ledger-panel-sub">本期申请笔数</p></div></div>
                <div className="ledger-donut-groups">
                    <div className="ledger-donut-group">
                        <h4 className="ledger-donut-title">按状态</h4>
                        <DonutBlock segments={statusSegments} label="申请状态分布图" />
                    </div>
                    <div className="ledger-donut-group">
                        <h4 className="ledger-donut-title">按部门</h4>
                        <DonutBlock segments={departmentSegments} label="申请部门分布图" />
                    </div>
                </div>
            </article>
        </div>
    </section>;
}
