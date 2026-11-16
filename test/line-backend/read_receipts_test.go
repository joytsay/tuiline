package gui

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestTUIReadReceipts(t *testing.T) {
	chat, other, self := "u"+strings.Repeat("a", 32), "u"+strings.Repeat("b", 32), "u"+strings.Repeat("c", 32)
	engine := NewEngine(Operations{}, nil)
	defer engine.Close()
	engine.state.Account.ID = self
	engine.state.SelectedID = chat
	engine.state.Messages = []Message{{ID: "9", Own: true}, {ID: "10", Own: true}, {ID: "11", Own: true}, {ID: "8"}}
	sink := &watchSink{callback: func(event WatchEvent) { engine.watchEvent(event) }}
	_, err := sink.Write([]byte(fmt.Sprintf(`{"event":"read","revision":"1","chat_id":%q,"readerId":%q,"messageId":"10"}`, chat, other)))
	if err != nil {
		t.Fatal(err)
	}
	rows := engine.state.Messages
	if !rows[0].Read || !rows[1].Read || rows[2].Read || rows[3].Read {
		t.Fatalf("wrong read markers: %+v", rows)
	}
	engine.receiveRead(WatchEvent{ChatID: chat, ReaderID: self, MessageID: "11"})
	engine.receiveRead(WatchEvent{ChatID: chat, ReaderID: other, MessageID: "9"})
	if rows[2].Read || engine.readUntil[chat] != "10" {
		t.Fatal("self/stale receipt advanced state")
	}
	fresh := []Message{{ID: "10", Own: true}, {ID: "11", Own: true}}
	engine.applyReadReceipts(chat, fresh)
	if !fresh[0].Read || fresh[1].Read {
		t.Fatal("history lost receipt")
	}
	encoded, _ := json.Marshal(fresh[0])
	if !strings.Contains(string(encoded), `"read":true`) {
		t.Fatal("receipt missing from protocol")
	}
	engine.resetIdentity()
	if len(engine.readUntil) != 0 {
		t.Fatal("receipt leaked across sessions")
	}
}

func TestTUIImagePreviewCarriesMessageID(t *testing.T) {
	engine := NewEngine(Operations{}, nil)
	defer engine.Close()
	engine.Handle(Command{Action: "mode", Mode: "demo"})
	view := engine.View()
	engine.state.Messages = []Message{{ID: "123", ContentType: 1, Downloadable: true}}
	engine.Handle(Command{Action: "preview", ID: view.SelectedID, Session: view.Session, Selection: view.Selection, MessageID: "123"})
	engine.Wait()
	view = engine.View()
	if view.Preview == "" || view.PreviewMessageID != "123" {
		t.Fatal("preview lost message association")
	}
	engine.Handle(Command{Action: "preview-close", ID: view.SelectedID, Session: view.Session, Selection: view.Selection})
	if engine.View().Preview != "" || engine.View().PreviewMessageID != "" {
		t.Fatal("preview not cleared")
	}
}
