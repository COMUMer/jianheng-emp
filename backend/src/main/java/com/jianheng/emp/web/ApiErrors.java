package com.jianheng.emp.web;

import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
class ApiErrors {
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

    @ExceptionHandler(DuplicateKeyException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    Map<String, String> duplicate() {
        return Map.of("message", "记录已存在，请检查编号、名称、身份证号或票号");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    Map<String, String> uploadTooLarge() {
        return Map.of("message", "附件大小超过上传限制");
    }
}
