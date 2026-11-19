-- 审批资格改为「在职且绑定员工」，财务节点另需财务审核角色。
DELETE FROM account_role WHERE role = 'APPROVER';
