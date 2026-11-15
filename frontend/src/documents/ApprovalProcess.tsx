import type { Model } from '../api';
import { formatDate } from '../format';
import { ProcessFeed } from '../process';
import type { ProcessNode, ProcessNodeState } from '../process';

function taskStatus(status?: Model<'Task'>['status']): { text: string; color: string } {
    if (status === 'APPROVED') return { text: '已通过', color: 'success' };
    if (status === 'RETURNED') return { text: '已退回', color: 'error' };
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
        const actor = task.status === 'ACTIVE' ? summary?.assignee : action?.actor;
        const avatarKey = task.status === 'ACTIVE' ? summary?.assigneeAvatarKey : action?.actorAvatarKey;
        const notes = [
            action?.comment ?? '',
            ...transfers.map(transfer => (transfer.comment ? `转派：${transfer.comment}` : '转派')),
        ].filter(Boolean);
        nodes.push({
            key: task.id ?? `task-${task.ordinal}`,
            title: task.label ?? '审批',
            state,
            actor,
            avatarKey,
            at: action?.occurredAt,
            timeLabel: !action && task.status !== 'CLOSED' && task.dueAt ? `截止 ${formatDate(task.dueAt)}` : undefined,
            status: taskStatus(task.status),
            meta: actor ? `审批人：${actor}`
                : task.status === 'CLOSED' ? '前序节点退回，未处理' : state === 'waiting' ? '待前序节点处理' : undefined,
            note: notes.length ? notes.join('\n') : undefined,
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
            meta: paid ? (payment?.reference && `付款凭证：${payment.reference}`) : '等待财务登记付款',
        });
    }
    return <ProcessFeed nodes={nodes} />;
}