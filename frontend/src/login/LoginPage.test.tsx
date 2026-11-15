import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError, api, signIn } from '../api';
import type { Model } from '../api';
import { LoginPage } from './LoginPage';

vi.mock('../api', async () => {
    const actual = await vi.importActual<typeof import('../api')>('../api');
    return { ...actual, api: vi.fn(), signIn: vi.fn() };
});

const currentUser: Model<'CurrentUser'> = { id: 1, username: '1', roles: ['ADMIN'] };

function renderLogin() {
    const onAuthenticated = vi.fn();
    render(<LoginPage onAuthenticated={onAuthenticated} />);
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
    vi.mocked(signIn).mockReset();
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
    vi.mocked(signIn).mockResolvedValue();
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
