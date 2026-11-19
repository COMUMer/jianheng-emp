package com.jianheng.emp.security;

import com.jianheng.emp.web.logging.RequestLoggingFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.core.env.Environment;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
    private static final Logger securityLog = LoggerFactory.getLogger("com.jianheng.emp.security");

    private final RequestLoggingFilter requestLoggingFilter;

    SecurityConfiguration(RequestLoggingFilter requestLoggingFilter) {
        this.requestLoggingFilter = requestLoggingFilter;
    }

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, Environment environment) throws Exception {
        return http
            .addFilterAfter(requestLoggingFilter, SecurityContextHolderFilter.class)
            .authorizeHttpRequests(requests -> {
                if (environment.matchesProfiles("dev")) requests.requestMatchers("/api/openapi").permitAll();
                requests.requestMatchers(EndpointRequest.to(HealthEndpoint.class)).permitAll()
                    .requestMatchers("/api/session/csrf", "/api/session/login", "/api/session/password/**").permitAll()
                    .anyRequest().authenticated();
            })
            .requestCache(AbstractHttpConfigurer::disable)
            .formLogin(login -> login.loginPage("/api/session/login").loginProcessingUrl("/api/session/login")
                .successHandler((request, response, authentication) -> {
                    securityLog.atInfo()
                        .addKeyValue("event.action", "AUTH_LOGIN_SUCCESS")
                        .addKeyValue("event.outcome", "success")
                        .addKeyValue("user.name", authentication.getName())
                        .addKeyValue("client.ip", request.getRemoteAddr())
                        .log("login succeeded");
                    response.setStatus(204);
                })
                .failureHandler((request, response, exception) -> {
                    securityLog.atWarn()
                        .addKeyValue("event.action", "AUTH_LOGIN_FAILURE")
                        .addKeyValue("event.outcome", "failure")
                        .addKeyValue("user.name", username(request.getParameter("username")))
                        .addKeyValue("client.ip", request.getRemoteAddr())
                        .addKeyValue("error.type", exception.getClass().getSimpleName())
                        .log("login failed");
                    response.setStatus(401);
                }))
            .logout(logout -> logout.logoutUrl("/api/session/logout")
                .logoutSuccessHandler((request, response, authentication) -> {
                    var event = securityLog.atInfo()
                        .addKeyValue("event.action", "AUTH_LOGOUT")
                        .addKeyValue("event.outcome", "success")
                        .addKeyValue("client.ip", request.getRemoteAddr());
                    if (authentication != null) event.addKeyValue("user.name", authentication.getName());
                    event.log("logout completed");
                    response.setStatus(204);
                }))
            .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, exception) -> {
                    securityLog.atWarn()
                        .addKeyValue("event.action", "AUTH_REQUIRED")
                        .addKeyValue("event.outcome", "failure")
                        .addKeyValue("client.ip", request.getRemoteAddr())
                        .addKeyValue("url.path", request.getRequestURI())
                        .log("authentication required");
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                })
                .accessDeniedHandler((request, response, exception) -> {
                    securityLog.atWarn()
                        .addKeyValue("event.action", "ACCESS_DENIED")
                        .addKeyValue("event.outcome", "failure")
                        .addKeyValue("client.ip", request.getRemoteAddr())
                        .addKeyValue("url.path", request.getRequestURI())
                        .addKeyValue("error.type", exception.getClass().getSimpleName())
                        .log("access denied");
                    response.setStatus(HttpStatus.FORBIDDEN.value());
                }))
            .build();
    }

    private static String username(String value) {
        if (value == null || value.isBlank()) return "";
        String clean = value.replaceAll("[\\r\\n\\t]", " ").strip();
        return clean.length() <= 100 ? clean : clean.substring(0, 100);
    }
}
