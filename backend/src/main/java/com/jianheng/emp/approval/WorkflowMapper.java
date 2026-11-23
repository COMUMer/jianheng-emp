package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface WorkflowMapper {
    @Insert("INSERT INTO work_document(kind, owner_id, updated_by, document_no) VALUES(#{kind}, #{owner}, #{owner}, #{documentNo})")
    void createDocument(Kind kind, long owner, String documentNo);

    @Insert("""
        INSERT INTO document_number(kind, period, seq) VALUES(#{kind}, #{period}, LAST_INSERT_ID(1))
        ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)
        """)
    void bumpNumber(String kind, String period);

    @Select("SELECT LAST_INSERT_ID()")
    long lastNumber();
    @Update("UPDATE work_document SET updated_by=#{actor} WHERE id=#{id}") void touch(long id, long actor);
    @Select("SELECT LAST_INSERT_ID()") long insertedId();
    @Select("SELECT * FROM work_document WHERE id=#{id}") Document document(long id);
    @Select("SELECT * FROM work_document WHERE id=#{id} FOR UPDATE") Document lockDocument(long id);
    @Update("UPDATE work_document SET current_revision_id=#{revision} WHERE id=#{id}") void pointToRevision(long id, long revision);
    @Update("UPDATE work_document SET status=#{status} WHERE id=#{id}") void changeStatus(long id, Status status);

    @Insert("""
        INSERT INTO document_revision(document_id,title,reason,leave_type,starts_at,ends_at,origin,destination,amount)
        VALUES(#{id},#{draft.title},#{draft.reason},#{draft.leaveType},#{draft.startsAt},#{draft.endsAt},#{draft.origin},#{draft.destination},#{total})
        """) void createRevision(long id, Draft draft, BigDecimal total);
    @Update("""
        UPDATE document_revision SET title=#{draft.title},reason=#{draft.reason},leave_type=#{draft.leaveType},
          starts_at=#{draft.startsAt},ends_at=#{draft.endsAt},origin=#{draft.origin},destination=#{draft.destination},amount=#{total}
        WHERE id=#{id} AND submitted_at IS NULL
        """) void updateDraft(long id, Draft draft, BigDecimal total);
    @Update("UPDATE document_revision SET department_id=#{department},department_name=#{name},template_id=#{template},submitted_at=CURRENT_TIMESTAMP(6) WHERE id=#{id}")
    void freeze(long id, long department, String name, long template);
    @Select("SELECT * FROM document_revision WHERE id=#{id}") Revision revision(long id);
    @Select("SELECT * FROM document_revision WHERE document_id=#{id} ORDER BY id DESC") List<Revision> revisions(long id);
    @Select("SELECT EXISTS(SELECT 1 FROM document_revision WHERE document_id=#{id} AND submitted_at IS NOT NULL)") boolean hasSubmittedRevision(long id);

    @Delete("DELETE FROM expense_line WHERE revision_id=#{id}") void clearLines(long id);
    @Insert("INSERT INTO expense_line(revision_id,category_id,description,occurred_on,amount) VALUES(#{id},#{line.categoryId},#{line.description},#{line.occurredOn},#{line.amount})")
    void addLine(long id, LineInput line);
    @Select("SELECT l.id,l.category_id,c.name AS category,l.description,l.occurred_on,l.amount FROM expense_line l JOIN expense_category c ON c.id=l.category_id WHERE l.revision_id=#{id} ORDER BY l.id")
    List<Line> lines(long id);
    String CATEGORIES = "SELECT c.*, COALESCE(op.name, a.username) AS operator FROM expense_category c LEFT JOIN account a ON a.id=c.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";
    @Select(CATEGORIES + "ORDER BY CASE WHEN c.name = '其他' THEN 1 ELSE 0 END, c.id") List<Category> categories();
    @Select(CATEGORIES + "WHERE c.id=#{id}") Category category(long id);
    @Insert("INSERT INTO expense_category(name, updated_by) VALUES(#{name}, #{actor})") void addCategory(String name, long actor);
    @Update("UPDATE expense_category SET name=#{name}, updated_by=#{actor} WHERE id=#{id}") void changeCategory(long id, String name, long actor);
    @Update("UPDATE expense_category SET active=#{active}, updated_by=#{actor} WHERE id=#{id}")
    void setCategoryActive(long id, boolean active, long actor);
    @Select("SELECT COUNT(*) FROM expense_line WHERE category_id=#{id}") int categoryUses(long id);
    @Delete("DELETE FROM expense_category WHERE id=#{id}") void deleteCategory(long id);
    @Select("""
        SELECT COUNT(*) FROM expense_line l JOIN expense_category c ON c.id=l.category_id
        WHERE l.revision_id=#{id} AND c.active=FALSE
        """) int inactiveCategoryLines(long revisionId);

    @Insert("INSERT INTO document_file(uploaded_by,storage_key,original_name,digest,content_type,category) VALUES(#{owner},#{key},#{name},#{digest},#{contentType},#{category})")
    void addFile(long owner, String key, String name, String digest, String contentType, FileCategory category);
    @Update("UPDATE document_file SET category=#{category} WHERE id=#{id}") void updateFileCategory(long id, FileCategory category);
    @Select("SELECT * FROM document_file WHERE id=#{id}") FileRecord file(long id);
    @Select("SELECT f.* FROM document_file f JOIN revision_file rf ON f.id=rf.file_id WHERE rf.revision_id=#{id} ORDER BY f.id") List<FileRecord> files(long id);
    @Select("SELECT r.document_id FROM revision_file rf JOIN document_revision r ON r.id=rf.revision_id WHERE rf.file_id=#{id} FOR UPDATE") List<Long> documentsForFile(long id);
    @Select("SELECT DISTINCT r.document_id FROM revision_file rf JOIN document_revision r ON r.id=rf.revision_id WHERE rf.file_id=#{id} AND r.submitted_at IS NOT NULL") List<Long> submittedDocumentsForFile(long id);
    @Select("SELECT id FROM document_file WHERE id=#{id} FOR UPDATE") Long lockFile(long id);
    @Delete("DELETE FROM revision_file WHERE revision_id=#{id}") void clearFiles(long id);
    @Insert("INSERT INTO revision_file(revision_id,file_id) VALUES(#{revision},#{file})") void attach(long revision, long file);

    @Insert("INSERT INTO approval_template(kind, updated_by) VALUES(#{kind}, #{actor})") void addTemplate(Kind kind, long actor);
    String TEMPLATES = "SELECT t.*, COALESCE(op.name, a.username) AS operator FROM approval_template t LEFT JOIN account a ON a.id=t.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";
    @Select(TEMPLATES + "WHERE t.kind=#{kind} ORDER BY t.id DESC LIMIT 1") Template latest(Kind kind);
    @Select(TEMPLATES + "WHERE t.id=#{id}") Template template(long id);
    @Insert("INSERT INTO approval_template_node(template_id,ordinal,label,assignment,account_id,alternate_id,minimum,due_hours) VALUES(#{id},#{ordinal},#{node.label},#{node.assignment},#{node.accountId},#{node.alternateId},#{node.minimum},#{node.dueHours})")
    void addNode(long id, int ordinal, NodeInput node);
    @Select("SELECT label,assignment,account_id,alternate_id,minimum,due_hours FROM approval_template_node WHERE template_id=#{id} ORDER BY ordinal") List<Node> nodes(long id);
    @Insert("INSERT INTO approval_task(revision_id,ordinal,label,assignee_id,alternate_id,assignment,status,due_hours) VALUES(#{id},#{ordinal},#{node.label},#{assignee},#{alternate},#{node.assignment},'WAITING',#{node.dueHours})")
    void addTask(long id, int ordinal, Node node, long assignee, Long alternate);
    @Select("SELECT id FROM approval_task WHERE status = 'ACTIVE' AND due_at < CURRENT_TIMESTAMP(6)")
    List<Long> overdueTaskIds();

    @Update("UPDATE approval_task SET status = 'RETURNED' WHERE id = #{id} AND status = 'ACTIVE'")
    int returnOverdueTask(long id);

    @Select("SELECT id FROM account WHERE username = '系统'")
    Long systemAccountId();

    @Select("SELECT * FROM approval_task WHERE id=#{id}") Task task(long id);
    @Select("""
        SELECT t.id,t.revision_id,t.ordinal,t.label,t.assignee_id,
               COALESCE(ea.name,a.username) AS assignee,ea.avatar_key AS assignee_avatar_key,
               t.alternate_id,COALESCE(eb.name,b.username) AS alternate,eb.avatar_key AS alternate_avatar_key,
               t.assignment,t.status,t.due_hours,t.due_at
        FROM approval_task t
        JOIN account a ON a.id=t.assignee_id
        LEFT JOIN employee ea ON ea.id=a.employee_id
        LEFT JOIN account b ON b.id=t.alternate_id
        LEFT JOIN employee eb ON eb.id=b.employee_id
        WHERE t.revision_id=#{id}
        ORDER BY t.ordinal
        """) List<TaskView> tasks(long id);
    @Select("SELECT * FROM approval_task WHERE revision_id=#{id} AND status='WAITING' ORDER BY ordinal LIMIT 1") Task next(long id);
    @Update("UPDATE approval_task SET status='ACTIVE',due_at=#{deadline} WHERE id=#{id}") void activate(long id, LocalDateTime deadline);
    @Update("UPDATE approval_task SET status=#{status} WHERE id=#{id}") void taskStatus(long id, TaskStatus status);
    @Update("UPDATE approval_task SET status='CLOSED' WHERE revision_id=#{id} AND status='WAITING'") void closeWaiting(long id);
    @Update("UPDATE approval_task SET assignee_id=#{assignee},alternate_id=NULL WHERE id=#{id}") void reassign(long id, long assignee);
    @Insert("INSERT INTO approval_event(revision_id,task_id,actor_id,action,comment) VALUES(#{revision},#{task},#{actor},#{action},#{comment})")
    void event(long revision, Long task, long actor, String action, String comment);
    @Select("SELECT COALESCE(e.name,a.username) FROM account a LEFT JOIN employee e ON e.id=a.employee_id WHERE a.id=#{id}")
    String displayName(long id);

    @Select("SELECT e.id,e.task_id,COALESCE(ea.name,a.username) AS actor,ea.avatar_key AS actor_avatar_key,e.action,e.comment,e.occurred_at FROM approval_event e JOIN account a ON a.id=e.actor_id LEFT JOIN employee ea ON ea.id=a.employee_id WHERE e.revision_id=#{id} ORDER BY e.id")
    List<Event> events(long id);
    @Select("SELECT EXISTS(SELECT 1 FROM approval_task t JOIN document_revision r ON r.id=t.revision_id WHERE r.document_id=#{document} AND (t.assignee_id=#{account} OR t.alternate_id=#{account}) AND t.status IN ('ACTIVE','APPROVED','RETURNED')) OR EXISTS(SELECT 1 FROM approval_event e JOIN document_revision r ON r.id=e.revision_id WHERE r.document_id=#{document} AND e.actor_id=#{account})")
    boolean involved(long document, long account);

    @Update("""
        UPDATE work_document SET payment_claim_by = #{actor}, payment_claim_at = CURRENT_TIMESTAMP(6)
        WHERE id = #{id} AND status = 'AWAITING_PAYMENT'
          AND (payment_claim_by IS NULL
               OR payment_claim_at < DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 5 MINUTE)
               OR payment_claim_by = #{actor})
        """)
    int claimPayment(long id, long actor);

    @Select("SELECT payment_claim_by FROM work_document WHERE id = #{id}")
    Long paymentClaimBy(long id);

    @Update("UPDATE work_document SET payment_claim_by = NULL, payment_claim_at = NULL "
        + "WHERE id = #{id} AND payment_claim_by = #{actor}")
    void releasePayment(long id, long actor);

    @Insert("INSERT INTO expense_payment(document_id,paid_on,paid_by) VALUES(#{id},#{payment.paidOn},#{actor})")
    void addPayment(long id, PaymentInput payment, long actor);
    @Insert("INSERT INTO expense_payment_file(document_id,file_id) VALUES(#{document},#{file})")
    void addPaymentFile(long document, long file);
    @Delete("DELETE FROM expense_payment_file WHERE document_id=#{id}") void clearPaymentFiles(long id);
    @Update("UPDATE expense_payment SET paid_on=#{paidOn} WHERE document_id=#{id}") void updatePaymentDate(long id, LocalDate paidOn);
    @Select("SELECT paid_by FROM expense_payment WHERE document_id=#{id}") Long paymentPayer(long id);
    @Select("SELECT f.* FROM document_file f JOIN expense_payment_file pf ON pf.file_id=f.id WHERE pf.document_id=#{id} ORDER BY f.id")
    List<FileRecord> paymentFiles(long id);
    @Select("SELECT document_id FROM expense_payment_file WHERE file_id=#{id}")
    List<Long> paymentDocumentsForFile(long id);
    @Select("SELECT p.paid_on,p.paid_by,COALESCE(ea.name,a.username) AS payer,ea.avatar_key AS payer_avatar_key FROM expense_payment p JOIN account a ON a.id=p.paid_by LEFT JOIN employee ea ON ea.id=a.employee_id WHERE p.document_id=#{id}") Payment payment(long id);
    @Select("SELECT e.name,e.bank_name,e.bank_card,e.cnaps_code FROM account a JOIN employee e ON e.id=a.employee_id WHERE a.id=#{id}")
    PayeeAccount payeeAccount(long accountId);
    @Insert("INSERT INTO notification(recipient_id,document_id,actor_id,message) VALUES(#{recipient},#{document},#{actor},#{message})")
    void notify(long recipient, long document, long actor, String message);
    @Select("""
        SELECT n.id,n.document_id,n.message,n.read_at,n.created_at,
               COALESCE(e.name,a.username) AS actor, e.id AS actor_employee_id, e.avatar_key AS actor_avatar_key
        FROM notification n LEFT JOIN account a ON a.id=n.actor_id
        LEFT JOIN employee e ON e.id=a.employee_id
        WHERE n.recipient_id=#{id} ORDER BY n.id DESC LIMIT 200
        """) List<Notice> notices(long id);
    @Update("UPDATE notification SET read_at=CURRENT_TIMESTAMP(6) WHERE id=#{id} AND recipient_id=#{recipient} AND read_at IS NULL") void readNotice(long id, long recipient);
    @Select("SELECT COUNT(*) FROM notification WHERE recipient_id=#{id} AND read_at IS NULL") int unread(long id);

    Summary summary(long id);
    List<Summary> mine(long owner);
    List<Summary> inbox(long account, boolean all, boolean payer);
    int inboxCount(long account, boolean all, boolean payer);
    List<Handled> handled(long account);
    List<Summary> ledger(Filter filter);
}
