import { Progress } from 'antd';

/** 上传进度条：所有上传入口共用同一形态，只暴露百分比与说明文字。 */
export function UploadProgress({ percent, label }: { percent: number; label: string }) {
    return <div className="upload-progress" aria-live="polite">
        <Progress percent={Math.round(percent * 100)} size="small" showInfo={false} />
        <span className="upload-progress-label">{label}</span>
    </div>;
}
