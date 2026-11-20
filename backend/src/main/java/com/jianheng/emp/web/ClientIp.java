package com.jianheng.emp.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 客户端地址的唯一取值入口。
 *
 * <p>源站不开放入站端口，请求只能经隧道由受信代理转发进来，因此优先取代理写入的地址头；
 * 头缺失或格式不合法时回退到连接地址。不读取 {@code X-Forwarded-For}：它是追加语义，
 * 最左值由客户端决定，不能作为审计依据。
 */
@Component
public class ClientIp {
    /** 单个 IPv4 或 IPv6 地址，带端口或逗号列表一律视为不可信。 */
    private static final Pattern ADDRESS = Pattern.compile("[0-9A-Fa-f:.]{3,45}");

    private final String header;

    public ClientIp(@Value("${emp.http.client-ip-header:CF-Connecting-IP}") String header) {
        this.header = header;
    }

    public String of(HttpServletRequest request) {
        String value = request.getHeader(header);
        if (value != null) {
            String candidate = value.strip();
            if (ADDRESS.matcher(candidate).matches()) return candidate;
        }
        return request.getRemoteAddr();
    }
}
