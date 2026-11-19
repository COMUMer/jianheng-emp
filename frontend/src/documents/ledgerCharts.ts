import type { EChartsOption } from 'echarts';
import type { Model } from '../api';
import { formatMoney, statusLabel } from '../format';
import type { DocumentStatus } from '../format';

type Summary = Model<'Summary'>;

export type TrendPoint = { date: string; value: number };
export type DonutSegment = { name: string; value: number; color: string };

const ink = '#18221d';
const quiet = '#64726a';
const grid = '#eef2ee';
const brand = '#0f6b4f';

/** 状态环与图例共用同一份配色和顺序。 */
const statusColors: Record<DocumentStatus, string> = {
    DRAFT: '#9aa8a0', IN_REVIEW: '#3f8f70', RETURNED: '#b85450', APPROVED: '#4f8a6f', AWAITING_PAYMENT: '#e5b64b', PAID: brand,
};
const statusOrder: DocumentStatus[] = ['AWAITING_PAYMENT', 'IN_REVIEW', 'PAID', 'APPROVED', 'RETURNED'];
/** 部门之间没有语义色，按笔数从多到少取一组固定顺序的色板。 */
const departmentColors = ['#0f6b4f', '#e5b64b', '#4b7f8f', '#c98a6b', '#7fa99b', '#8f9f96'];

function axisMoney(value: number) {
    if (value >= 10000) {
        const wan = value / 10000;
        return `¥${wan >= 10 ? Math.round(wan) : wan.toFixed(1)}万`;
    }
    return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

/** 按日累计的金额序列：x 轴用 MM/DD，y 轴用万元缩写。 */
export function ledgerTrendOption(points: TrendPoint[]): EChartsOption {
    return {
        grid: { left: 4, right: 14, top: 20, bottom: 4, containLabel: true },
        tooltip: { trigger: 'axis', valueFormatter: value => formatMoney(Number(value)) },
        xAxis: {
            type: 'category', boundaryGap: false, data: points.map(point => point.date.slice(5).replace('-', '/')),
            axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: quiet, fontSize: 11 },
        },
        yAxis: {
            type: 'value', splitLine: { lineStyle: { color: grid, type: 'dashed' } },
            axisLabel: { color: quiet, fontSize: 11, formatter: axisMoney },
        },
        series: [{
            type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: points.map(point => point.value),
            lineStyle: { color: brand, width: 2 }, itemStyle: { color: brand, borderColor: '#fff', borderWidth: 1 },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: 'rgba(15,107,79,.18)' }, { offset: 1, color: 'rgba(15,107,79,0)' }],
                },
            },
        }],
    };
}

/** 单据状态构成；台账不出现草稿，「已通过」也不在台账状态里。 */
export function ledgerStatusDonut(rows: Summary[]): DonutSegment[] {
    const counts = new Map<DocumentStatus, number>();
    for (const row of rows) {
        if (row.status) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    return statusOrder.filter(status => counts.has(status))
        .map(status => ({ name: statusLabel[status], value: counts.get(status) ?? 0, color: statusColors[status] }));
}

/** 按提交部门统计笔数，超过 5 个部门时其余并成「其他」。 */
export function ledgerDepartmentDonut(rows: Summary[]): DonutSegment[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const department = row.departmentName?.trim();
        if (department) counts.set(department, (counts.get(department) ?? 0) + 1);
    }
    const ordered = [...counts.entries()].sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB));
    const segments = ordered.slice(0, 5).map(([name, value], index) => ({ name, value, color: departmentColors[index] }));
    const rest = ordered.slice(5);
    if (rest.length) {
        segments.push({ name: '其他', value: rest.reduce((sum, [, value]) => sum + value, 0), color: departmentColors[5] });
    }
    return segments;
}

/** 环只画环与中心总数，图例由页面用 DOM 渲染，字号和断行都可控。 */
export function donutOption(segments: DonutSegment[]): EChartsOption {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    return {
        tooltip: { trigger: 'item', formatter: '{b}：{c} 笔（{d}%）' },
        title: {
            text: String(total), subtext: '总计', left: 'center', top: '34%', itemGap: 2,
            textStyle: { color: ink, fontSize: 20, fontWeight: 600 }, subtextStyle: { color: quiet, fontSize: 11 },
        },
        series: [{
            type: 'pie', radius: ['62%', '80%'], center: ['50%', '50%'], label: { show: false }, labelLine: { show: false },
            itemStyle: { borderColor: '#fff', borderWidth: 2 },
            data: segments.map(segment => ({ name: segment.name, value: segment.value, itemStyle: { color: segment.color } })),
        }],
    };
}
