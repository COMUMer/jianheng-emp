import './brand.css';

export function BrandMark({ className = '' }: { className?: string }) {
    return <svg className={className} viewBox="0 0 44 44" aria-hidden="true">
        <path d="M6 5v22c0 11 10 11 16 1L36 5M21 5v34M21 22h16v17"
            fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="square" />
    </svg>;
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
    return <span className={`brand-lockup${compact ? ' is-compact' : ''}`} role="img" aria-label="见衡科技">
        <BrandMark className="brand-lockup-mark" />
        <span className="brand-lockup-type">
            <strong>见衡<span>科技</span></strong>
            <small>JIANHENG TECHNOLOGY</small>
        </span>
    </span>;
}