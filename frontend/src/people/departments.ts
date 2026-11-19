import type { Model } from '../api';

export type Department = Pick<Model<'Department'>, 'id' | 'name' | 'parentId' | 'active'>;
export type DepartmentBranch = Department & { children?: DepartmentBranch[] };

/** 按上级链拼出完整路径，例如 `见衡/总办/人力资源部`。 */
export function departmentPath(departments: readonly Department[] | undefined, id?: number): string {
    if (!departments?.length || id === undefined) return '';
    const byId = new Map<number, Department>();
    for (const department of departments) {
        if (department.id !== undefined) byId.set(department.id, department);
    }
    const names: string[] = [];
    const visited = new Set<number>();
    let current = byId.get(id);
    while (current?.id !== undefined && !visited.has(current.id)) {
        visited.add(current.id);
        names.unshift(current.name ?? '');
        current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    return names.filter(Boolean).join('/');
}

/** 把扁平部门按 parentId 组成树，供表格和选择器复用。 */
export function departmentTree(departments: readonly Department[] | undefined): DepartmentBranch[] {
    const nodes = new Map<number, DepartmentBranch>();
    for (const department of departments ?? []) if (department.id !== undefined) nodes.set(department.id, { ...department });
    const roots: DepartmentBranch[] = [];
    for (const node of nodes.values()) {
        const parent = node.parentId === undefined ? undefined : nodes.get(node.parentId);
        if (parent && parent.id !== node.id) (parent.children ??= []).push(node);
        else roots.push(node);
    }
    return roots;
}

/** 某个部门及其所有下级部门的 id，用于禁止把部门挂到自己的子树下。 */
export function departmentSubtree(departments: readonly Department[] | undefined, id: number): ReadonlySet<number> {
    const children = new Map<number, number[]>();
    for (const department of departments ?? []) {
        if (department.id === undefined || department.parentId === undefined) continue;
        const siblings = children.get(department.parentId) ?? [];
        siblings.push(department.id);
        children.set(department.parentId, siblings);
    }
    const ids = new Set<number>([id]);
    const queue = [id];
    while (queue.length) {
        const current = queue.shift();
        for (const child of children.get(current as number) ?? []) {
            if (ids.has(child)) continue;
            ids.add(child);
            queue.push(child);
        }
    }
    return ids;
}
