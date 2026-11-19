import { App } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError, api, checkPasswordIdentity, resetPassword, sendResetCode, signIn, verifyResetCode } from '../api';
import type { Model } from '../api';
import { LoginPage } from './LoginPage';

vi.mock('../api', async () => {
    const actual = await vi.importActual<typeof import('../api')>('../api');
    return {
        ...actual,
        api: vi.fn(),
        checkPasswordIdentity: vi.fn(),
        resetPassword: vi.fn(),
        sendResetCode: vi.fn(),
        signIn: vi.fn(),
        verifyResetCode: vi.fn(),
    };
});

const currentUser: Model<'CurrentUser'> = { id: 1, username: '1', roles: ['ADMIN'] };

function renderLogin() {
    const onAuthenticated = vi.fn();
    render(<App><LoginPage onAuthenticated={onAuthenticated} /></App>);
    return onAuthenticated;
}

function loginButton() {
    return screen.getByRole('button', { name: /登\s*录/ });
}

async function submit(username: string, password: string) {
    const session = userEvent.setup();
    await session.type(screen.getByPlaceholderText('请输入 mis'), username);
    await session.type(screen.getByPlaceholderText('请输入密码'), password);
    await session.click(loginButton());
}

beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(checkPasswordIdentity).mockReset();
    vi.mocked(resetPassword).mockReset();
    vi.mocked(sendResetCode).mockReset();
    vi.mocked(signIn).mockReset();
    vi.mocked(verifyResetCode).mockReset();
});

test('shows the company identity and the login fields', () => {
    renderLogin();
    expect(screen.getByRole('img', { name: '见衡科技' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '以技术' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '见未来' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '登录工作台' })).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入 mis')).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入密码')).toBeTruthy();
});

test('signs in once and opens the workspace after the session is confirmed', async () => {
    vi.mocked(signIn).mockResolvedValue(undefined);
    vi.mocked(api).mockResolvedValue(currentUser);
    const onAuthenticated = renderLogin();

    await submit('1', 'secret');

    await waitFor(() => expect(vi.mocked(signIn)).toHaveBeenCalledWith('1', 'secret'));
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/session/me'));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(currentUser));
});

test('keeps the user on the page and explains a rejected sign-in', async () => {
    vi.mocked(signIn).mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const onAuthenticated = renderLogin();

    await submit('1', 'wrong');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('mis 或密码不正确，或账号已停用。');
    expect(onAuthenticated).not.toHaveBeenCalled();
});

test('asks for both fields before contacting the server', async () => {
    const onAuthenticated = renderLogin();
    await userEvent.setup().click(loginButton());

    await waitFor(() => expect(screen.getByText('请输入 mis')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('请输入密码')).toBeTruthy());
    expect(vi.mocked(signIn)).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
});

test('walks through identity, verification code and new password when changing it', async () => {
    vi.mocked(checkPasswordIdentity).mockResolvedValue(undefined);
    vi.mocked(sendResetCode).mockResolvedValue({ retryAfterSeconds: 60 });
    vi.mocked(verifyResetCode).mockResolvedValue(undefined);
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    renderLogin();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '忘记密码？' }));
    expect(await screen.findByRole('heading', { name: '修改密码' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '发送验证码' })).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'mis' }), 'employee-01');
    await user.type(screen.getByRole('textbox', { name: '档案邮箱' }), 'employee@example.com');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(checkPasswordIdentity).toHaveBeenCalledWith('employee-01', 'employee@example.com'));

    await user.click(await screen.findByRole('button', { name: '发送验证码' }));
    await waitFor(() => expect(sendResetCode).toHaveBeenCalledWith('employee-01', 'employee@example.com'));

    const cells = document.querySelectorAll<HTMLInputElement>('.password-code-otp input');
    expect(cells).toHaveLength(6);
    for (const [index, char] of [...'ABC123'].entries()) await user.type(cells[index], char);
    await user.click(screen.getByRole('button', { name: /确\s*认/ }));
    await waitFor(() => expect(verifyResetCode).toHaveBeenCalledWith('employee-01', 'employee@example.com', 'ABC123'));

    await user.type(await screen.findByLabelText('新密码', { exact: true }), 'new-secret');
    await user.type(screen.getByLabelText('确认新密码'), 'new-secret');
    await user.click(screen.getByRole('button', { name: '修改密码' }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('employee-01', 'employee@example.com', 'ABC123', 'new-secret'));
    expect(await screen.findByText('密码已修改，请使用新密码登录。')).toBeTruthy();
});

test('keeps the identity step visible when the account and email do not match', async () => {
    vi.mocked(checkPasswordIdentity).mockRejectedValue(new ApiError(400, '账号或档案邮箱不正确'));
    renderLogin();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '忘记密码？' }));
    await user.type(screen.getByRole('textbox', { name: 'mis' }), 'employee-01');
    await user.type(screen.getByRole('textbox', { name: '档案邮箱' }), 'other@example.com');
    await user.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '账号或档案邮箱不正确');
    expect(screen.queryByRole('button', { name: '发送验证码' })).toBeNull();
    expect(sendResetCode).not.toHaveBeenCalled();
});