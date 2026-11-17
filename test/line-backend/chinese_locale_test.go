package gui

import "testing"

func TestTUIChineseLocalePreservesUserContent(t *testing.T) {
	e := NewEngine(Operations{}, nil)
	defer e.Close()
	e.state.StatusText = "接続中"
	e.state.Chats = []Chat{
		{ID: "one", Name: "日本語の名前", Preview: "トークを開く", PreviewKey: "トークを開く"},
		{ID: "two", Name: "Two", Preview: "トークを開く"},
	}
	e.state.Messages = []Message{
		{ID: "1", Text: "トークを開く", Sender: "自分"},
		{ID: "2", Text: "［画像］", GeneratedText: true, ContentType: 1},
	}
	e.state.Draft = "接続中"
	e.Handle(Command{Action: "locale", Text: "zh-TW"})
	v := e.View()
	if v.StatusText != "已連線" || v.Chats[0].Preview != "開啟聊天室" || v.Messages[1].Text != "[圖片]" {
		t.Fatal("Chinese UI projection missing", v)
	}
	if v.Chats[0].Name != "日本語の名前" || v.Chats[1].Preview != "トークを開く" || v.Messages[0].Text != "トークを開く" || v.Messages[0].Sender != "自分" || v.Draft != "接続中" {
		t.Fatal("translation changed real content", v)
	}
	if e.state.StatusText != "接続中" || e.state.Messages[1].Text != "［画像］" {
		t.Fatal("projection mutated source state")
	}
}

func TestTUIChineseNotificationText(t *testing.T) {
	if got := appText("zh-TW", "新しいメッセージがあります"); got != "收到新訊息" {
		t.Fatalf("notification text = %q, want Traditional Chinese", got)
	}
	if got := appText("en", "新しいメッセージがあります"); got != "You have a new message" {
		t.Fatalf("English notification changed: %q", got)
	}
	if got := appText("ja", "新しいメッセージがあります"); got != "新しいメッセージがあります" {
		t.Fatalf("Japanese notification changed: %q", got)
	}
}

func TestChineseLoginPromptIncludesKeyboardShortcut(t *testing.T) {
	if got := chineseText("Please log in to LINE"); got != "請按 Ctrl+L 登入 LINE" {
		t.Fatal(got)
	}
}
