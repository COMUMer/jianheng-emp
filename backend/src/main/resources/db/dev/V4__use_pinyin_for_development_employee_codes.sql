UPDATE employee e
JOIN account a ON a.employee_id = e.id
SET e.code = a.username
WHERE (e.code, a.username) IN (
    ('DEV-001', 'xianghongrui'),
    ('DEV-002', 'yuanyuwei'),
    ('DEV-003', 'suxinglong'),
    ('DEV-004', 'lvqinhan'),
    ('DEV-005', 'fanruxi')
);
