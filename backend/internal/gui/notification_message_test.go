package gui

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestMessageNotificationGroupAndDirect(t *testing.T) {
	n := pendingNotice{Group: true, ChatName: "朋友群組", Message: Message{Sender: "小明", Text: "晚餐吃什麼？"}}
	title, body := messageNotification("zh-TW", n)
	if title != "朋友群組" || body != "小明: 晚餐吃什麼？" {
		t.Fatalf("got %q / %q", title, body)
	}
	n.Group = false
	title, body = messageNotification("zh-TW", n)
	if title != "小明" || body != "晚餐吃什麼？" {
		t.Fatalf("got %q / %q", title, body)
	}
	n.Message.Text = "新しいメッセージがあります"
	_, body = messageNotification("en", n)
	if body != n.Message.Text {
		t.Fatal("translated real message contents", body)
	}
}

func TestGroupWatchNotificationIncludesGroupSenderAndMessage(t *testing.T) {
	delivered := make(chan [2]string, 1)
	e := NewEngine(Operations{NotifyMessage: func(_ context.Context, title, body string) bool {
		delivered <- [2]string{title, body}
		return true
	}}, nil)
	defer e.Close()
	id := "c" + strings.Repeat("a", 32)
	e.mu.Lock()
	e.locale = "zh-TW"
	e.state.Status = "ready"
	e.state.Notifications = true
	e.state.Chats = []Chat{{ID: id, Group: true, Name: "朋友群組"}}
	e.noticeDelay = time.Millisecond
	e.notice(Message{ID: "123", Sender: "小明", Text: "晚餐吃什麼？", Timestamp: time.Now().UnixMilli()}, id)
	e.mu.Unlock()
	select {
	case result := <-delivered:
		if result != [2]string{"朋友群組", "小明: 晚餐吃什麼？"} {
			t.Fatal(result)
		}
	case <-time.After(time.Second):
		t.Fatal("notification was not delivered")
	}
}
