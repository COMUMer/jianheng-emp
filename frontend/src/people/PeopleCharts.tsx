import dayjs from 'dayjs';
import type { Model } from '../api';
import { EChart } from '../charts/EChart';
import { departmentPath } from './departments';
import { departmentShareOption, employmentFlowOption, tenureOption } from './peopleChartOptions';
import type { DepartmentHeadcount, EmploymentFlowPoint, TenureBucket } from './peopleChartOptions';
import './people-charts.css';

type Employee = Model<'Employee'>;
type Department = Model<'Department'>;

const tenureBuckets = [
    { label: '1 年以内', maxMonths: 12 },
    { label: '1–3 年', maxMonths: 36 },
    { label: '3–5 年', maxMonths: 60 },
    { label: '5 年以上', maxMonths: Number.POSITIVE_INFINITY },
];

function headcounts(employees: Employee[], departments?: Department[]): DepartmentHeadcount[] {
    const counts = new Map<string, number>();
    for (const employee of employees) {
        if (employee.departedOn) continue;
        const department = departmentPath(departments, employee.departmentId).split('/').pop() || '未分配';
        counts.set(department, (counts.get(department) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([department, count]) => ({ department, count }))
        .sort((left, right) => right.count - left.count || left.department.localeCompare(right.department, 'zh-CN'));
}

function tenure(employees: Employee[]): TenureBucket[] {
    const now = dayjs();
    const rows = tenureBuckets.map(bucket => ({ label: bucket.label, count: 0 }));
    for (const employee of employees) {
        if (employee.departedOn || !employee.joinedOn) continue;
        const months = now.diff(dayjs(employee.joinedOn), 'month');
        const index = tenureBuckets.findIndex(bucket => months < bucket.maxMonths);
        rows[index < 0 ? rows.length - 1 : index].count += 1;
    }
    return rows;
}

function flowPoints(rows?: Model<'EmploymentFlow'>[]): EmploymentFlowPoint[] {
    return (rows ?? []).slice(-6).map(row => ({
        month: row.month ?? '',
        hired: row.hired ?? 0,
        departed: row.departed ?? 0,
    }));
}

export function PeopleCharts({ employees, departments, flows }: {
    employees?: Employee[];
    departments?: Department[];
    flows?: Model<'EmploymentFlow'>[];
}) {
    const active = (employees ?? []).filter(employee => !employee.departedOn);
    const departmentsRows = headcounts(active, departments);
    const tenureRows = tenure(active);
    const flowRows = flowPoints(flows);
    const net = flowRows.reduce((sum, row) => sum + row.hired - row.departed, 0);

    return <section className="people-charts" aria-label="人员概览">
        <article className="people-chart-panel">
            <div className="people-chart-head">
                <div><h3>部门人员占比</h3><p className="people-chart-sub">当前在职员工按部门</p></div>
                <span className="people-chart-total">在职 {active.length} 人</span>
            </div>
            <div className="people-chart people-donut-chart">
                {active.length ? <>
                    <EChart option={departmentShareOption(departmentsRows)} label="部门在职人数占比图" />
                    <div className="people-donut-total"><strong>{active.length}</strong><span>在职</span></div>
                </> : <div className="people-chart-empty">暂无在职员工</div>}
            </div>
        </article>
        <article className="people-chart-panel people-flow-panel">
            <div className="people-chart-head">
                <div><h3>近 6 个月人员流动</h3><p className="people-chart-sub">入职与离职人数</p></div>
                <span className="people-chart-total">净增 {net >= 0 ? '+' : ''}{net}</span>
            </div>
            <div className="people-chart">
                {flowRows.length ? <EChart option={employmentFlowOption(flowRows)} label="近六个月入职离职人数图" />
                    : <div className="people-chart-empty">暂无人员流动数据</div>}
            </div>
        </article>
        <article className="people-chart-panel">
            <div className="people-chart-head">
                <div><h3>司龄结构</h3><p className="people-chart-sub">在职员工任职年限分布</p></div>
            </div>
            <div className="people-chart">
                {active.length ? <EChart option={tenureOption(tenureRows)} label="在职员工司龄结构图" />
                    : <div className="people-chart-empty">暂无在职员工</div>}
            </div>
        </article>
    </section>;
}