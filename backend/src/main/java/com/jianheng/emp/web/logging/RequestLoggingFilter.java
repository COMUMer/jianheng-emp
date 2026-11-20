package com.jianheng.emp.web.logging;

import com.jianheng.emp.web.ClientIp;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

/**
 * 为每个请求建立日志上下文，并在请求结束后写一条统一的访问日志。
 *
 * <p>所有后端日志最终都落到同一个文件；请求、安全、业务和异常通过字段区分。
 */
public class RequestLoggingFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger("com.jianheng.emp.http");
    private static final Pattern REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{8,64}");
    private static final Set<String> SENSITIVE_QUERY_KEYS = Set.of(
        "token", "code", "password", "newpassword", "confirmpassword", "idcard", "bankcard", "session", "csrf");
    private final long slowRequestMs;
    private final ClientIp clientIp;

    public RequestLoggingFilter(long slowRequestMs, ClientIp clientIp) {
        this.slowRequestMs = slowRequestMs;
        this.clientIp = clientIp;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        String requestId = requestId(request);
        MDC.put("requestId", requestId);
        MDC.put("httpMethod", request.getMethod());
        MDC.put("httpPath", path);
        response.setHeader("X-Request-Id", requestId);
        long started = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = (System.nanoTime() - started) / 1_000_000;
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            boolean authenticated = authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
            if (authenticated) {
                MDC.put("userName", authentication.getName());
                MDC.put("userRoles", roles(authentication));
            }
            if (!"/api/health".equals(path)) {
                writeAccessLog(request, response, path, requestId, durationMs, authenticated, authentication);
            }
            MDC.clear();
        }
    }

    private void writeAccessLog(HttpServletRequest request, HttpServletResponse response, String path,
                                String requestId, long durationMs, boolean authenticated,
                                Authentication authentication) {
        int status = response.getStatus();
        String outcome = status >= 400 ? "failure" : "success";
        var event = log.atInfo()
            .addKeyValue("event.action", "HTTP_REQUEST")
            .addKeyValue("event.outcome", outcome)
            .addKeyValue("http.request.id", requestId)
            .addKeyValue("trace.id", requestId)
            .addKeyValue("http.request.method", request.getMethod())
            .addKeyValue("url.path", path)
            .addKeyValue("http.response.status_code", status)
            .addKeyValue("event.duration_ms", durationMs)
            .addKeyValue("http.request.content_type", safe(request.getContentType(), 120))
            .addKeyValue("http.request.content_length", Math.max(request.getContentLengthLong(), 0))
            .addKeyValue("client.ip", clientIp.of(request))
            .addKeyValue("user_agent.original", safe(request.getHeader("User-Agent"), 256));
        if (authenticated) {
            event.addKeyValue("user.name", authentication.getName())
                .addKeyValue("user.roles", roles(authentication));
        }
        String query = sanitizedQuery(request.getQueryString());
        if (!query.isBlank()) event.addKeyValue("url.query", query);
        Object route = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (route != null) event.addKeyValue("http.route", route.toString());
        if (durationMs >= slowRequestMs) event.addKeyValue("app.slow", true);
        if ("/api/events".equals(path)) event.addKeyValue("app.stream", true);
        event.log("http request completed");
    }

    private static String requestId(HttpServletRequest request) {
        String supplied = request.getHeader("X-Request-Id");
        return supplied != null && REQUEST_ID.matcher(supplied).matches() ? supplied : UUID.randomUUID().toString();
    }

    private static String roles(Authentication authentication) {
        return authentication.getAuthorities().stream()
            .map(authority -> authority.getAuthority())
            .filter(authority -> !authority.startsWith("FACTOR_"))
            .reduce((left, right) -> left + "," + right)
            .orElse("");
    }

    private static String sanitizedQuery(String query) {
        if (query == null || query.isBlank()) return "";
        return Arrays.stream(query.split("&", -1))
            .map(pair -> {
                String[] parts = pair.split("=", 2);
                String key = parts[0].toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
                if (SENSITIVE_QUERY_KEYS.contains(key) || key.contains("token") || key.contains("password")
                    || key.contains("secret") || key.contains("card") || key.contains("session")
                    || key.contains("csrf") || key.endsWith("code")) return parts[0] + "=***";
                return safe(pair, 200);
            })
            .reduce((left, right) -> left + "&" + right)
            .orElse("");
    }

    private static String safe(String value, int maxLength) {
        if (value == null) return "";
        String clean = value.replaceAll("[\\r\\n\\t]", " ").strip();
        return clean.length() <= maxLength ? clean : clean.substring(0, maxLength) + "...";
    }
}