import { CameraOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Form, Image, Radio, Select, Tag } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Model } from '../api';
import { formatDate, operationLabel, roleLabel } from '../format';
import type { Role } from '../format';
import { LeaveConfirmModal, reloadTarget, useLeaveGuard } from '../leaveGuard';
import { ProcessFeed } from '../process';
import { EmployeeFields } from './EmployeeFields';
import type { OrganizationOption } from './EmployeeFields';
import { PersonAvatar, avatarUrl } from './avatar';
import type { Department } from './departments';
import { maskBankCard, maskIdCard } from './mask';
import { SensitiveValue } from './SensitiveValue';
import './employee-profile.css';

export type EmploymentView = Model<'Employment'> & { departmentPath?: string };

export function EmployeeStatus({ departedOn }: Pick<Model<'Employee'>, 'departedOn'>) {
    return <Tag color={departedOn ? 'default' : 'success'}>{departedOn ? '已离职' : '在职'}</Tag>;
}

export function AccountStatus({ accountActive }: Pick<Model<'Employee'>, 'accountActive'>) {
    if (accountActive == null) return <Tag>未开通</Tag>;
    return <Tag color={accountActive ? 'success' : 'error'}>{accountActive ? '已启用' : '已停用'}</Tag>;
}

const profileFormId = 'employee-profile-form';
const accountFormId = 'employee-account-form';
const backTarget = '__back__';

export function EmployeeProfile({ profile, account, history, employments, departmentPath, departments, positions, manageAccount, editable, busy,
    onSaveProfile, onSaveAccount, onDeparture, onRehire, onChangeAvatar, avatarBusy, onBack, leaveGuardRef }: {
    profile: Model<'Employee'>;
    account?: Model<'EmployeeDetail'>['account'];
    history?: Model<'EmployeeDetail'>['history'];
    employments?: EmploymentView[];
    departmentPath?: string;
    departments?: readonly Department[];
    positions?: OrganizationOption[];
    manageAccount: boolean;
    editable: boolean;
    busy: boolean;
    onSaveProfile?: (value: Model<'EmployeeInput'>) => Promise<boolean> | void;
    onSaveAccount?: (value: Model<'AccountInput'>) => Promise<boolean> | void;
    onDeparture?: () => void;
    onRehire?: () => void;
    onChangeAvatar?: (file: File) => void;
    avatarBusy?: boolean;
    onBack?: () => void;
    leaveGuardRef?: RefObject<(() => void) | null>;
}) {
    const avatarInput = useRef<HTMLInputElement>(null);
    const [profileForm] = Form.useForm<Model<'EmployeeInput'>>();
    const [accountForm] = Form.useForm<Model<'AccountInput'>>();
    const [profileDirty, setProfileDirty] = useState(false);
    const [accountDirty, setAccountDirty] = useState(false);
    const [leaveTo, setLeaveTo] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const navigate = useNavigate();
    const dirty = profileDirty || accountDirty;
    const { reloadPage } = useLeaveGuard(dirty, setLeaveTo);
    const joinDays = profile.joinedOn && !profile.departedOn
        ? dayjs().startOf('day').diff(dayjs(profile.joinedOn), 'day') + 1 : 0;

    async function saveProfile(value: Model<'EmployeeInput'>) {
        if (await onSaveProfile?.(value) === false) return;
        setProfileDirty(false);
    }

    async function saveAccount(value: Model<'AccountInput'>) {
        if (await onSaveAccount?.(value) === false) return;
        setAccountDirty(false);
    }

    function goTo(target: string) {
        if (target === backTarget) onBack?.();
        else if (target === reloadTarget) reloadPage();
        else navigate(target);
    }

    const requestBack = useCallback(() => {
        if (!dirty) { onBack?.(); return; }
        setLeaveTo(backTarget);
    }, [dirty, onBack]);
    useEffect(() => {
        if (!leaveGuardRef) return;
        leaveGuardRef.current = requestBack;
        return () => { leaveGuardRef.current = null; };
    }, [leaveGuardRef, requestBack]);

    function leaveWithoutSaving() {
        const target = leaveTo;
        setLeaveTo(null);
        setProfileDirty(false);
        setAccountDirty(false);
        if (target) goTo(target);
    }

    async function saveAndLeave() {
        if (!leaveTo) return;
        setLeaving(true);
        try {
            if (profileDirty && onSaveProfile) {
                let values: Model<'EmployeeInput'>;
                try { values = await profileForm.validateFields(); }
                catch { setLeaveTo(null); return; }
                if (await onSaveProfile(values) === false) return;
                setProfileDirty(false);
            }
            if (accountDirty && onSaveAccount) {
                let values: Model<'AccountInput'>;
                try { values = await accountForm.validateFields(); }
                catch { setLeaveTo(null); return; }
                if (await onSaveAccount(values) === false) return;
                setAccountDirty(false);
            }
            const target = leaveTo;
            setLeaveTo(null);
            goTo(target);
        } finally { setLeaving(false); }
    }

    return <>
        <div className="employee-profile">
        <Card>
            <div className="employee-summary-top">
                <div className="employee-identity">
                    <span className="employee-avatar">
                        {profile.avatarKey
                            ? <Image className="employee-avatar-image" src={avatarUrl(profile.avatarKey)} alt={`${profile.name}的头像`}
                                width={100} height={100} preview={{ cover: '查看头像' }} />
                            : <PersonAvatar name={profile.name} size={100} />}
                        {onChangeAvatar && <>
                            <Button className="avatar-change" size="small" shape="circle" loading={avatarBusy} aria-label="更换头像"
                                icon={avatarBusy ? undefined : <CameraOutlined aria-hidden />}
                                onClick={() => avatarInput.current?.click()} />
                            <input ref={avatarInput} type="file" accept="image/*" hidden onChange={event => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (file) onChangeAvatar(file);
                            }} />
                        </>}
                    </span>
                    <div className="employee-identity-text">
                        <div className="employee-name-row"><h1>{profile.name}</h1><EmployeeStatus departedOn={profile.departedOn} />
                            {joinDays >= 1 && <span className="join-days-badge">
                                <span aria-hidden>🌱</span>入职 {joinDays} 天
                            </span>}
                        </div>
                        <dl className="employee-summary-fields">
                            <div><dt>mis</dt><dd>{profile.mis}</dd></div>
                            <div><dt>部门</dt><dd>{departmentPath || profile.departmentName}</dd></div>
                            <div><dt>岗位</dt><dd>{profile.positionName}</dd></div>
                        </dl>
                    </div>
                </div>
                {editable && <Button danger disabled={busy} onClick={onDeparture}>登记离职</Button>}
                {!editable && profile.departedOn && onRehire && <Button type="primary" disabled={busy} onClick={onRehire}>重新入职</Button>}
            </div>
        </Card>
        <div className="employee-profile-grid">
            <Card title={<h2>员工资料</h2>} extra={editable && <Button type="primary" htmlType="submit" form={profileFormId} loading={busy}>保存档案</Button>}>
                {editable ? <Form<Model<'EmployeeInput'>> id={profileFormId} form={profileForm} layout="vertical"
                    initialValues={profile} disabled={busy} onFinish={saveProfile} onValuesChange={() => setProfileDirty(true)}>
                    <h3 className="employee-profile-subheading">基本信息</h3>
                    <EmployeeFields departments={departments} positions={positions} disabled={busy} />
                </Form> : <>
                    <h3 className="employee-profile-subheading">基本信息</h3>
                    <Descriptions colon={false} column={{ xs: 1, sm: 2 }} items={[
                        { key: 'join', label: '入职日期', children: profile.joinedOn },
                        { key: 'depart', label: '离职日期', children: profile.departedOn ?? '—' },
                    ]} />
                    <section className="detail-section">
                        <h3>联系方式</h3>
                        <Descriptions colon={false} column={{ xs: 1, sm: 2 }} items={[
                            { key: 'phone', label: '联系电话', children: profile.phone || '—' },
                            { key: 'email', label: '电子邮箱', children: profile.email || '—' },
                            { key: 'address', label: '现住址', children: profile.address || '—', span: 'filled' },
                            { key: 'emergencyContact', label: '紧急联系人', children: profile.emergencyContact || '—' },
                            { key: 'emergencyPhone', label: '紧急联系电话', children: profile.emergencyPhone || '—' },
                        ]} />
                    </section>
                    <section className="detail-section">
                        <h3>证件与银行账户</h3>
                        <Descriptions colon={false} column={{ xs: 1, sm: 2 }} items={[
                            { key: 'idCard', label: '身份证号', children: <SensitiveValue value={profile.idCard} mask={maskIdCard} label="身份证号" /> },
                            { key: 'bankCard', label: '银行卡号', children: <SensitiveValue value={profile.bankCard} mask={maskBankCard} label="银行卡号" /> },
                            { key: 'bankName', label: '开户银行名称', children: profile.bankName || '—' },
                            { key: 'cnapsCode', label: '联行号', children: profile.cnapsCode || '—' },
                        ]} />
                    </section>
                </>}
            </Card>
            <div className="employee-profile-sidebar">
                {manageAccount && <Card title={<h2>账号与权限</h2>} extra={editable && <Button type="primary" htmlType="submit"
                    form={accountFormId} loading={busy}>{account ? '保存账号' : '开通账号'}</Button>}>
                    {editable ? <Form<Model<'AccountInput'>> id={accountFormId} form={accountForm} className="account-form" layout="vertical" disabled={busy}
                        initialValues={account ?? { active: true, roles: ['EMPLOYEE'] }} onFinish={saveAccount} onValuesChange={() => setAccountDirty(true)}>
                        <Form.Item name="roles" label="权限角色" extra="员工基础权限随账号开通授予。">
                            <Select mode="multiple" options={Object.entries(roleLabel).filter(([key]) => key !== 'ADMIN').map(([value, label]) => ({ value: value as Role, label }))} />
                        </Form.Item>
                        <div className="account-enable-row">
                            <span className="account-enable-label"><span className="required-mark" aria-hidden>*</span>账号状态</span>
                            <Form.Item name="active" noStyle>
                                <Radio.Group className="status-radio">
                                    <Radio value={true}>启用</Radio>
                                    <Radio value={false}>停用</Radio>
                                </Radio.Group>
                            </Form.Item>
                        </div>
                        {!account && <p className="form-hint">开通后默认密码为身份证后 6 位。</p>}
                    </Form> : account ? <Descriptions size="small" column={1} items={[
                        { key: 'status', label: '账号状态', children: <Tag color={account.active ? 'success' : 'default'}>{account.active ? '已启用' : '已停用'}</Tag> },
                        { key: 'roles', label: '权限角色', children: account.roles?.map(role => <Tag key={role}>{roleLabel[role]}</Tag>) },
                    ]} /> : <p className="muted">尚未开通账号</p>}
                    {account && <p className="employee-audit muted">
                        创建 {formatDate(account.createdAt)}　编辑 {formatDate(account.updatedAt)}　最近操作人 {account.operator || '—'}
                    </p>}
                </Card>}
                <Card title={<h2>任职经历</h2>}>
                    {employments?.length ? <ul className="employment-history">{employments.map(item => <li key={item.id}>
                        <dl className="employment-history-fields">
                            <div><dt>部门</dt><dd>{item.departmentPath || item.departmentName || '—'}</dd></div>
                            <div className="employment-history-position">
                                <dt>岗位</dt><dd>{item.positionName || '—'}</dd>
                                <dd className="employment-history-range">{item.joinedOn} 至 {item.departedOn ?? '今'}
                                    {!item.departedOn && <Tag color="success">当前</Tag>}</dd>
                            </div>
                        </dl>
                    </li>)}</ul> : <p className="muted">暂无任职记录</p>}
                </Card>
                <Card title={<h2>人事变动</h2>}>
                    {history?.length ? <ProcessFeed newestFirst markEnds nodes={history.map(item => {
                        const title = (item.operation && operationLabel[item.operation]) || item.detail || '变更';
                        return { key: item.id ?? item.occurredAt ?? 0, title, state: 'done' as const, badge: 'success', actor: item.actor, employeeId: item.actorEmployeeId, avatarKey: item.actorAvatarKey, at: item.occurredAt,
                            note: item.detail && item.detail !== title ? item.detail : undefined };
                    })} /> : <p className="muted">暂无人事变动记录</p>}
                </Card>
            </div>
        </div>
    </div>
    <LeaveConfirmModal open={leaveTo !== null} saving={leaving}
        description="当前员工档案还有未保存的修改，是否先保存再离开？"
        onDiscard={leaveWithoutSaving} onCancel={() => setLeaveTo(null)} onSave={() => void saveAndLeave()} />
    </>;
}