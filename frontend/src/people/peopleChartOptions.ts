import type { EChartsOption } from 'echarts';

export type DepartmentHeadcount = { department: string; count: number };
export type EmploymentFlowPoint = { month: string; hired: number; departed: number };
export type TenureBucket = { label: string; count: number };

const quiet = '#64726a';
const line = '#eef2ee';
const green = '#0f6b4f';
const gold = '#e5b64b';
const sage = '#6f9d8c';

/** 部门在职人数占比：中心显示总人数，右侧图例带人数。 */
export function departmentShareOption(rows: DepartmentHeadcount[]): EChartsOption {
    return {
        color: [green, gold, sage, '#4b7f8f', '#c98a6b', '#8f9f96'],
        tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 人（{d}%）' },
        legend: {
            orient: 'vertical', right: 0, top: 'middle', icon: 'circle',
            itemWidth: 8, itemHeight: 8, itemGap: 14,
            textStyle: { color: quiet, fontSize: 12 },
            formatter: name => `${name}  ${rows.find(row => row.department === name)?.count ?? 0} 人`,
        },
        series: [{
            type: 'pie', radius: ['48%', '70%'], center: ['32%', '50%'], avoidLabelOverlap: true,
            itemStyle: { borderColor: '#fff', borderWidth: 4, borderRadius: 4 },
            label: { show: false },
            data: rows.map(row => ({ name: row.department, value: row.count })),
        }],
    };
}

/** 近 6 个月入职与离职人数。 */
export function employmentFlowOption(rows: EmploymentFlowPoint[]): EChartsOption {
    return {
        color: [green, gold],
        tooltip: { trigger: 'axis' },
        legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8,
            textStyle: { color: quiet, fontSize: 11 } },
        grid: { left: 4, right: 8, top: 34, bottom: 2, containLabel: true },
        xAxis: { type: 'category', data: rows.map(row => `${Number(row.month.slice(5))}月`),
            axisTick: { show: false }, axisLine: { lineStyle: { color: line } },
            axisLabel: { color: quiet, fontSize: 11 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: quiet, fontSize: 11 },
            splitLine: { lineStyle: { color: line } } },
        series: [
            { name: '入职', type: 'bar', barMaxWidth: 16, itemStyle: { color: green, borderRadius: [4, 4, 0, 0] },
                data: rows.map(row => row.hired),
                label: { show: true, position: 'top', color: quiet, fontSize: 11, formatter: value => value.value ? String(value.value) : '' } },
            { name: '离职', type: 'bar', barMaxWidth: 16, itemStyle: { color: gold, borderRadius: [4, 4, 0, 0] },
                data: rows.map(row => row.departed),
                label: { show: true, position: 'top', color: quiet, fontSize: 11, formatter: value => value.value ? String(value.value) : '' } },
        ],
    };
}

/** 在职员工司龄分布。 */
export function tenureOption(rows: TenureBucket[]): EChartsOption {
    return {
        color: [green],
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: value => `${value} 人` },
        grid: { left: 4, right: 8, top: 22, bottom: 2, containLabel: true },
        xAxis: { type: 'category', data: rows.map(row => row.label), axisTick: { show: false },
            axisLine: { lineStyle: { color: line } }, axisLabel: { color: quiet, fontSize: 11 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: quiet, fontSize: 11 },
            splitLine: { lineStyle: { color: line } } },
        series: [{
            type: 'bar', barMaxWidth: 34, itemStyle: { color: green, borderRadius: [6, 6, 0, 0] },
            data: rows.map(row => row.count),
            label: { show: true, position: 'top', color: quiet, fontSize: 11,
                formatter: value => value.value ? String(value.value) : '' },
        }],
    };
}