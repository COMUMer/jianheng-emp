import { expect, test } from 'vitest';
import { departmentPath, departmentSubtree, departmentTree } from './departments';

const departments = [
    { id: 1, name: '见衡', parentId: undefined },
    { id: 2, name: '总办', parentId: 1 },
    { id: 3, name: '人力资源部', parentId: 2 },
    { id: 4, name: '财务部', parentId: 2 },
];

test('joins the whole parent chain up to the root', () => {
    expect(departmentPath(departments, 3)).toBe('见衡/总办/人力资源部');
    expect(departmentPath(departments, 4)).toBe('见衡/总办/财务部');
});

test('shows a root department on its own', () => {
    expect(departmentPath(departments, 1)).toBe('见衡');
});

test('returns an empty path for unknown or missing data', () => {
    expect(departmentPath(departments, 99)).toBe('');
    expect(departmentPath(undefined, 3)).toBe('');
    expect(departmentPath(departments, undefined)).toBe('');
});

test('stops on a parent cycle instead of looping forever', () => {
    expect(departmentPath([{ id: 1, name: '甲', parentId: 2 }, { id: 2, name: '乙', parentId: 1 }], 1)).toBe('乙/甲');
});

test('builds the department tree in parent-child order', () => {
    const tree = departmentTree(departments);
    expect(tree.map(node => node.name)).toEqual(['见衡']);
    expect(tree[0].children?.map(node => node.name)).toEqual(['总办']);
    expect(tree[0].children?.[0].children?.map(node => node.name)).toEqual(['人力资源部', '财务部']);
});

test('collects a department together with its whole subtree', () => {
    expect([...departmentSubtree(departments, 2)]).toEqual([2, 3, 4]);
    expect([...departmentSubtree(departments, 4)]).toEqual([4]);
    expect([...departmentSubtree(departments, 99)]).toEqual([99]);
});
