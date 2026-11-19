-- 在途待办按或签规则回填替代审批人，已处理节点保持历史。
UPDATE approval_task t
JOIN document_revision r ON r.id = t.revision_id
JOIN work_document d ON d.id = r.document_id
JOIN approval_template_node n ON n.template_id = r.template_id AND n.ordinal = t.ordinal
JOIN account a ON a.id = n.alternate_id AND a.active = TRUE
JOIN employment emp ON emp.employee_id = a.employee_id AND emp.departed_on IS NULL
SET t.alternate_id = n.alternate_id
WHERE t.alternate_id IS NULL
  AND t.status IN ('ACTIVE', 'WAITING')
  AND n.alternate_id IS NOT NULL
  AND n.alternate_id <> t.assignee_id
  AND n.alternate_id <> d.owner_id
  AND (n.assignment <> 'FINANCE' OR EXISTS (
      SELECT 1 FROM account_role ar WHERE ar.account_id = n.alternate_id AND ar.role = 'FINANCE'));
