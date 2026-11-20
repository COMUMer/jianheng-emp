package com.jianheng.emp.security;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

final class ResendMailer implements Mailer {
    private static final Logger log = LoggerFactory.getLogger(ResendMailer.class);
    private static final String ENDPOINT = "https://api.resend.com/emails";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(15);
    private static final String SEND_FAILED = "邮件发送失败，请稍后再试";

    record Attachment(String filename, String content,
                      @JsonProperty("content_type") String contentType,
                      @JsonProperty("content_id") String contentId) {}

    record Message(String from, List<String> to, String subject, String text, String html,
                   List<Attachment> attachments) {}

    private final RestClient client;
    private final MailSettingsService settings;

    ResendMailer(String apiKey, MailSettingsService settings) {
        var factory = new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        factory.setReadTimeout(READ_TIMEOUT);
        this.client = RestClient.builder().requestFactory(factory).baseUrl(ENDPOINT)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey).build();
        this.settings = settings;
    }

    @Override
    public void sendVerificationCode(String to, String code, long minutes) {
        var content = settings.outgoing(code, minutes);
        var attachments = content.images().stream().map(image -> new Attachment(image.filename(),
            Base64.getEncoder().encodeToString(image.content()), image.contentType(), image.id())).toList();
        try {
            client.post().contentType(MediaType.APPLICATION_JSON)
                .body(new Message(content.sender(), List.of(to), content.subject(), content.text(), content.html(), attachments))
                .retrieve().toBodilessEntity();
            log.atInfo()
                .addKeyValue("event.action", "MAIL_VERIFICATION_SENT")
                .addKeyValue("event.outcome", "success")
                .addKeyValue("mail.recipient", MailAddresses.mask(to))
                .log("verification mail accepted");
        } catch (RestClientResponseException error) {
            log.error("Resend 拒绝发送 to={} status={} body={}", MailAddresses.mask(to), error.getStatusCode().value(),
                error.getResponseBodyAsString());
            throw new MailDeliveryException(SEND_FAILED, error);
        } catch (RestClientException error) {
            log.error("Resend 无法连接 to={}", MailAddresses.mask(to), error);
            throw new MailDeliveryException(SEND_FAILED, error);
        }
    }
}
