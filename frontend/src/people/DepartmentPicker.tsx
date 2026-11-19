import { DownOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useState } from 'react';
import { departmentPath, departmentSubtree, departmentTree } from './departments';
import type { Department, DepartmentBranch } from './departments';
import './department-picker.css';

type PickerProps = {
    id?: string;
    title?: string;
    departments?: readonly Department[];
    value?: number;
    onChange?: (value?: number) => void;
    placeholder?: string;
    ariaLabel: string;
    allowClear?: boolean;
    clearLabel?: string;
    excludeId?: number;
    disabled?: boolean;
};

export function DepartmentPicker({ id, title = '选择部门', departments, value, onChange, placeholder = '请选择部门', ariaLabel,
    allowClear, clearLabel = '全部部门', excludeId, disabled }: PickerProps) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<number>();
    const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
    const path = departmentPath(departments, value);
    const excluded = excludeId === undefined ? undefined : departmentSubtree(departments, excludeId);
    const toggle = (id: number) => setCollapsed(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const confirm = () => {
        if (pending !== value) onChange?.(pending);
        setOpen(false);
    };

    return <>
        <button id={id} type="button" className="department-picker" aria-label={ariaLabel} aria-haspopup="dialog"
            disabled={disabled} onClick={() => { setPending(value); setOpen(true); }}>
            <span className={path ? 'department-picker-value' : 'department-picker-placeholder'}>{path || placeholder}</span>
            <DownOutlined className="department-picker-chevron" aria-hidden />
        </button>
        <Modal open={!disabled && open} onCancel={() => setOpen(false)} onOk={confirm} title={title} okText="确定"
            cancelText="取消" centered width={480} destroyOnHidden>
            <div className="department-picker-card">
                <div className="department-picker-panel">
                    {allowClear && <button type="button" className="department-picker-any"
                        aria-current={pending === undefined ? 'true' : undefined}
                        onClick={() => setPending(undefined)}>{clearLabel}</button>}
                    <ul className="department-picker-tree">
                        {departmentTree(departments).map(node => <DepartmentNode key={node.id} node={node} depth={0} selected={pending}
                            excluded={excluded} collapsed={collapsed} onToggle={toggle} onSelect={setPending} />)}
                    </ul>
                </div>
            </div>
        </Modal>
    </>;
}

function DepartmentNode({ node, depth, selected, excluded, collapsed, onToggle, onSelect }: {
    node: DepartmentBranch;
    depth: number;
    selected?: number;
    excluded?: ReadonlySet<number>;
    collapsed: ReadonlySet<number>;
    onToggle: (id: number) => void;
    onSelect: (id?: number) => void;
}) {
    const id = node.id as number;
    const children = node.children ?? [];
    const expanded = !collapsed.has(id);
    return <li>
        <div className={'department-picker-row' + (selected === id ? ' is-selected' : '')}
            style={{ paddingLeft: 8 + depth * 18 }}>
            {children.length ? <button type="button" className="department-picker-toggle" aria-expanded={expanded}
                aria-label={(expanded ? '收起' : '展开') + (node.name ?? '')} onClick={() => onToggle(id)}>
                {expanded ? <MinusOutlined /> : <PlusOutlined />}</button>
                : <span className="department-picker-toggle is-empty" aria-hidden />}
            <button type="button" className="department-picker-option" aria-current={selected === id ? 'true' : undefined}
                disabled={excluded?.has(id)} onClick={() => onSelect(id)}>{node.name}</button>
        </div>
        {children.length > 0 && expanded && <ul className="department-picker-tree">
            {children.map(child => <DepartmentNode key={child.id} node={child} depth={depth + 1} selected={selected}
                excluded={excluded} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} />)}
        </ul>}
    </li>;
}
