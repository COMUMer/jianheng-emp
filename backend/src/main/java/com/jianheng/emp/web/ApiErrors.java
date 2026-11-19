package com.jianheng.emp.web;

import com.jianheng.emp.people.EmployeeConflict;
import com.jianheng.emp.security.MailDeliveryException;
import com.jianheng.emp.security.VerificationCodeThrottled;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> status(ResponseStatusException error) {
        String reason = error.getReason() == null ? switch (error.getStatusCode().value()) {
            case 401 -> "请登录后继续";
            case 403 -> "你没有权限执行此操作";
            case 404 -> "记录不存在或不可访问";
            default -> "无法完成此操作";
        } : error.getReason();
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", reason));
    }
    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> invalid(Exception error) {
        String message = error instanceof MethodArgumentNotValidException validation
            ? validation.getBindingResult().getFieldErrors().getFirst().getDefaultMessage() : error.getMessage();
        return Map.of("message", message == null ? "请检查填写内容" : message);
    }

    @ExceptionHandler(VerificationCodeThrottled.class)
    ResponseEntity<Map<String, Object>> throttled(VerificationCodeThrottled error) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", Long.toString(error.retryAfterSeconds()))
            .body(Map.of("message", error.getMessage(), "retryAfterSeconds", error.retryAfterSeconds()));
    }

    @ExceptionHandler(MailDeliveryException.class)
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    Map<String, String> mailFailed(MailDeliveryException error) {
        return Map.of("message", error.getMessage());
    }

    @ExceptionHandler(EmployeeConflict.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    Map<String, Object> employeeConflict(EmployeeConflict error) {
        var body = new LinkedHashMap<String, Object>();
        body.put("message", error.getMessage());
        body.put("employeeId", error.employeeId());
        body.put("name", error.employeeName());
        body.put("departedOn", error.departedOn());
        return body;
    }

    @ExceptionHandler(DuplicateKeyException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    Map<String, String> duplicate() {
        return Map.of("message", "记录已存在，请检查编号、名称或身份证号");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    Map<String, String> uploadTooLarge() {
        return Map.of("message", "附件大小超过上传限制");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> missingParameter(MissingServletRequestParameterException error) {
        log.warn("Missing request parameter: {}", error.getParameterName());
        return Map.of("message", "请求缺少必要信息，请刷新页面后重试");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> invalidParameter(MethodArgumentTypeMismatchException error) {
        log.warn("Invalid request parameter: {}", error.getName());
        return Map.of("message", "请求参数格式不正确，请刷新页面后重试");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> unreadableBody(HttpMessageNotReadableException error) {
        log.warn("Unreadable request body", error);
        return Map.of("message", "请求内容格式不正确，请刷新页面后重试");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    Map<String, String> notFound() {
        return Map.of("message", "请求的地址不存在");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    Map<String, String> methodNotAllowed() {
        return Map.of("message", "请求方式不正确");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception error, HttpServletRequest request) {
        log.error("Unhandled error for {} {}", request.getMethod(), request.getRequestURI(), error);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Map.of("message", "服务器处理失败，请稍后重试；如仍失败请联系管理员"));
    }
}
