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
    change(
      'type Engine struct {',
      `type Engine struct {
 stickerPreview *Sticker
 stickerLoading map[string]uint64`,
    );
    change(
      'case "sticker-open", "sticker-page",',
      'case "sticker-preview":\n e.previewSticker(c)\n case "sticker-open", "sticker-page",',
    );
    change('c.Text == "ja" || c.Text == "en"', 'c.Text == "ja" || c.Text == "en" || c.Text == "zh-TW"');
    change('c.Locale == "ja" || c.Locale == "en"', 'c.Locale == "ja" || c.Locale == "en" || c.Locale == "zh-TW"');
    change(
      'type View struct {',
      `type View struct {
 DownloadReceived int64 \`json:"downloadReceived"\`
 DownloadTotal int64 \`json:"downloadTotal"\`
 DownloadMessageID string \`json:"downloadMessageId"\``,
    );
    change('type View struct {', 'type View struct {\n PreviewMessageID string `json:"previewMessageId"`');
    change('v.Preview = ""', 'v.Preview = ""\n v.PreviewMessageID = ""');
    change('type Message struct {', 'type Message struct {\n Read bool `json:"read"`');
    change('type Engine struct {', 'type Engine struct {\n readUntil map[string]string');
    change('Kind, Revision, ChatID string', 'Kind, Revision, ChatID string\n ReaderID, MessageID string');
    change('func (e *Engine) resetIdentity() {', 'func (e *Engine) resetIdentity() {\n e.readUntil = nil');
    change('merged := map[string]Message{}', 'e.applyReadReceipts(id, rows)\n merged := map[string]Message{}');
  }
  if (file === 'internal/gui/images.go') {
    change(
      'stickers := []Sticker{}',
      `stickers := []Sticker{}
 e.clearStaleStickerLoads()
 if s := e.activeStickerPreview(); s != nil { stickers = append(stickers, *s) }`,
    );
    change(
      'e.stickerAttempted[key] = true',
      `e.stickerAttempted[key] = true
 if e.stickerLoading == nil { e.stickerLoading = map[string]uint64{} }
 e.stickerLoading[key] = e.stickerGeneration + 1`,
    );
    change('e.stickerActive--', 'e.stickerActive--\n delete(e.stickerLoading, key)');
    change(
      `total := 0
				for _, old := range e.stickerData {
					total += len(old)
				}
				if total+len(data) <= 1<<20 {
					e.stickerData[key] = data
					e.addSticker(key, data)
				}`,
      'e.cacheSticker(key, data)',
    );
    change(
      `func (e *Engine) addSticker(key, data string) {
	if e.state.StickerImages[key] == data {
		return
	}
	bytes := 2
	for k, v := range e.state.StickerImages {
		if k != key {
			bytes += imageCost(k, v)
		}
	}
	if bytes+imageCost(key, data) > 1<<20 {
		return
	}
	e.state.StickerImages[key] = data
}`,
      'func (e *Engine) addSticker(key, data string) { e.cacheSticker(key, data) }',
    );
  }
  if (file === 'internal/gui/locale.go') {
    change(
      'func appText(locale, value string) string {',
      'func appText(locale, value string) string {\n if locale == "zh-TW" { return chineseText(appText("en", value)) }',
    );
    change(
      'func (e *Engine) localizedView() View {',
      'func (e *Engine) localizedView() View {\n if e.locale == "zh-TW" { return e.chineseView() }',
    );
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
    change(
      'data, err = e.ops.Download(ctx, c.ID, c.MessageID)',
      'data, err = e.ops.Download(e.downloadContext(ctx, c, epoch, generation), c.ID, c.MessageID)',
    );
    change(
      'e.state.FileStatus = "pending"',
      `e.state.FileStatus = "pending"
 e.state.DownloadReceived = 0
 e.state.DownloadTotal = 0
 e.state.DownloadMessageID = c.MessageID`,
    );
    change('e.state.Preview = preview', 'e.state.Preview = preview\n e.state.PreviewMessageID = c.MessageID');
    change('e.state.Preview = ""', 'e.state.Preview = ""\n e.state.PreviewMessageID = ""');
  }
  if (file === 'pkg/line/client.go') {
    change(
      'body, readErr := io.ReadAll(reader)',
      'body, readErr := io.ReadAll(TrackDownload(ctx, reader, resp.ContentLength))',
    );
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
