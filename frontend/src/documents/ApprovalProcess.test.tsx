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

test('待审批节点显示审批人与头像', () => {
    const waiting: Model<'RevisionView'> = {
        revision: { id: 3, submittedAt: '2026-11-18T22:33:00' },
        tasks: [
            { id: 6, ordinal: 1, label: '部门审批', status: 'APPROVED' },
            { id: 7, ordinal: 2, label: '财务审批', status: 'WAITING', assignee: 'fanruxi', assigneeAvatarKey: 'fan.png' },
            { id: 8, ordinal: 3, label: '法人审批', status: 'WAITING', assignee: 'lvqinhan' },
        ],
        events: [
            { id: 5, action: 'SUBMIT', actor: '向鸿锐', occurredAt: '2026-11-18T22:33:00' },
            { id: 6, taskId: 6, action: 'APPROVE', actor: 'yuanyuwei', occurredAt: '2026-11-18T22:34:00' },
        ],
    };
    render(<ApprovalProcess summary={summary} round={waiting} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes[2].textContent).toContain('财务审批');
    expect(nodes[2].textContent).toContain('fanruxi');
    expect(nodes[2].querySelector('.process-avatar .person-avatar')).toBeTruthy();
    expect(nodes[3].textContent).toContain('法人审批');
    expect(nodes[3].textContent).toContain('lvqinhan');
    expect(nodes[3].querySelector('.process-avatar .person-avatar')).toBeTruthy();
});

test('shows both approvers and their avatars without the either label', () => {
    const alternateSummary: Model<'Summary'> = { ...summary, assignee: 'yuanyuwei', assigneeAvatarKey: 'yuan.png',
        alternate: '向鸿锐', alternateAvatarKey: 'xiang.png' };
    const alternateRound: Model<'RevisionView'> = {
        ...round,
        tasks: [{ id: 2, ordinal: 2, label: '审批', status: 'ACTIVE', alternateId: 5, dueAt: '2026-11-19T00:05:00' }],
        events: [],
    };

    render(<ApprovalProcess summary={alternateSummary} round={alternateRound} latest />);

    const active = [...document.querySelectorAll('.process-node')][1] as HTMLElement;
    expect(active.textContent).toContain('yuanyuwei');
    expect(active.textContent).toContain('向鸿锐');
    expect(active.textContent).not.toContain('任一');
    expect(active.querySelectorAll('.process-approver .person-avatar')).toHaveLength(2);
});

test('转派记录在右侧显示时间', () => {
    const transferred: Model<'RevisionView'> = {
        ...round,
        events: [...(round.events ?? []),
            { id: 9, taskId: 2, action: 'TRANSFER', actor: '1', occurredAt: '2026-11-15T03:30:00', comment: 'fanruxi → lvqinhan，调整分工' },
            { id: 10, taskId: 2, action: 'TRANSFER', actor: '1', occurredAt: '2026-11-15T04:05:00', comment: 'lvqinhan → fanruxi，1111' }],
    };
    render(<ApprovalProcess summary={summary} round={transferred} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    const lines = [...nodes[2].querySelectorAll('.process-note-line')];
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('转派：fanruxi → lvqinhan，调整分工');
    expect(lines[0].querySelector('.process-note-time')?.textContent).toContain('2026-11-15 03:30');
    expect(lines[1].textContent).toContain('转派：lvqinhan → fanruxi，1111');
    expect(lines[1].querySelector('.process-note-time')?.textContent).toContain('2026-11-15 04:05');
});

test('驳回节点显示意见，后续节点标记为未处理', () => {
    const returned: Model<'RevisionView'> = {
        revision: { id: 2, submittedAt: '2026-11-15T02:55:26' },
        tasks: [
            { id: 4, ordinal: 1, label: '财务审批', status: 'RETURNED' },
            { id: 5, ordinal: 2, label: '法务审批', status: 'CLOSED' },
        ],
        events: [
            { id: 3, action: 'SUBMIT', actor: '向鸿锐', occurredAt: '2026-11-15T02:55:26', comment: '提交审批' },
            { id: 4, taskId: 4, action: 'RETURN', actor: 'fanruxi', occurredAt: '2026-11-15T02:58:39', comment: '金额有误，请更正' },
        ],
    };
    render(<ApprovalProcess summary={{ ...summary, status: 'RETURNED', assignee: undefined }} round={returned} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes[1].textContent).toContain('已驳回');
    expect(nodes[1].textContent).toContain('fanruxi');
    expect(nodes[1].textContent).toContain('金额有误，请更正');
    expect(nodes[1].className).toContain('process-node-failed');
    expect(nodes[1].querySelector('.process-avatar-badge')?.className).toContain('process-badge-error');
    expect(nodes[2].textContent).toContain('已关闭');
    expect(nodes[2].textContent).toContain('前序节点驳回');
});

test('待付款与已付款追加付款节点', () => {
    const { unmount } = render(<ApprovalProcess summary={{ ...summary, status: 'AWAITING_PAYMENT', assignee: undefined }} round={round} latest />);
    let nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes.at(-1)?.textContent).toContain('登记付款');
    expect(nodes.at(-1)?.textContent).toContain('待付款');
    unmount();

    render(<ApprovalProcess summary={{ ...summary, status: 'PAID', assignee: undefined }} round={round} latest
        payment={{ paidOn: '2026-11-15', payer: 'fanruxi' }} />);
    nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes.at(-1)?.textContent).toContain('登记付款');
    expect(nodes.at(-1)?.textContent).toContain('已付款');
    expect(nodes.at(-1)?.textContent).toContain('已完成付款');
    expect(nodes.at(-1)?.textContent).toContain('2026-11-15');
});