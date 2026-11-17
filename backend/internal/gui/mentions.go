package gui

import (
	"context"
	"errors"
	"sort"
	"strings"

	"github.com/kongesque/line-cli/internal/messaging"
	"github.com/kongesque/line-cli/internal/session"
	"github.com/kongesque/line-cli/pkg/line"
)

type Mention = messaging.Mention

func (d *Direct) Members(ctx context.Context, chat string) ([]Contact, error) {
	if !fullID.MatchString(chat) || !strings.Contains("cr", chat[:1]) {
		return nil, errors.New("not a group chat")
	}
	unlock, err := d.acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer unlock()
	manager := d.Manager.WithContext(ctx)
	var response *line.GetChatsResponse
	if err = manager.Do(func(api session.API) (err error) { response, err = api.GetChats([]string{chat}, true, false); return }); err != nil {
		return nil, classify(err)
	}
	ids := []string{}
	if response != nil {
		for _, item := range response.Chats {
			if item.ChatMid != chat || item.Extra.GroupExtra == nil {
				continue
			}
			for id := range item.Extra.GroupExtra.MemberMids {
				if fullID.MatchString(id) && strings.HasPrefix(id, "u") {
					ids = append(ids, id)
				}
			}
		}
	}
	if len(ids) == 0 || len(ids) > 5000 {
		return nil, errors.New("group membership unavailable")
	}
	sort.Strings(ids)
	members := []Contact{}
	for offset := 0; offset < len(ids); offset += 100 {
		batch := ids[offset:min(offset+100, len(ids))]
		var contacts *line.ContactsResponse
		if err = manager.Do(func(api session.API) (err error) { contacts, err = api.GetContactsV2(batch); return }); err != nil {
			return nil, classify(err)
		}
		for _, id := range batch {
			name := id
			if contacts != nil {
				if entry, ok := contacts.Contacts[id]; ok && (entry.Contact.Mid == "" || entry.Contact.Mid == id) {
					if value := label(entry.Contact.EffectiveDisplayName(), 160); value != "" {
						name = value
					}
				}
			}
			members = append(members, Contact{ID: id, Name: name})
		}
	}
	sort.SliceStable(members, func(i, j int) bool { return members[i].Name < members[j].Name })
	return members, nil
}

func (d *Direct) SendMentions(ctx context.Context, chat, text, reply string, mentions []Mention) (SendResult, error) {
	var result *messaging.SendResult
	err := d.withClient(ctx, func(c *messaging.Client) (err error) {
		result, err = c.SendMentions(chat, text, reply, mentions)
		return
	})
	if err != nil || result == nil {
		return SendResult{}, err
	}
	return SendResult{ID: result.ID, ChatID: result.ChatID, Encrypted: result.Encrypted}, nil
}

func (e *Engine) loadMembers(c Command) {
	if !e.current(c) || e.state.Status != "ready" || e.state.MembersStatus == "loading" {
		return
	}
	group := false
	for _, chat := range e.state.Chats {
		if chat.ID == c.ID {
			group = chat.Group
		}
	}
	if !group {
		return
	}
	e.state.MembersStatus = "loading"
	e.state.MembersNote = ""
	epoch, selection := e.epoch, e.state.Selection
	ctx := e.resourceCtx
	mode := e.state.Mode
	e.spawn(func() {
		var members []Contact
		var err error
		if mode == "demo" {
			members = []Contact{{ID: "demo-0", Name: "Alex Morgan"}, {ID: "demo-new", Name: "Robin Green"}}
		} else if e.ops.Members != nil {
			members, err = e.ops.Members(ctx, c.ID)
		} else {
			err = errors.New("members unavailable")
		}
		e.mu.Lock()
		defer e.mu.Unlock()
		if e.disposed || e.epoch != epoch || e.state.Selection != selection || e.state.SelectedID != c.ID {
			return
		}
		if err != nil || len(members) > 5000 {
			e.state.MembersStatus = "error"
			e.state.MembersNote = "無法載入群組成員，按 Ctrl+R 重試"
			if errors.Is(err, ErrUnauthenticated) {
				e.loseAuthentication()
			}
		} else {
			e.state.Members = members
			e.state.MembersStatus = "ready"
		}
		e.publish()
	})
}

func (e *Engine) validateMentions(c Command) error {
	if len(c.Mentions) > 20 || e.state.Attachment != nil || e.state.MembersStatus != "ready" {
		return errors.New("請重新選取群組成員後再傳送")
	}
	if e.state.Mode != "demo" {
		if e.ops.SendMentions == nil {
			return errors.New("此後端不支援標註")
		}
		if _, err := messaging.MentionMetadata(c.Text, c.Mentions); err != nil {
			return err
		}
	}
	for _, mention := range c.Mentions {
		found := false
		for _, member := range e.state.Members {
			if member.ID == mention.ID {
				found = true
				break
			}
		}
		if !found {
			return errors.New("標註的成員不在此群組，請重新選取")
		}
	}
	return nil
}
