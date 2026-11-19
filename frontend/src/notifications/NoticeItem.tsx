import type { Model } from '../api';
import { formatDate } from '../format';
import { EmployeeCardAvatar } from '../people/EmployeeCard';
import './notices.css';

/** 消息行：统一展示发起人头像、未读状态、内容和时间。 */
export function NoticeItem({ notice, onOpen }: { notice: Model<'Notice'>; onOpen: (notice: Model<'Notice'>) => void }) {
    return <li>
        <div className="notice-item">
            <span className="notice-avatar">
                <EmployeeCardAvatar name={notice.actor} employeeId={notice.actorEmployeeId}
                    avatarKey={notice.actorAvatarKey} size={30} />
                {!notice.readAt && <span className="notice-dot" aria-label="未读" />}
            </span>
            <button type="button" className="notice-open" onClick={() => onOpen(notice)}>
                <span className="notice-copy">
                    <strong title={notice.message}>{notice.message}</strong>
                    <small>{formatDate(notice.createdAt)}</small>
                </span>
            </button>
        </div>
    </li>;
}