package gui

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestTUIAcceptsMoreThan500Chats(t *testing.T) {
	chats := make([]Chat, 700)
	for i := range chats {
		chats[i] = Chat{ID: fmt.Sprintf("u%032x", i+1), Name: fmt.Sprintf("Chat %d", i)}
	}
	chats[699].Name = "女主微"
	engine := NewEngine(Operations{Snapshot: func(context.Context) (Snapshot, error) {
		return Snapshot{Account: Account{ID: "u" + strings.Repeat("a", 32)}, Chats: chats}, nil
	}}, nil)
	defer engine.Close()
	engine.Handle(Command{Action: "refresh"})
	engine.Wait()
	view := engine.View()
	if view.Status != "ready" || len(view.Chats) != 700 || view.Chats[699].Name != "女主微" {
		t.Fatalf("expected 700 chats including last conversation, status=%s count=%d", view.Status, len(view.Chats))
	}
}
