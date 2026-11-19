/** 前端域名下的接口请求转发到后端域名，其余交给静态资源。 */
interface Env {
    ORIGIN: string;
    ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        // 原样透传请求与响应：不读取响应体，否则事件流和文件上传会中断。
        if (url.pathname.startsWith('/api')) {
            return fetch(new Request(new URL(url.pathname + url.search, env.ORIGIN), request));
        }
        return env.ASSETS.fetch(request);
    },
};
