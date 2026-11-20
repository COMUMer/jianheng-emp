package com.jianheng.emp.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpTest {
    private final ClientIp clientIp = new ClientIp("CF-Connecting-IP");

    @Test
    void usesTheTrustedHeader() {
        var request = request("203.0.113.7");

        request.addHeader("CF-Connecting-IP", "198.51.100.23");

        assertThat(clientIp.of(request)).isEqualTo("198.51.100.23");
    }

    @Test
    void acceptsIpv6() {
        var request = request("203.0.113.7");

        request.addHeader("CF-Connecting-IP", "2001:db8::1");

        assertThat(clientIp.of(request)).isEqualTo("2001:db8::1");
    }

    @Test
    void fallsBackToTheConnectionAddressWithoutTheHeader() {
        assertThat(clientIp.of(request("203.0.113.7"))).isEqualTo("203.0.113.7");
    }

    @Test
    void ignoresTheForwardedForHeader() {
        var request = request("203.0.113.7");
        request.addHeader("X-Forwarded-For", "1.2.3.4");

        assertThat(clientIp.of(request)).isEqualTo("203.0.113.7");
    }

    @Test
    void fallsBackWhenTheHeaderIsNotASingleAddress() {
        var request = request("203.0.113.7");
        request.addHeader("CF-Connecting-IP", "198.51.100.23, 10.0.0.1");

        assertThat(clientIp.of(request)).isEqualTo("203.0.113.7");
    }

    @Test
    void fallsBackWhenTheHeaderContainsControlCharacters() {
        var request = request("203.0.113.7");
        request.addHeader("CF-Connecting-IP", "198.51.100.23\nforged");

        assertThat(clientIp.of(request)).isEqualTo("203.0.113.7");
    }

    @Test
    void usesTheConfiguredHeaderName() {
        var request = request("203.0.113.7");
        request.addHeader("X-Client-IP", "198.51.100.23");

        assertThat(new ClientIp("X-Client-IP").of(request)).isEqualTo("198.51.100.23");
    }

    private static MockHttpServletRequest request(String remoteAddress) {
        var request = new MockHttpServletRequest("GET", "/api/documents");
        request.setRemoteAddr(remoteAddress);
        return request;
    }
}
