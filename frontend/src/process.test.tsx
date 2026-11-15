import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ProcessFeed } from './process';

test('进程节点显示头像、状态、时间、审批人和意见', () => {
    render(<ProcessFeed nodes={[
        { key: 1, title: '发起审批', state: 'done', actor: '向鸿锐', at: '2026-11-15T02:26:25', status: { text: '已提交', color: 'success' } },
        { key: 2, title: '财务审批', state: 'current', actor: 'fanruxi', timeLabel: '截止 2026-11-17 02:55',
            status: { text: '审批中', color: 'processing' }, meta: '审批人：fanruxi', note: '等待处理' },
    ]} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0].className).toContain('process-node-done');
    expect(nodes[0].textContent).toContain('发起审批');
    expect(nodes[0].textContent).toContain('已提交');
    expect(nodes[0].textContent).toContain('2026-11-15 02:26');
    expect(nodes[0].querySelector('.process-avatar')?.textContent).toBe('鸿锐');
    expect(nodes[0].querySelector('.process-avatar-badge')?.className).toContain('process-badge-success');
    expect(nodes[1].className).toContain('process-node-current');
    expect(nodes[1].querySelector('.process-avatar')?.textContent).toBe('F');
    expect(nodes[1].querySelector('.process-avatar-badge')?.className).toContain('process-badge-processing');
    expect(nodes[1].querySelector('.process-status')?.className).toContain('process-status-processing');
    expect(nodes[1].textContent).toContain('截止 2026-11-17 02:55');
    expect(nodes[1].textContent).toContain('审批人：fanruxi');
    expect(nodes[1].textContent).toContain('等待处理');
});

test('进程节点显示头像图片', () => {
    render(<ProcessFeed nodes={[{ key: 1, title: '发起审批', state: 'done', actor: '向鸿锐', avatarKey: 'avatar.jpg' }]} />);

    expect(document.querySelector('.process-avatar img')?.getAttribute('src')).toBe('/api/people/avatars/avatar.jpg');
});

test('倒序展示时标出最新与起点', () => {
    render(<ProcessFeed newestFirst markEnds nodes={[
        { key: 1, title: '更新档案', state: 'done', at: '2026-11-15T03:22:31' },
        { key: 2, title: '入职建档', state: 'done', at: '2026-11-15T09:30:00' },
        { key: 3, title: '账号变更', state: 'done', at: '2026-11-15T05:00:00' },
    ]} />);

    const nodes = [...document.querySelectorAll('.process-node')] as HTMLElement[];
    expect(nodes.map(node => node.querySelector('strong')?.textContent)).toEqual(['入职建档', '账号变更', '更新档案']);
    expect(nodes[0].textContent).toContain('最新');
    expect(nodes[1].textContent).not.toContain('最新');
    expect(nodes[2].textContent).toContain('起点');
});

test('只有一条记录时只标最新，不标起点', () => {
    render(<ProcessFeed newestFirst markEnds nodes={[{ key: 1, title: '入职建档', state: 'done', at: '2026-11-15T02:26:25' }]} />);

    expect(screen.getByText('最新')).toBeTruthy();
    expect(screen.queryByText('起点')).toBeNull();
});

test('没有处理人的未开始节点使用占位头像', () => {
    render(<ProcessFeed nodes={[{ key: 1, title: '法务部门审批', state: 'waiting', status: { text: '待审批', color: 'default' } }]} />);

    const node = document.querySelector('.process-node') as HTMLElement;
    expect(node.className).toContain('process-node-waiting');
    expect(node.querySelector('.process-avatar')?.textContent).toBe('');
    expect(node.querySelector('.process-avatar-badge')).toBeNull();
    expect(node.textContent).toContain('待审批');
});

test('没有状态标签的已执行节点也能显示完成角标', () => {
    render(<ProcessFeed nodes={[{ key: 1, title: '入职建档', state: 'done', badge: 'success', at: '2026-11-15T02:26:25' }]} />);

    const badge = document.querySelector('.process-avatar-badge');
    expect(badge?.className).toContain('process-badge-success');
});