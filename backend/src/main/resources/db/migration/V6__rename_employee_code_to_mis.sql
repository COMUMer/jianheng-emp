ALTER TABLE employee RENAME COLUMN code TO mis;
ALTER TABLE employee MODIFY mis VARCHAR(64) NOT NULL;
ALTER TABLE employee RENAME INDEX code TO mis;

CREATE TABLE mis_sequence (
    base VARCHAR(40) NOT NULL PRIMARY KEY,
    issued INT NOT NULL
);

INSERT INTO mis_sequence(base, issued)
SELECT REGEXP_REPLACE(mis, '[0-9]+$', '') AS base,
       MAX(CASE WHEN mis REGEXP '[0-9]+$' THEN CAST(REGEXP_SUBSTR(mis, '[0-9]+$') AS UNSIGNED) ELSE 1 END)
FROM employee
GROUP BY base;

UPDATE account a
JOIN employee e ON e.id = a.employee_id
SET a.username = e.mis
WHERE a.username <> e.mis;
