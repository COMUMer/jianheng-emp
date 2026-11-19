package com.jianheng.emp.security;

import java.util.List;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;
import org.jsoup.select.NodeVisitor;

final class MailContent {
    private static final String CID_PREFIX = "cid:";
    private static final Pattern IMAGE_WIDTH = Pattern.compile("[1-9][0-9]{0,4}");
    private static final Cleaner CLEANER = new Cleaner(Safelist.none()
        .addTags("p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "del", "strike", "ul", "ol", "li",
            "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "img")
        .addAttributes("img", "src", "alt", "width")
        .addAttributes("ol", "start")
        .addProtocols("img", "src", "cid"));

    private final Element body;

    MailContent(String html) {
        Document document = CLEANER.clean(Jsoup.parseBodyFragment(html));
        document.outputSettings().prettyPrint(false);
        body = document.body();
        body.select("img").stream().filter(image -> {
            var src = image.attr("src");
            return !src.startsWith(CID_PREFIX) || !(src.equals(CID_PREFIX + MailAssets.HEADER_CID)
                || MailAssets.isUploadId(src.substring(CID_PREFIX.length())));
        }).forEach(Element::remove);
        body.select("img[width]").stream().filter(image -> !IMAGE_WIDTH.matcher(image.attr("width")).matches())
            .forEach(image -> image.removeAttr("width"));
    }

    String html() { return body.html(); }

    List<String> imageIds() {
        return body.select("img").stream().map(image -> image.attr("src").substring(CID_PREFIX.length()))
            .distinct().toList();
    }

    boolean hasText(String value) {
        return body.nodeStream().filter(TextNode.class::isInstance).map(TextNode.class::cast)
            .anyMatch(node -> node.getWholeText().contains(value));
    }

    String text() {
        var text = new StringBuilder();
        body.traverse(new NodeVisitor() {
            @Override public void head(Node node, int depth) {
                if (node instanceof TextNode content) {
                    text.append(content.text());
                } else if (node instanceof Element element) {
                    if (element.is("br")) text.append('\n');
                    if (element.isBlock()) lineBreak(text);
                }
            }

            @Override public void tail(Node node, int depth) {
                if (node instanceof Element element && element.isBlock()) lineBreak(text);
            }
        });
        return text.toString().strip();
    }

    void replaceText(UnaryOperator<String> replace) {
        body.traverse(new NodeVisitor() {
            @Override public void head(Node node, int depth) {
                if (node instanceof TextNode text) text.text(replace.apply(text.getWholeText()));
            }
        });
    }

    String emailHtml() {
        var message = body.clone();
        message.select("p, div, h1, h2, h3, h4, h5, h6, li, blockquote").stream()
            .filter(element -> element.select("img").isEmpty() && element.text().isBlank()
                && element.children().stream().allMatch(child -> child.is("br")))
            .forEach(element -> element.html("&nbsp;"));
        message.traverse((node, depth) -> {
            if (node instanceof TextNode text) text.text(preserveSpaces(text.getWholeText()));
        });
        message.select("img").forEach(image -> {
            var width = image.attr("width");
            var cssWidth = width.isEmpty() ? "100%" : width + "px";
            if (width.isEmpty()) image.attr("width", cssWidth);
            image.attr("style", "display:block;width:" + cssWidth + ";max-width:100%;height:auto;border:0;margin:0 0 16px");
        });
        return "<div style=\"font-family:Arial,sans-serif;line-height:1.65\">" + message.html() + "</div>";
    }

    /** 行首缩进与连续空格在 HTML 中会被折叠，转成不换行空格后邮件客户端才能原样显示。 */
    private static String preserveSpaces(String value) {
        var out = new StringBuilder(value.length());
        var run = 0;
        for (var index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (current == ' ') {
                run++;
                continue;
            }
            if (run > 0) {
                appendSpaces(out, run, index - run == 0);
                run = 0;
            }
            out.append(current);
        }
        if (run > 0) appendSpaces(out, run, value.length() == run);
        return out.toString();
    }

    private static void appendSpaces(StringBuilder out, int count, boolean leading) {
        boolean keepAll = leading || count > 1;
        out.append(String.valueOf(keepAll ? '\u00a0' : ' ').repeat(keepAll ? count : 1));
    }
    private static void lineBreak(StringBuilder text) {
        if (!text.isEmpty() && text.charAt(text.length() - 1) != '\n') text.append('\n');
    }
}
