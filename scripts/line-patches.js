'use strict';

// Local additions to the reference backend, applied with go build -overlay.
function patchFile(file, source) {
  const change = (before, after) => {
    if (!source.includes(before)) throw new Error(`LINE backend changed: missing patch location in ${file}`);
    source = source.replace(before, after);
  };
  if (file === 'internal/events/watch.go') {
    change(
      'type Event struct {',
      `type Event struct {
 ReaderID string \`json:"readerId,omitempty"\`
 MessageID string \`json:"messageId,omitempty"\``,
    );
    change(
      'if (op.Type == 25 || op.Type == 26)',
      `if op.Type == 55 {
      event.Event, event.ChatID, event.ReaderID, event.MessageID = "read", op.Param1, op.Param2, op.Param3
    }
    if (op.Type == 25 || op.Type == 26)`,
    );
  }
  if (file === 'internal/gui/engine.go') {
    change('type View struct {', 'type View struct {\n PreviewMessageID string `json:"previewMessageId"`');
    change('v.Preview = ""', 'v.Preview = ""\n v.PreviewMessageID = ""');
    change('type Message struct {', 'type Message struct {\n Read bool `json:"read"`');
    change('type Engine struct {', 'type Engine struct {\n readUntil map[string]string');
    change('Kind, Revision, ChatID string', 'Kind, Revision, ChatID string\n ReaderID, MessageID string');
    change('func (e *Engine) resetIdentity() {', 'func (e *Engine) resetIdentity() {\n e.readUntil = nil');
    change('merged := map[string]Message{}', 'e.applyReadReceipts(id, rows)\n merged := map[string]Message{}');
  }
  if (file === 'internal/gui/direct.go') {
    change('ChatID: event.ChatID}', 'ChatID: event.ChatID, ReaderID: event.ReaderID, MessageID: event.MessageID}');
  }
  if (file === 'internal/gui/receive.go') {
    change(
      'if event.Kind == "resync_required"',
      'if event.Kind == "read" { e.receiveRead(event); return }\n if event.Kind == "resync_required"',
    );
    change(
      'm := *event.Message',
      'm := *event.Message\n rows := []Message{m}\n e.applyReadReceipts(event.ChatID, rows)\n m = rows[0]',
    );
  }
  if (file === 'internal/gui/features.go') {
    change('e.state.Preview = preview', 'e.state.Preview = preview\n e.state.PreviewMessageID = c.MessageID');
    change('e.state.Preview = ""', 'e.state.Preview = ""\n e.state.PreviewMessageID = ""');
  }
  if (file === 'internal/gui/receipts.go') {
    change(
      'func (e *Engine) sentMessage(chat string, item Message) {',
      `func (e *Engine) sentMessage(chat string, item Message) {
      rows := []Message{item}
      e.applyReadReceipts(chat, rows)
      item = rows[0]`,
    );
  }
  return source;
}

module.exports = { patchFile };
