package gui

import (
	"context"
	"strings"
	"testing"
)

func TestMembersLoadIsScopedToConversation(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	e := NewEngine(Operations{Members: func(_ context.Context, _ string) ([]Contact, error) {
		close(started)
		<-release
		return []Contact{{ID: "u" + strings.Repeat("b", 32), Name: "Alice"}}, nil
	}}, nil)
	defer e.Close()
	e.state.Status = "ready"
	e.state.SelectedID = "c" + strings.Repeat("a", 32)
	e.state.Chats = []Chat{{ID: e.state.SelectedID, Group: true}}
	c := Command{Action: "members", ID: e.state.SelectedID, Session: e.state.Session, Selection: e.state.Selection}
	e.Handle(c)
	<-started
	e.mu.Lock()
	e.state.SelectedID = "other"
	e.state.Selection++
	e.state.MembersStatus = "idle"
	e.mu.Unlock()
	close(release)
	e.Wait()
	if v := e.View(); len(v.Members) != 0 || v.MembersStatus != "idle" {
		t.Fatal("stale members crossed conversations")
	}
}

func TestNativeMentionsRequireLoadedGroupMember(t *testing.T) {
	e := NewEngine(Operations{SendMentions: func(context.Context, string, string, string, []Mention) (SendResult, error) { return SendResult{}, nil }}, nil)
	defer e.Close()
	id := "u" + strings.Repeat("a", 32)
	c := Command{Text: "@Alice hi", Mentions: []Mention{{ID: id, Start: 0, End: 6}}}
	if e.validateMentions(c) == nil {
		t.Fatal("accepted missing membership")
	}
	e.state.MembersStatus = "ready"
	e.state.Members = []Contact{{ID: id, Name: "Alice"}}
	if err := e.validateMentions(c); err != nil {
		t.Fatal(err)
	}
	c.Mentions[0].ID = "u" + strings.Repeat("b", 32)
	if e.validateMentions(c) == nil {
		t.Fatal("accepted nonmember")
	}
}

func TestMentionSendUsesNativeOperationAndKeepsReply(t *testing.T) {
	called := false
	member := "u" + strings.Repeat("b", 32)
	group := "c" + strings.Repeat("a", 32)
	e, _ := readyEngine(Operations{
		Send: func(context.Context, string, string, string, *Attachment) (SendResult, error) {
			t.Error("used plain send for a mention")
			return SendResult{}, nil
		},
		SendMentions: func(_ context.Context, chat, text, reply string, mentions []Mention) (SendResult, error) {
			called = true
			if chat != group || text != "@Alice hi" || reply != "123" || len(mentions) != 1 || mentions[0].ID != member {
				t.Error("lost mention or reply", chat, text, reply, mentions)
			}
			return SendResult{ID: "999", ChatID: chat}, nil
		},
	})
	defer e.Close()
	e.state.SelectedID = group
	e.state.Chats = []Chat{{ID: group, Group: true}}
	e.state.Messages = []Message{{ID: "123", Text: "Original"}}
	e.state.MembersStatus = "ready"
	e.state.Members = []Contact{{ID: member, Name: "Alice"}}
	base := Command{ID: group, Session: e.state.Session, Selection: e.state.Selection}
	c := base
	c.Action, c.MessageID = "reply", "123"
	e.Handle(c)
	c = base
	c.Action, c.Text, c.Sequence = "draft", "@Alice hi", 1
	e.Handle(c)
	c.Action, c.ReplyTo = "send", "123"
	c.Mentions = []Mention{{ID: member, Start: 0, End: 6}}
	e.Handle(c)
	e.Wait()
	if !called || e.View().SendStatus != "idle" || e.View().Draft != "" {
		t.Fatal("mention send did not complete", called, e.View().SendStatus)
	}
}
