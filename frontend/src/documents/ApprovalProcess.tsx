import type { Model } from '../api';
import { formatDate } from '../format';
import { PersonAvatar } from '../people/avatar';
import { ProcessFeed } from '../process';
import type { ProcessNode, ProcessNodeState } from '../process';

function taskStatus(status?: Model<'TaskView'>['status']): { text: string; color: string } {
    if (status === 'APPROVED') return { text: '已通过', color: 'success' };
    if (status === 'RETURNED') return { text: '已驳回', color: 'error' };
    if (status === 'ACTIVE') return { text: '审批中', color: 'processing' };
    if (status === 'CLOSED') return { text: '已关闭', color: 'default' };
    return { text: '待审批', color: 'default' };
}

export function ApprovalProcess({ summary, round, payment, latest }: {
    summary?: Model<'Summary'>;
    round: Model<'RevisionView'>;
    payment?: Model<'Payment'>;
    latest?: boolean;
}) {
    const submittedAt = round.revision?.submittedAt;
    if (!submittedAt) return null;
    const events = round.events ?? [];
    const nodes: ProcessNode[] = [{
        key: 'submit',
        title: '发起审批',
        state: 'done',
        actor: summary?.applicant,
        avatarKey: summary?.applicantAvatarKey,
        at: submittedAt,
        status: { text: '已提交', color: 'success' },
        meta: summary?.applicant && `申请人：${summary.applicant}`,
    }];

    const tasks = [...(round.tasks ?? [])].sort((left, right) => (left.ordinal ?? 0) - (right.ordinal ?? 0));
    for (const task of tasks) {
        const history = events.filter(event => event.taskId === task.id);
        const action = [...history].reverse().find(event => event.action === 'APPROVE' || event.action === 'RETURN');
        const transfers = history.filter(event => event.action === 'TRANSFER');
        const state: ProcessNodeState = task.status === 'APPROVED' ? 'done' : task.status === 'RETURNED' ? 'failed'
            : task.status === 'ACTIVE' ? 'current' : 'waiting';
        const actor = task.status === 'ACTIVE' ? summary?.assignee ?? task.assignee
            : task.status === 'WAITING' ? task.assignee : action?.actor;
        const avatarKey = task.status === 'ACTIVE' ? summary?.assigneeAvatarKey ?? task.assigneeAvatarKey
            : task.status === 'WAITING' ? task.assigneeAvatarKey : action?.actorAvatarKey;
        const alternate = task.status === 'ACTIVE' ? summary?.alternate : task.status === 'WAITING' ? task.alternate : undefined;
        const alternateAvatarKey = task.status === 'ACTIVE' ? summary?.alternateAvatarKey
            : task.status === 'WAITING' ? task.alternateAvatarKey : undefined;
        const note = action?.comment || transfers.length ? <>
            {action?.comment && <div className="process-note-line">{action.comment}</div>}
            {transfers.map((transfer, index) => <div className="process-note-line" key={transfer.id ?? index}>
                <span>{transfer.comment ? `转派：${transfer.comment}` : '转派'}</span>
                {transfer.occurredAt && <span className="process-note-time">{formatDate(transfer.occurredAt)}</span>}
            </div>)}
        </> : undefined;
        const meta = actor ? (alternate ? <span className="process-approvers">审批人：
            <span className="process-approver"><PersonAvatar name={actor} avatarKey={avatarKey} size={18} />{actor}</span>
            <span className="process-approver-divider">/</span>
            <span className="process-approver"><PersonAvatar name={alternate} avatarKey={alternateAvatarKey} size={18} />{alternate}</span>
        </span> : `审批人：${actor}`)
            : task.status === 'CLOSED' ? '前序节点驳回，未处理' : undefined;
        nodes.push({
            key: task.id ?? `task-${task.ordinal}`,
            title: task.label ?? '审批',
            state,
            actor,
            avatarKey,
            at: action?.occurredAt,
            timeLabel: !action && task.status !== 'CLOSED' && task.dueAt ? `截止 ${formatDate(task.dueAt)}` : undefined,
            status: taskStatus(task.status),
            meta,
            note,
        });
    }

    if (latest && (summary?.status === 'AWAITING_PAYMENT' || summary?.status === 'PAID')) {
        const paid = summary.status === 'PAID';
        nodes.push({
            key: 'payment',
            title: '登记付款',
            state: paid ? 'done' : 'current',
            actor: paid ? payment?.payer : undefined,
            avatarKey: paid ? payment?.payerAvatarKey : undefined,
            at: paid ? payment?.paidOn : undefined,
            status: { text: paid ? '已付款' : '待付款', color: paid ? 'success' : 'warning' },
            meta: paid ? '已完成付款' : '等待登记付款',
        });
    }
    return <ProcessFeed nodes={nodes} />;
}