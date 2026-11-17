package messaging

import (
	"encoding/json"
	"testing"

	"github.com/kongesque/line-cli/pkg/line"
)

func TestMentionMetadataUsesUTF16AndRejectsInvalidRanges(t *testing.T) {
	text := "你好😀 @小明 hi"
	mentions := []Mention{{ID: "u-peer", Start: 5, End: 8}}
	encoded, err := MentionMetadata(text, mentions)
	if err != nil {
		t.Fatal(err)
	}
	var wire struct {
		Entries []map[string]string `json:"MENTIONEES"`
	}
	if err := json.Unmarshal([]byte(encoded), &wire); err != nil {
		t.Fatal(err)
	}
	if len(wire.Entries) != 1 || wire.Entries[0]["S"] != "5" || wire.Entries[0]["E"] != "8" || wire.Entries[0]["M"] != "u-peer" {
		t.Fatal(encoded)
	}
	for _, invalid := range [][]Mention{
		{{ID: "u-peer", Start: -1, End: 8}}, {{ID: "c-group", Start: 5, End: 8}},
		{{ID: "u-peer", Start: 5, End: 99}}, {{ID: "u-peer", Start: 0, End: 8}},
		{{ID: "u-peer", Start: 5, End: 8}, {ID: "u-other", Start: 5, End: 8}},
	} {
		if _, err := MentionMetadata(text, invalid); err == nil {
			t.Fatalf("accepted %+v", invalid)
		}
	}
}

func TestSendMentionsIncludesMetadataForPlainAndEncryptedGroups(t *testing.T) {
	for _, plain := range []bool{true, false} {
		c, api, _, _ := setup(t, plain)
		api.group = &line.E2EEGroupSharedKey{GroupKeyID: 33, Creator: "u-self", CreatorKeyID: 11, ReceiverKeyID: 11, EncryptedSharedKey: "wrapped"}
		result, err := c.SendMentions("c-group", "@Alice hello", "123", []Mention{{ID: "u-peer", Start: 0, End: 6}})
		if err != nil {
			t.Fatal(err)
		}
		if result.Encrypted == plain || api.sent.ContentMetadata["MENTION"] == "" || api.sent.RelatedMessageID != "123" {
			t.Fatalf("metadata missing: %+v", api.sent)
		}
		if !plain && (len(api.sent.Chunks) != 5 || api.sent.Text != "") {
			t.Fatal("mention downgraded encryption")
		}
	}
}
