import { App, Button, Form, Input, InputNumber, Modal, Select, Table, Tabs } from 'antd';
import { useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { PageHeading, ResourceState } from '../common';
import { formatDate, kinds } from '../format';
import type { Kind } from '../format';
import { useResource } from '../useResource';

export function AdminWorkspace({ user }: { user: Model<'CurrentUser'> }) {
    const { message } = App.useApp();
    const admin = !!user.roles?.includes('ADMIN');
    const [tab, setTab] = useState(admin ? 'templates' : 'categories');
    const [kind, setKind] = useState<Kind>('LEAVE');
    const [category, setCategory] = useState<Model<'Category'>>();
    const [busy, setBusy] = useState(false);
    const templates = useResource<Model<'TemplateView'>> (tab === 'templates' ? `/approval/templates/${kind}` : null);
    const assignees = useResource<Model<'AccountOption'>[]>(tab === 'templates' ? '/approval/assignees' : null);
    const categories = useResource<Model<'Category'>[]>(tab === 'categories' ? '/expenses/categories' : null);
    const audit = useResource<Model<'Entry'>[]>(tab === 'audit' ? '/audit' : null);
    const options = assignees.data?.filter(account => account.employeeId).map(account => ({ value: account.id, label: account.name ?? account.username }));
    const defaultManager: Model<'NodeInput'> = { label: '部门负责人', assignment: 'MANAGER', dueHours: 48 };
    const defaultFinance: Model<'NodeInput'> = { label: '财务审核', assignment: 'FINANCE', dueHours: 48 };
    const initialNodes = templates.data?.nodes ?? (kind === 'EXPENSE' ? [defaultManager, defaultFinance] : [defaultManager]);

    return <>
        <PageHeading title="系统设置" action={tab === 'categories' && <Button type="primary" onClick={() => setCategory({})}>新增费用类别</Button>} />
        <section className="surface">
            <Tabs activeKey={tab} onChange={setTab} items={[
                ...(admin ? [{ key: 'templates', label: '审批规则' }] : []), { key: 'categories', label: '费用类别' },
                ...(admin ? [{ key: 'audit', label: '操作审计' }] : []),
            ]} />
            {tab === 'templates' && <>
                <div className="toolbar filter-bar"><Select options={kinds} value={kind} onChange={setKind} aria-label="流程类型" />
                    <span className="muted">{templates.data?.template?.id ? `当前版本 ${templates.data.template.id}　${formatDate(templates.data.template.publishedAt)}` : '尚未发布规则'}</span></div>
                <ResourceState {...templates} retry={templates.reload}>
                    <Form key={`${kind}-${templates.data?.template?.id ?? 'new'}`} layout="vertical" initialValues={{ nodes: initialNodes }}
                        onFinish={async (value: { nodes: Model<'NodeInput'>[] }) => {
                            setBusy(true);
                            try { await api('/approval/templates', { method: 'POST', body: { kind, nodes: value.nodes } }); message.success('审批规则已发布'); templates.reload(); }
                            catch (error) { message.error(showError(error)); }
                            finally { setBusy(false); }
                        }}>
                        <p className="muted">从上到下依次审批。新规则在下次提交时生效。</p>
                        <Form.List name="nodes">{(fields, { add, remove, move }) => <>
                            {fields.map(({ key, name }, index) => <div key={key} className="rule-row">
                                <div className="section-heading"><h3>第 {index + 1} 步</h3><div className="toolbar">
                                    <Button type="text" disabled={index === 0} onClick={() => move(index, index - 1)}>上移</Button>
                                    <Button type="text" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>下移</Button>
                                    <Button type="text" danger disabled={fields.length === 1} onClick={() => remove(name)}>移除</Button>
                                </div></div>
                                <div className="form-grid">
                                    <Form.Item name={[name, 'label']} label="节点名称" rules={[{ required: true }]}><Input maxLength={80} /></Form.Item>
                                    <Form.Item name={[name, 'assignment']} label="审批人来源" rules={[{ required: true }]}><Select options={[
                                        { value: 'MANAGER', label: '部门负责人' }, { value: 'FINANCE', label: '财务审核人' }, { value: 'NAMED', label: '指定审批人' },
                                    ]} /></Form.Item>
                                    <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue(['nodes', name, 'assignment']) !== 'MANAGER'
                                        && <Form.Item name={[name, 'accountId']} label="指定账号" rules={[{ required: true }]}><Select showSearch={{ optionFilterProp: 'label' }} options={options} /></Form.Item>}</Form.Item>
                                    <Form.Item name={[name, 'alternateId']} label="替代审批人"><Select allowClear showSearch={{ optionFilterProp: 'label' }} options={options} /></Form.Item>
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
            {tab === 'categories' && <ResourceState {...categories} retry={categories.reload}><Table rowKey="id" dataSource={categories.data} scroll={{ x: 760 }} columns={[
                { title: '费用类别', dataIndex: 'name' },
                { title: '创建时间', dataIndex: 'createdAt', render: formatDate },
                { title: '编辑时间', dataIndex: 'updatedAt', render: formatDate },
                { title: '操作人', dataIndex: 'operator', render: (value?: string) => value || '—' },
                { title: '操作', render: (_, item) => <Button type="link" className="table-link" onClick={() => setCategory(item)}>编辑</Button> },
            ]} /></ResourceState>}
            {tab === 'audit' && <ResourceState {...audit} retry={audit.reload}><Table rowKey="id" dataSource={audit.data} scroll={{ x: 660 }} columns={[
                { title: '时间', dataIndex: 'occurredAt', render: formatDate }, { title: '操作人', dataIndex: 'actor' },
                { title: '操作', dataIndex: 'operation' }, { title: '记录编号', dataIndex: 'objectId' }, { title: '变更内容', dataIndex: 'detail' },
            ]} /></ResourceState>}
        </section>
        {category && <Modal open title={category.id ? '编辑费用类别' : '新增费用类别'} onCancel={() => setCategory(undefined)}
            okButtonProps={{ form: 'category-editor', htmlType: 'submit', loading: busy }}>
            <Form id="category-editor" layout="vertical" initialValues={category} onFinish={async (value: Model<'NameInput'>) => {
                setBusy(true);
                try {
                    await api(`/expenses/categories${category.id ? `/${category.id}` : ''}`, { method: category.id ? 'PUT' : 'POST', body: value });
                    setCategory(undefined); categories.reload(); message.success('已保存费用类别');
                } catch (error) { message.error(showError(error)); }
                finally { setBusy(false); }
            }}><Form.Item name="name" label="类别名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item></Form>
        </Modal>}
    </>;
}
