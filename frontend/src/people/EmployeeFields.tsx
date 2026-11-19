import { Form, Input, Select } from 'antd';
import { DateField } from '../dates';
import { DepartmentPicker } from './DepartmentPicker';
import type { Department } from './departments';

const phoneRules = [
    { required: true, message: '请输入联系电话' },
    { pattern: /^(?:1[3-9]\d{9}|0\d{9,11})$/, message: '请输入有效的手机号或座机号' },
];
const emergencyPhoneRules = [
    { required: true, message: '请输入紧急联系电话' },
    { pattern: /^(?:1[3-9]\d{9}|0\d{9,11})$/, message: '请输入有效的紧急联系电话' },
];
const emailRules = [
    { required: true, message: '请输入电子邮箱' },
    { type: 'email' as const, message: '请输入有效的电子邮箱' },
];

function normalizePhone(value?: string) {
    return (value ?? '').replace(/[\s-]/g, '').replace(/^\+86/, '');
}

function normalizeDigits(value?: string) {
    return (value ?? '').replace(/[\s-]/g, '');
}

export type OrganizationOption = { value?: number; label?: string; active?: boolean };

export function EmploymentFields({ departments, positions, minDate, disabled }: {
    departments?: readonly Department[];
    positions?: OrganizationOption[];
    minDate?: string;
    disabled?: boolean;
}) {
    return <>
        <Form.Item name="departmentId" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
            <DepartmentPicker departments={departments?.filter(item => item.active !== false)} ariaLabel="部门"
                placeholder="请选择部门" disabled={disabled} />
        </Form.Item>
        <Form.Item name="positionId" label="岗位" rules={[{ required: true, message: '请选择岗位' }]}>
            <Select options={positions?.filter(item => item.active !== false)} placeholder="请选择岗位" />
        </Form.Item>
        <Form.Item name="joinedOn" label="入职日期" rules={[{ required: true, message: '请选择入职日期' }]}>
            <DateField className="wide-input" placeholder="请选择入职日期"
                disabledDate={minDate ? date => !date.isAfter(minDate, 'day') : undefined} />
        </Form.Item>
    </>;
}

export function EmployeeFields({ departments, positions, disabled }: {
    departments?: readonly Department[];
    positions?: OrganizationOption[];
    disabled?: boolean;
}) {
    return <>
        <div className="form-grid">
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input maxLength={100} placeholder="请输入姓名" />
            </Form.Item>
            <EmploymentFields departments={departments} positions={positions} disabled={disabled} />
        </div>
        <div className="form-section">
            <h3>联系方式</h3>
            <div className="form-grid">
                <Form.Item name="phone" label="联系电话" rules={phoneRules} normalize={normalizePhone}>
                    <Input maxLength={32} inputMode="tel" autoComplete="tel" placeholder="手机号或座机号" />
                </Form.Item>
                <Form.Item name="email" label="电子邮箱" rules={emailRules}>
                    <Input maxLength={120} autoComplete="email" placeholder="name@example.com" />
                </Form.Item>
            </div>
            <Form.Item name="address" label="现住址" rules={[{ required: true, message: '请输入现住址' }]}>
                <Input.TextArea maxLength={200} autoSize={{ minRows: 2, maxRows: 3 }} showCount placeholder="请输入详细现住址" />
            </Form.Item>
            <div className="form-grid">
                <Form.Item name="emergencyContact" label="紧急联系人" rules={[{ required: true, message: '请输入紧急联系人' }]}>
                    <Input maxLength={100} placeholder="请输入紧急联系人" />
                </Form.Item>
                <Form.Item name="emergencyPhone" label="紧急联系电话" rules={emergencyPhoneRules} normalize={normalizePhone}>
                    <Input maxLength={32} inputMode="tel" placeholder="手机号或座机号" />
                </Form.Item>
            </div>
        </div>
        <div className="form-section">
            <h3>证件与银行账户</h3>
            <div className="form-grid">
                <Form.Item name="idCard" label="身份证号" rules={[
                    { required: true, message: '请输入身份证号' },
                    { pattern: /^\d{17}[\dX]$/, message: '请输入 18 位身份证号' },
                ]} normalize={value => (value ?? '').toUpperCase()}>
                    <Input maxLength={18} autoComplete="off" placeholder="请输入 18 位身份证号" />
                </Form.Item>
                <Form.Item name="bankCard" label="银行卡号" rules={[
                    { required: true, message: '请输入银行卡号' },
                    { pattern: /^\d{12,19}$/, message: '请输入 12-19 位银行卡号' },
                ]} normalize={normalizeDigits}>
                    <Input maxLength={32} inputMode="numeric" autoComplete="off" placeholder="请输入 12-19 位银行卡号" />
                </Form.Item>
                <Form.Item name="bankName" label="开户银行名称" rules={[{ required: true, message: '请输入开户银行名称' }]}>
                    <Input maxLength={100} autoComplete="off" placeholder="请输入开户银行名称" />
                </Form.Item>
                <Form.Item name="cnapsCode" label="联行号" rules={[
                    { required: true, message: '请输入联行号' },
                    { pattern: /^\d{12}$/, message: '请输入 12 位联行号' },
                ]} normalize={normalizeDigits}>
                    <Input maxLength={16} inputMode="numeric" autoComplete="off" placeholder="请输入 12 位联行号" />
                </Form.Item>
            </div>
        </div>
    </>;
}