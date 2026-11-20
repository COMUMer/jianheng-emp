package com.jianheng.emp.web.logging;

import com.jianheng.emp.security.pii.PiiCipher;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** 启动后记录定位问题所需的环境摘要，不输出任何密钥。 */
@Component
class StartupLogger implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(StartupLogger.class);

    private final Environment environment;
    private final String logFile;
    private final String uploadDir;
    private final long retentionDays;
    private final PiiCipher cipher;

    StartupLogger(Environment environment, @Value("${logging.file.name:}") String logFile,
                  @Value("${EMP_UPLOAD_DIR:./data/uploads}") String uploadDir,
                  @Value("${logging.logback.rollingpolicy.max-history:60}") long retentionDays,
                  PiiCipher cipher) {
        this.environment = environment;
        this.logFile = logFile;
        this.uploadDir = uploadDir;
        this.retentionDays = retentionDays;
        this.cipher = cipher;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.atInfo()
            .addKeyValue("event.action", "APPLICATION_STARTED")
            .addKeyValue("app.profiles", String.join(",", environment.getActiveProfiles()))
            .addKeyValue("app.log_file", absolute(logFile))
            .addKeyValue("app.log_retention_days", retentionDays)
            .addKeyValue("app.pii_key_version", "v" + cipher.activeVersion())
            .addKeyValue("app.upload_dir", absolute(uploadDir))
            .addKeyValue("app.java_version", System.getProperty("java.version"))
            .addKeyValue("app.os", System.getProperty("os.name"))
            .addKeyValue("server.port", environment.getProperty("local.server.port", ""))
            .log("application started");
    }

    private static String absolute(String value) {
        if (value == null || value.isBlank()) return "";
        return Path.of(value).toAbsolutePath().normalize().toString();
    }
}