import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { Model } from '../api';
import { ApprovalProcess } from './ApprovalProcess';

const summary: Model<'Summary'> = { applicant: '向鸿锐', status: 'IN_REVIEW', assignee: 'fanruxi', submittedAt: '2026-11-15T02:26:25' };

const round: Model<'RevisionView'> = {
    revision: { id: 1, submittedAt: '2026-11-15T02:26:25' },
    tasks: [
        { id: 1, ordinal: 1, label: '部门负责人', status: 'APPROVED' },
        { id: 2, ordinal: 2, label: '财务审批', status: 'ACTIVE', dueAt: '2026-11-17T02:55:00' },
        { id: 3, ordinal: 3, label: '法务审批', status: 'WAITING' },
    ],
    events: [
        { id: 1, action: 'SUBMIT', actor: '向鸿锐', occurredAt: '2026-11-15T02:26:25', comment: '提交审批' },
        { id: 2, taskId: 1, action: 'APPROVE', actor: 'lvqinhan', occurredAt: '2026-11-15T03:28:47', comment: '同意' },
    ],
};

test('进程按发起、审批节点顺序展示并标出当前节点', () => {
    render(<ApprovalProcess summary={summary} round={round} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes).toHaveLength(4);
    expect(nodes[0].textContent).toContain('发起审批');
    expect(nodes[0].textContent).toContain('已提交');
    expect(nodes[0].textContent).toContain('向鸿锐');
    expect(nodes[1].textContent).toContain('部门负责人');
    expect(nodes[1].textContent).toContain('已通过');
    expect(nodes[1].textContent).toContain('lvqinhan');
    expect(nodes[1].textContent).toContain('同意');
    expect(nodes[1].className).toContain('process-node-done');
    expect(nodes[1].querySelector('.process-avatar-badge')?.className).toContain('process-badge-success');
    expect(nodes[2].textContent).toContain('财务审批');
    expect(nodes[2].textContent).toContain('审批中');
    expect(nodes[2].textContent).toContain('fanruxi');
    expect(nodes[2].textContent).toContain('截止 2026-11-17 02:55');
    expect(nodes[2].className).toContain('process-node-current');
    expect(nodes[2].querySelector('.process-avatar-badge')?.className).toContain('process-badge-processing');
    expect(nodes[3].textContent).toContain('法务审批');
    expect(nodes[3].textContent).toContain('待审批');
    expect(nodes[3].className).toContain('process-node-waiting');
    expect(nodes[3].querySelector('.process-avatar-badge')).toBeNull();
});

test('退回节点显示意见，后续节点标记为未处理', () => {
    const returned: Model<'RevisionView'> = {
        revision: { id: 2, submittedAt: '2026-11-15T02:55:26' },
        tasks: [
            { id: 4, ordinal: 1, label: '财务审批', status: 'RETURNED' },
            { id: 5, ordinal: 2, label: '法务审批', status: 'CLOSED' },
        ],
        events: [
            { id: 3, action: 'SUBMIT', actor: '向鸿锐', occurredAt: '2026-11-15T02:55:26', comment: '提交审批' },
            { id: 4, taskId: 4, action: 'RETURN', actor: 'fanruxi', occurredAt: '2026-11-15T02:58:39', comment: '票号有误，请更正' },
        ],
    };
    render(<ApprovalProcess summary={{ ...summary, status: 'RETURNED', assignee: undefined }} round={returned} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes[1].textContent).toContain('已退回');
    expect(nodes[1].textContent).toContain('fanruxi');
    expect(nodes[1].textContent).toContain('票号有误，请更正');
    expect(nodes[1].className).toContain('process-node-failed');
    expect(nodes[1].querySelector('.process-avatar-badge')?.className).toContain('process-badge-error');
    expect(nodes[2].textContent).toContain('已关闭');
    expect(nodes[2].textContent).toContain('前序节点退回');
});

test('待付款与已付款追加付款节点', () => {
    const { unmount } = render(<ApprovalProcess summary={{ ...summary, status: 'AWAITING_PAYMENT', assignee: undefined }} round={round} latest />);
    let nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes.at(-1)?.textContent).toContain('登记付款');
    expect(nodes.at(-1)?.textContent).toContain('待付款');
    unmount();

    render(<ApprovalProcess summary={{ ...summary, status: 'PAID', assignee: undefined }} round={round} latest
        payment={{ paidOn: '2026-11-15', reference: '流水号 123', payer: 'fanruxi' }} />);
    nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes.at(-1)?.textContent).toContain('登记付款');
    expect(nodes.at(-1)?.textContent).toContain('已付款');
    expect(nodes.at(-1)?.textContent).toContain('流水号 123');
    expect(nodes.at(-1)?.textContent).toContain('2026-11-15');
});