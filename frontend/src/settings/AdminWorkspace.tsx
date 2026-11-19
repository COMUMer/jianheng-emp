import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { SearchBox } from '../SearchBox';
import { EllipsisText, PageHeading, ResourceState, listPagination } from '../common';
import { DateField } from '../dates';
import { inDateRange, matchesKeyword } from '../filter';
import { formatDate, kinds } from '../format';
import type { Kind } from '../format';
import { useResource } from '../useResource';

export function AdminWorkspace({ user }: { user: Model<'CurrentUser'> }) {
    const { message, modal } = App.useApp();
    const admin = !!user.roles?.includes('ADMIN');
    const [tab, setTab] = useState(admin ? 'templates' : 'categories');
    const [kind, setKind] = useState<Kind>('LEAVE');
    const [category, setCategory] = useState<Model<'Category'>>();
    const [categorySearch, setCategorySearch] = useState('');
    const [categoryActive, setCategoryActive] = useState<boolean>();
    const [auditSearch, setAuditSearch] = useState('');
    const [auditFrom, setAuditFrom] = useState<string>();
    const [auditTo, setAuditTo] = useState<string>();
    const [busy, setBusy] = useState(false);
    const templates = useResource<Model<'TemplateView'>> (tab === 'templates' ? `/approval/templates/${kind}` : null);
    const assignees = useResource<Model<'AccountOption'>[]>(tab === 'templates' ? '/approval/assignees' : null);
    const categories = useResource<Model<'Category'>[]>(tab === 'categories' ? '/expenses/categories' : null);
    const audit = useResource<Model<'Entry'>[]>(tab === 'audit' ? '/audit' : null);
    const options = assignees.data?.filter(account => account.employeeId).map(account => ({ value: account.id, label: account.name ?? account.username }));
    const defaultManager: Model<'NodeInput'> = { label: '部门负责人', assignment: 'MANAGER', dueHours: 48 };
    const defaultFinance: Model<'NodeInput'> = { label: '财务审核', assignment: 'FINANCE', dueHours: 48 };
    const initialNodes = templates.data?.nodes ?? (kind === 'EXPENSE' ? [defaultManager, defaultFinance] : [defaultManager]);
    const categoryRows = categories.data?.filter(item => (categoryActive === undefined || (item.active !== false) === categoryActive)
        && matchesKeyword([item.name, item.operator], categorySearch));
    const auditRows = audit.data?.filter(entry => inDateRange(entry.occurredAt, auditFrom, auditTo)
        && matchesKeyword([entry.actor, entry.operation, entry.detail, entry.objectId], auditSearch));

    function confirmDeleteCategory(item: Model<'Category'>) {
        modal.confirm({
            title: '删除费用类别',
            content: `确定删除「${item.name}」？仅未被使用的已停用数据可删除。`,
            centered: true,
            okText: '删除',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api(`/expenses/categories/${item.id}`, { method: 'DELETE' });
                    categories.reload();
                    message.success('已删除费用类别');
                } catch (error) {
                    message.error(showError(error));
                    throw error;
                }
            },
        });
    }

    return <>
        <PageHeading title="系统设置" action={tab === 'categories' && <Button type="primary" onClick={() => setCategory({})}>新增费用类别</Button>} />
        <section className="surface">
            <Tabs className="settings-tabs" activeKey={tab} onChange={setTab} items={[
                ...(admin ? [{ key: 'templates', label: '审批规则' }] : []), { key: 'categories', label: '费用类别' },
                ...(admin ? [{ key: 'audit', label: '操作审计' }] : []),
            ]} />
            {tab === 'templates' && <>
                <Tabs className="rule-kind-tabs" activeKey={kind} onChange={value => setKind(value as Kind)}
                    items={kinds.map(item => ({ key: item.value, label: item.label }))}
                    tabBarExtraContent={<span className="muted">{templates.data?.template?.id
                        ? `当前版本 ${templates.data.template.id}　${formatDate(templates.data.template.publishedAt)}` : '尚未发布规则'}</span>} />
                <p className="muted rule-hint">从上到下依次审批。新规则在下次提交时生效。</p>
                <ResourceState {...templates} retry={templates.reload}>
                    <Form key={`${kind}-${templates.data?.template?.id ?? 'new'}`} layout="vertical" initialValues={{ nodes: initialNodes }}
                        onFinish={async (value: { nodes: Model<'NodeInput'>[] }) => {
                            setBusy(true);
                            try { await api('/approval/templates', { method: 'POST', body: { kind, nodes: value.nodes } }); message.success('审批规则已发布'); templates.reload(); }
                            catch (error) { message.error(showError(error)); }
                            finally { setBusy(false); }
                        }}>
                        <Form.List name="nodes">{(fields, { add, remove, move }) => <>
                            {fields.map(({ key, name }, index) => <div key={key} className="rule-row">
                                <div className="section-heading"><h3>第 {index + 1} 步</h3><div className="toolbar">
                                    <Button type="text" disabled={index === 0} onClick={() => move(index, index - 1)}>上移</Button>
                                    <Button type="text" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>下移</Button>
                                    <Button type="text" danger disabled={fields.length === 1} onClick={() => remove(name)}>移除</Button>
                                </div></div>
                                <div className="form-grid rule-fields">
                                    <Form.Item name={[name, 'label']} label="节点名称" rules={[{ required: true }]}><Input maxLength={80} /></Form.Item>
                                    <Form.Item name={[name, 'assignment']} label="审批人来源" rules={[{ required: true }]}><Select options={[
                                        { value: 'MANAGER', label: '部门负责人' }, { value: 'FINANCE', label: '财务审核人' }, { value: 'NAMED', label: '指定审批人' },
                                    ]} /></Form.Item>
                                    <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue(['nodes', name, 'assignment']) !== 'MANAGER'
                                        && <Form.Item name={[name, 'accountId']} label="指定账号" rules={[{ required: true }]}><Select showSearch={{ optionFilterProp: 'label' }} options={options} /></Form.Item>}</Form.Item>
                                    <Form.Item name={[name, 'alternateId']} label="替代审批人" extra="与主审批人等价，任一处理即可。">
                                        <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={options} />
                                    </Form.Item>
                                    <Form.Item name={[name, 'dueHours']} label="处理时限（小时）" rules={[{ required: true }]}><InputNumber min={1} max={8760} precision={0} className="wide-input" /></Form.Item>
                                    {(kind === 'EXPENSE' || kind === 'PURCHASE') && index > 0 && <Form.Item name={[name, 'minimum']} label="达到金额才执行（元）">
                                        <InputNumber min={0.01} precision={2} className="wide-input" placeholder="留空表示必经" /></Form.Item>}
                                </div>
                            </div>)}
                            <div className="toolbar rule-actions"><Button disabled={fields.length >= 12} onClick={() => add({ ...defaultManager, label: '' })}>添加节点</Button>
                                <Button type="primary" htmlType="submit" loading={busy}>发布规则</Button></div>
                        </>}</Form.List>
                    </Form>
                </ResourceState>
            </>}
            {tab === 'categories' && <>
                <div className="toolbar filter-bar">
                    <Select allowClear value={categoryActive} onChange={setCategoryActive} placeholder="全部状态" aria-label="类别状态"
                        options={[{ value: true, label: '启用' }, { value: false, label: '停用' }]} />
                    <SearchBox value={categorySearch} onChange={setCategorySearch} onSearch={() => categories.reload()}
                        placeholder="搜索类别名称" ariaLabel="搜索费用类别" />
                </div>
                <ResourceState {...categories} retry={categories.reload}><Table rowKey="id" dataSource={categoryRows} pagination={listPagination} columns={[
                { title: '费用类别', dataIndex: 'name', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                { title: '状态', dataIndex: 'active', width: 80, render: (value?: boolean) => <Tag color={value === false ? 'default' : 'green'}>{value === false ? '停用' : '启用'}</Tag> },
                { title: '创建时间', dataIndex: 'createdAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
                { title: '编辑时间', dataIndex: 'updatedAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
                { title: '最近操作人', dataIndex: 'operator', width: 100, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                { title: '操作', width: 110, render: (_, item) => <Space size={8}>
                    <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} aria-label="编辑"
                        onClick={() => setCategory(item)} /></Tooltip>
                    {item.active === false && <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />}
                        aria-label="删除" onClick={() => confirmDeleteCategory(item)} /></Tooltip>}
                </Space> },
                ]} /></ResourceState>
            </>}
            {tab === 'audit' && <>
                <div className="toolbar filter-bar">
                    <label className="inline-date">从 <DateField value={auditFrom} onChange={setAuditFrom}
                        disabledDate={date => !!auditTo && date.isAfter(auditTo, 'day')} /></label>
                    <label className="inline-date">至 <DateField value={auditTo} onChange={setAuditTo}
                        disabledDate={date => !!auditFrom && date.isBefore(auditFrom, 'day')} /></label>
                    <SearchBox value={auditSearch} onChange={setAuditSearch} onSearch={() => audit.reload()}
                        placeholder="搜索操作人、操作或变更内容" ariaLabel="搜索操作审计" />
                </div>
                <ResourceState {...audit} retry={audit.reload}><Table rowKey="id" dataSource={auditRows} pagination={listPagination} columns={[
                    { title: '时间', dataIndex: 'occurredAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
                    { title: '操作人', dataIndex: 'actor', width: 110, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                    { title: '操作', dataIndex: 'operation', width: 230, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                    { title: '记录编号', dataIndex: 'objectId', width: 110 },
                    { title: '变更内容', dataIndex: 'detail', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                ]} /></ResourceState>
            </>}
        </section>
        {category && <Modal open centered title={category.id ? '编辑费用类别' : '新增费用类别'} onCancel={() => setCategory(undefined)}
            okButtonProps={{ form: 'category-editor', htmlType: 'submit', loading: busy }}>
            <Form id="category-editor" layout="vertical" initialValues={{ ...category, active: category.active !== false }}
                onFinish={async (value: Model<'NameInput'> & { active?: boolean }) => {
                    const { active, ...input } = value;
                    setBusy(true);
                    try {
                        await api(`/expenses/categories${category.id ? `/${category.id}` : ''}`,
                            { method: category.id ? 'PUT' : 'POST', body: input });
                        if (category.id && typeof active === 'boolean' && active !== (category.active !== false)) {
                            await api(`/expenses/categories/${category.id}/active`, { method: 'PUT', body: { active } });
                        }
                        setCategory(undefined); categories.reload(); message.success('已保存费用类别');
                    } catch (error) { message.error(showError(error)); }
                    finally { setBusy(false); }
                }}>
                <Form.Item name="name" label="类别名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
                {category.id && <Form.Item name="active" label="状态" className="status-field" required>
                    <Radio.Group className="status-radio">
                        <Radio value={true}>启用</Radio>
                        <Radio value={false}>停用</Radio>
                    </Radio.Group>
                </Form.Item>}
            </Form>
        </Modal>}
    </>;
}
