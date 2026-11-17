package messaging

import (
	"encoding/json"
	"errors"
	"strconv"
	"unicode/utf16"
)

type Mention struct {
	ID    string `json:"id"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}

func MentionMetadata(text string, mentions []Mention) (string, error) {
	if len(mentions) == 0 {
		return "", nil
	}
	if len(mentions) > 20 {
		return "", errors.New("at most 20 mentions are supported")
	}
	units := utf16.Encode([]rune(text))
	entries := []map[string]string{}
	end := 0
	for _, m := range mentions {
		if len(m.ID) < 3 || m.ID[0] != 'u' || ValidateChatID(m.ID) != nil || m.Start < end || m.Start < 0 || m.End <= m.Start+1 || m.End > len(units) || units[m.Start] != '@' {
			return "", errors.New("invalid mention target or text range")
		}
		if m.End < len(units) && units[m.End] >= 0xdc00 && units[m.End] <= 0xdfff {
			return "", errors.New("mention splits a Unicode character")
		}
		entries = append(entries, map[string]string{"S": strconv.Itoa(m.Start), "E": strconv.Itoa(m.End), "M": m.ID})
		end = m.End
	}
	encoded, err := json.Marshal(map[string]any{"MENTIONEES": entries})
	return string(encoded), err
}

func (c *Client) SendMentions(chat, text, reply string, mentions []Mention) (*SendResult, error) {
	return c.send(chat, text, reply, nil, mentions)
}
