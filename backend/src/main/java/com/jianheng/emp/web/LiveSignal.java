package com.jianheng.emp.web;

/** 告诉在线的另一端「你的待办或站内消息变了」；不携带业务内容，内容由前端按权限重新拉取。 */
public record LiveSignal(long accountId) {}
