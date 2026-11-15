import { CameraOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Form, Image, Input, Select, Switch, Tag } from 'antd';
import dayjs from 'dayjs';
import { useRef } from 'react';
import type { Model } from '../api';
import { formatDate, operationLabel, roleLabel } from '../format';
import type { Role } from '../format';
import { ProcessFeed } from '../process';
import { EmployeeFields } from './EmployeeFields';
import type { OrganizationOption } from './EmployeeFields';
import { PersonAvatar, avatarUrl } from './avatar';
import { maskBankCard, maskIdCard } from './mask';
import { SensitiveValue } from './SensitiveValue';
import './employee-profile.css';

export function EmployeeStatus({ departedOn }: Pick<Model<'Employee'>, 'departedOn'>) {
    return <Tag color={departedOn ? 'default' : 'success'}>{departedOn ? '已离职' : '在职'}</Tag>;
}

const profileFormId = 'employee-profile-form';

export function EmployeeProfile({ profile, account, history, departmentPath, departments, positions, admin, editable, busy,
    onSaveProfile, onSaveAccount, onDeparture, onChangeAvatar, avatarBusy }: {
    profile: Model<'Employee'>;
    account?: Model<'EmployeeDetail'>['account'];
    history?: Model<'EmployeeDetail'>['history'];
    departmentPath?: string;
    departments?: OrganizationOption[];
    positions?: OrganizationOption[];
    admin: boolean;
    editable: boolean;
    busy: boolean;
    onSaveProfile?: (value: Model<'EmployeeInput'>) => void;
    onSaveAccount?: (value: Model<'AccountInput'>) => void;
    onDeparture?: () => void;
    onChangeAvatar?: (file: File) => void;
    avatarBusy?: boolean;
}) {
    const avatarInput = useRef<HTMLInputElement>(null);
    const joinDays = profile.joinedOn && !profile.departedOn
        ? dayjs().startOf('day').diff(dayjs(profile.joinedOn), 'day') + 1 : 0;
    return <div className="employee-profile">
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
            </div>
        </Card>
        <div className="employee-profile-grid">
            <Card title={<h2>员工资料</h2>} extra={editable && <Button type="primary" htmlType="submit" form={profileFormId} loading={busy}>保存档案</Button>}>
                {editable ? <Form<Model<'EmployeeInput'>> id={profileFormId} layout="vertical" initialValues={profile} disabled={busy} onFinish={onSaveProfile}>
                    <h3 className="employee-profile-subheading">基本信息</h3>
                    <EmployeeFields departments={departments} positions={positions} />
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
                {admin && <Card title={<h2>登录账号</h2>}>
                    <p className="account-mis">mis <strong>{profile.mis}</strong>，即登录账号。</p>
                    {editable ? <Form<Model<'AccountInput'>> layout="vertical" disabled={busy}
                        initialValues={account ?? { active: true, roles: ['EMPLOYEE'] }} onFinish={onSaveAccount}>
                        <Form.Item name="password" label={account ? '新密码（留空保留）' : '初始密码'} rules={[{ required: !account, min: 10 }]}>
                            <Input.Password autoComplete="new-password" />
                        </Form.Item>
                        <Form.Item name="roles" label="权限角色" extra="员工基础权限随账号开通授予。">
                            <Select mode="multiple" options={Object.entries(roleLabel).filter(([key]) => key !== 'ADMIN').map(([value, label]) => ({ value: value as Role, label }))} />
                        </Form.Item>
                        <Form.Item name="active" label="账号启用" valuePropName="checked"><Switch /></Form.Item>
                        <Button type="primary" htmlType="submit" loading={busy}>{account ? '保存账号' : '开通账号'}</Button>
                    </Form> : account ? <Descriptions size="small" column={1} items={[
                        { key: 'status', label: '账号状态', children: <Tag color={account.active ? 'success' : 'default'}>{account.active ? '已启用' : '已停用'}</Tag> },
                        { key: 'roles', label: '权限角色', children: account.roles?.map(role => <Tag key={role}>{roleLabel[role]}</Tag>) },
                    ]} /> : <p className="muted">尚未开通账号</p>}
                    {account && <p className="employee-audit muted">
                        创建 {formatDate(account.createdAt)}　编辑 {formatDate(account.updatedAt)}　操作人 {account.operator || '—'}
                    </p>}
                </Card>}
                <Card title={<h2>人事变动</h2>}>
                    {history?.length ? <ProcessFeed newestFirst markEnds nodes={history.map(item => {
                        const title = (item.operation && operationLabel[item.operation]) || item.detail || '变更';
                        return { key: item.id ?? item.occurredAt ?? 0, title, state: 'done' as const, badge: 'success', actor: item.actor, avatarKey: item.actorAvatarKey, at: item.occurredAt,
                            note: item.detail && item.detail !== title ? item.detail : undefined };
                    })} /> : <p className="muted">暂无人事变动记录</p>}
                </Card>
            </div>
        </div>
    </div>;
}
