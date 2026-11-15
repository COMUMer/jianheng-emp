import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

dayjs.locale('zh-cn');

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');

const brand = '#0f6b4f';
const brandTint = '#e9f2ec';
const brandTintHover = '#dcebe3';

createRoot(root).render(
    <StrictMode>
        <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} theme={{ token: { colorPrimary: brand, colorLink: brand,
            colorPrimaryBg: brandTint, colorPrimaryBgHover: brandTintHover, borderRadius: 7,
            motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            colorText: '#18221d', colorTextSecondary: '#64726a', colorBorder: '#dce5de',
            fontFamily: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif' },
            components: { Table: { cellPaddingBlock: 8, cellPaddingInline: 12 },
                Select: { optionSelectedColor: brand, multipleItemBg: brandTint } } }}>
            <AntApp><App /></AntApp>
        </ConfigProvider>
    </StrictMode>,
);
