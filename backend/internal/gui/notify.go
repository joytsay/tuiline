package gui

import (
	"context"
	"html"
	"io"
	"strings"
	"time"

	"github.com/kongesque/line-cli/internal/helper"
)

func staticNotify(ctx context.Context) bool { return localizedNotify(ctx, "ja") }
func localizedNotify(ctx context.Context, locale string) bool {
	return notifyMessage(ctx, "LINE", appText(locale, "新しいメッセージがあります"))
}

func messageNotification(locale string, notice pendingNotice) (string, string) {
	sender := label(notice.Message.Sender, 80)
	if sender == "" || notice.Message.SenderUnavailable {
		sender = "LINE"
		if locale == "zh-TW" {
			sender = "未知的傳送者"
		}
	}
	text := notice.Message.Text
	if notice.Message.GeneratedText {
		text = appText(locale, text)
	}
	body := label(text, 240)
	if strings.TrimSpace(body) == "" {
		body = appText(locale, "新しいメッセージがあります")
		if notice.Message.Sticker != nil && locale == "zh-TW" {
			body = "[貼圖]"
		}
	}
	if notice.Group {
		title := label(notice.ChatName, 100)
		if title == "" {
			title = "LINE"
		}
		return title, sender + ": " + body
	}
	return sender, body
}

func notifyMessage(ctx context.Context, title, body string) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	cmd := helper.Command(ctx, "/usr/bin/notify-send", "--app-name=LINE", "--", title, html.EscapeString(body))
	cmd.Stdin = nil
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	return helper.Run(cmd) == nil
}
