package com.jianheng.emp.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MailContentTest {
    @Test
    void keepsBlankParagraphsVisibleInEmailHtml() {
        var content = new MailContent("<p>第一段</p><p></p><p>   </p><p><br></p><p>第二段</p>");

        var html = content.emailHtml();

        assertThat(html).contains("<p>第一段</p>");
        assertThat(html).doesNotContain("<p></p>");
        assertThat(html).contains("<p>第二段</p>");
    }

    @Test
    void leavesParagraphsWithTextUntouched() {
        var content = new MailContent("<p>你好 <strong>{{code}}</strong></p>");

        assertThat(content.emailHtml()).contains("你好 <strong>{{code}}</strong>");
    }
    @Test
    void preservesLeadingAndRepeatedSpacesInEmailHtml() {
        var content = new MailContent("<p>  缩进两格</p><p>中间  两个空格</p><p>普通 一个空格</p>");

        var html = content.emailHtml();

        assertThat(html).contains("<p>&nbsp;&nbsp;缩进两格</p>");
        assertThat(html).contains("中间&nbsp;&nbsp;两个空格");
        assertThat(html).contains("普通 一个空格");
    }
}
