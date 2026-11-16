package events

import "testing"

func TestTUIReadOperationPreservesReceipt(t *testing.T) {
	event, next, err := decodeEvent("operation", `{"type":55,"revision":"123","param1":"u_chat","param2":"u_reader","param3":"9876543210987654321"}`, 122, nil)
	if err != nil || event == nil || next != 123 {
		t.Fatalf("read event: %v %v", event, err)
	}
	if event.Event != "read" || event.ChatID != "u_chat" || event.ReaderID != "u_reader" || event.MessageID != "9876543210987654321" {
		t.Fatalf("receipt fields lost: %+v", event)
	}
}
