package com.jianheng.emp.security;

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
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, Environment environment) throws Exception {
        return http
            .authorizeHttpRequests(requests -> {
                if (environment.matchesProfiles("dev")) requests.requestMatchers("/api/openapi").permitAll();
                requests.requestMatchers(EndpointRequest.to(HealthEndpoint.class)).permitAll()
                    .requestMatchers("/api/session/csrf", "/api/session/login", "/api/session/password/**").permitAll()
                    .anyRequest().authenticated();
            })
            .requestCache(AbstractHttpConfigurer::disable)
            .formLogin(login -> login.loginPage("/api/session/login").loginProcessingUrl("/api/session/login")
                .successHandler((request, response, authentication) -> response.setStatus(204))
                .failureHandler((request, response, exception) -> response.setStatus(401)))
            .logout(logout -> logout.logoutUrl("/api/session/logout")
                .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
            .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
            .exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .build();
    }
}
