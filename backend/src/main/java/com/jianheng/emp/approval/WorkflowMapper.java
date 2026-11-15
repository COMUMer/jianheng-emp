package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface WorkflowMapper {
    @Insert("INSERT INTO work_document(kind, owner_id, updated_by) VALUES(#{kind}, #{owner}, #{owner})") void createDocument(Kind kind, long owner);
    @Update("UPDATE work_document SET updated_by=#{actor} WHERE id=#{id}") void touch(long id, long actor);
    @Select("SELECT LAST_INSERT_ID()") long insertedId();
    @Select("SELECT * FROM work_document WHERE id=#{id}") Document document(long id);
    @Select("SELECT * FROM work_document WHERE id=#{id} FOR UPDATE") Document lockDocument(long id);
    @Update("UPDATE work_document SET current_revision_id=#{revision} WHERE id=#{id}") void pointToRevision(long id, long revision);
    @Update("UPDATE work_document SET status=#{status} WHERE id=#{id}") void changeStatus(long id, Status status);

    @Insert("""
        INSERT INTO document_revision(document_id,title,reason,leave_type,starts_at,ends_at,destination,amount)
        VALUES(#{id},#{draft.title},#{draft.reason},#{draft.leaveType},#{draft.startsAt},#{draft.endsAt},#{draft.destination},#{total})
        """) void createRevision(long id, Draft draft, BigDecimal total);
    @Update("""
        UPDATE document_revision SET title=#{draft.title},reason=#{draft.reason},leave_type=#{draft.leaveType},
          starts_at=#{draft.startsAt},ends_at=#{draft.endsAt},destination=#{draft.destination},amount=#{total}
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
    @Select(CATEGORIES + "ORDER BY c.id") List<Category> categories();
    @Select(CATEGORIES + "WHERE c.id=#{id}") Category category(long id);
    @Insert("INSERT INTO expense_category(name, updated_by) VALUES(#{name}, #{actor})") void addCategory(String name, long actor);
    @Update("UPDATE expense_category SET name=#{name}, updated_by=#{actor} WHERE id=#{id}") void changeCategory(long id, String name, long actor);

    @Insert("INSERT INTO document_file(uploaded_by,storage_key,original_name,digest,invoice_key) VALUES(#{owner},#{key},#{name},#{digest},#{invoice})")
    void addFile(long owner, String key, String name, String digest, String invoice);
    @Update("UPDATE document_file SET invoice_key=#{invoice} WHERE id=#{id}") void changeInvoice(long id, String invoice);
    @Select("SELECT DISTINCT d.status FROM revision_file rf JOIN document_revision r ON r.id=rf.revision_id JOIN work_document d ON d.id=r.document_id WHERE rf.file_id=#{id}")
    List<Status> documentStatusesForFile(long id);
    @Select("SELECT * FROM document_file WHERE id=#{id}") FileRecord file(long id);
    @Select("SELECT f.* FROM document_file f JOIN revision_file rf ON f.id=rf.file_id WHERE rf.revision_id=#{id} ORDER BY f.id") List<FileRecord> files(long id);
    @Select("SELECT r.document_id FROM revision_file rf JOIN document_revision r ON r.id=rf.revision_id WHERE rf.file_id=#{id} FOR UPDATE") List<Long> documentsForFile(long id);
    @Select("SELECT DISTINCT r.document_id FROM revision_file rf JOIN document_revision r ON r.id=rf.revision_id WHERE rf.file_id=#{id} AND r.submitted_at IS NOT NULL") List<Long> submittedDocumentsForFile(long id);
    @Select("SELECT id FROM document_file WHERE id=#{id} FOR UPDATE") Long lockFile(long id);
    @Delete("DELETE FROM revision_file WHERE revision_id=#{id}") void clearFiles(long id);
    @Insert("INSERT INTO revision_file(revision_id,file_id) VALUES(#{revision},#{file})") void attach(long revision, long file);
    @Insert("INSERT INTO invoice_reservation(invoice_key,document_id) VALUES(#{key},#{id})") void reserve(String key, long id);
    @Delete("DELETE FROM invoice_reservation WHERE document_id=#{id}") void release(long id);

    @Insert("INSERT INTO approval_template(kind, updated_by) VALUES(#{kind}, #{actor})") void addTemplate(Kind kind, long actor);
    String TEMPLATES = "SELECT t.*, COALESCE(op.name, a.username) AS operator FROM approval_template t LEFT JOIN account a ON a.id=t.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";
    @Select(TEMPLATES + "WHERE t.kind=#{kind} ORDER BY t.id DESC LIMIT 1") Template latest(Kind kind);
    @Select(TEMPLATES + "WHERE t.id=#{id}") Template template(long id);
    @Insert("INSERT INTO approval_template_node(template_id,ordinal,label,assignment,account_id,alternate_id,minimum,due_hours) VALUES(#{id},#{ordinal},#{node.label},#{node.assignment},#{node.accountId},#{node.alternateId},#{node.minimum},#{node.dueHours})")
    void addNode(long id, int ordinal, NodeInput node);
    @Select("SELECT label,assignment,account_id,alternate_id,minimum,due_hours FROM approval_template_node WHERE template_id=#{id} ORDER BY ordinal") List<Node> nodes(long id);
    @Insert("INSERT INTO approval_task(revision_id,ordinal,label,assignee_id,assignment,status,due_hours) VALUES(#{id},#{ordinal},#{node.label},#{assignee},#{node.assignment},'WAITING',#{node.dueHours})")
    void addTask(long id, int ordinal, Node node, long assignee);
    @Select("SELECT * FROM approval_task WHERE id=#{id}") Task task(long id);
    @Select("SELECT * FROM approval_task WHERE revision_id=#{id} ORDER BY ordinal") List<Task> tasks(long id);
    @Select("SELECT * FROM approval_task WHERE revision_id=#{id} AND status='WAITING' ORDER BY ordinal LIMIT 1") Task next(long id);
    @Update("UPDATE approval_task SET status='ACTIVE',due_at=#{deadline} WHERE id=#{id}") void activate(long id, LocalDateTime deadline);
    @Update("UPDATE approval_task SET status=#{status} WHERE id=#{id}") void taskStatus(long id, TaskStatus status);
    @Update("UPDATE approval_task SET status='CLOSED' WHERE revision_id=#{id} AND status='WAITING'") void closeWaiting(long id);
    @Update("UPDATE approval_task SET assignee_id=#{assignee} WHERE id=#{id}") void reassign(long id, long assignee);
    @Insert("INSERT INTO approval_event(revision_id,task_id,actor_id,action,comment) VALUES(#{revision},#{task},#{actor},#{action},#{comment})")
    void event(long revision, Long task, long actor, String action, String comment);
    @Select("SELECT e.id,e.task_id,a.username AS actor,ea.avatar_key AS actor_avatar_key,e.action,e.comment,e.occurred_at FROM approval_event e JOIN account a ON a.id=e.actor_id LEFT JOIN employee ea ON ea.id=a.employee_id WHERE e.revision_id=#{id} ORDER BY e.id")
    List<Event> events(long id);
    @Select("SELECT EXISTS(SELECT 1 FROM approval_task t JOIN document_revision r ON r.id=t.revision_id WHERE r.document_id=#{document} AND t.assignee_id=#{account} AND t.status IN ('ACTIVE','APPROVED','RETURNED')) OR EXISTS(SELECT 1 FROM approval_event e JOIN document_revision r ON r.id=e.revision_id WHERE r.document_id=#{document} AND e.actor_id=#{account})")
    boolean involved(long document, long account);

    @Insert("INSERT INTO expense_payment(document_id,paid_on,reference,paid_by) VALUES(#{id},#{payment.paidOn},#{payment.reference},#{actor})")
    void addPayment(long id, PaymentInput payment, long actor);
    @Select("SELECT p.paid_on,p.reference,a.username AS payer,ea.avatar_key AS payer_avatar_key FROM expense_payment p JOIN account a ON a.id=p.paid_by LEFT JOIN employee ea ON ea.id=a.employee_id WHERE p.document_id=#{id}") Payment payment(long id);
    @Insert("INSERT INTO notification(recipient_id,document_id,message) VALUES(#{recipient},#{document},#{message})")
    void notify(long recipient, long document, String message);
    @Select("SELECT id,document_id,message,read_at,created_at FROM notification WHERE recipient_id=#{id} ORDER BY id DESC LIMIT 200") List<Notice> notices(long id);
    @Update("UPDATE notification SET read_at=CURRENT_TIMESTAMP(6) WHERE id=#{id} AND recipient_id=#{recipient} AND read_at IS NULL") void readNotice(long id, long recipient);

    Summary summary(long id);
    List<Summary> mine(long owner);
    List<Summary> inbox(long account, boolean all);
    List<Summary> ledger(Filter filter);
}
