import { Popover, Tag } from 'antd';
import { useState } from 'react';
import { api } from '../api';
import type { Model } from '../api';
import { PersonAvatar } from './avatar';

type CardState = 'idle' | 'loading' | 'error';

/** 列表头像入口：点击后按需加载并展示员工名片。 */
export function EmployeeCardAvatar({ employeeId, name, avatarKey, size = 32, className }: {
    employeeId?: number;
    name?: string;
    avatarKey?: string;
    size?: number;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [card, setCard] = useState<Model<'EmployeeCard'>>();
    const [state, setState] = useState<CardState>('idle');
    const avatar = <PersonAvatar name={name} avatarKey={avatarKey} size={size} />;

    function change(next: boolean) {
        setOpen(next);
        if (!next || !employeeId || card || state === 'loading') return;
        setState('loading');
        api<Model<'EmployeeCard'>>(`/people/directory/${employeeId}`)
            .then(value => { setCard(value); setState('idle'); })
            .catch(() => setState('error'));
    }

    if (!employeeId) return avatar;
    return <Popover trigger="click" open={open} onOpenChange={change} placement="bottomLeft"
        content={<EmployeeCardContent card={card} state={state} fallbackName={name} fallbackAvatarKey={avatarKey} />}>
        <button type="button" className={['person-card-trigger', className].filter(Boolean).join(' ')}
            aria-label={`查看${name ?? '员工'}的信息`}>
            {avatar}
        </button>
    </Popover>;
}

function EmployeeCardContent({ card, state, fallbackName, fallbackAvatarKey }: {
    card?: Model<'EmployeeCard'>;
    state: CardState;
    fallbackName?: string;
    fallbackAvatarKey?: string;
}) {
    const name = card?.name ?? fallbackName;
    const avatarKey = card?.avatarKey ?? fallbackAvatarKey;
    return <div className="employee-card">
        <div className="employee-card-head">
            <PersonAvatar name={name} avatarKey={avatarKey} size={44} />
            <div className="employee-card-title">
                <strong>{name ?? '员工'}</strong>
                <span>{card?.mis ? `mis ${card.mis}` : state === 'loading' ? '加载中…' : ''}</span>
            </div>
            {card && <Tag color={card.departedOn ? 'default' : 'success'}>{card.departedOn ? '已离职' : '在职'}</Tag>}
        </div>
        {card ? <dl className="employee-card-facts">
            <div><dt>部门</dt><dd>{card.departmentName || '—'}</dd></div>
            <div><dt>岗位</dt><dd>{card.positionName || '—'}</dd></div>
            <div><dt>入职日期</dt><dd>{card.joinedOn || '—'}</dd></div>
            {card.departedOn && <div><dt>离职日期</dt><dd>{card.departedOn}</dd></div>}
        </dl> : state === 'error' ? <p className="employee-card-error">暂时无法加载员工信息</p> : null}
    </div>;
}