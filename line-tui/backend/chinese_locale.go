package gui

import "strings"

// Translate generated UI fields only. User content stays exactly as received.
var chineseLabels = map[string]string{
	"Preparing…": "準備中…", "Please log in to LINE": "請登入 LINE", "Fictional conversation · Demo": "模擬對話 · 示範模式",
	"Connected": "已連線", "Checking LINE…": "正在連線至 LINE…", "Could not load LINE. Please reload": "無法載入 LINE，請重新整理",
	"Could not verify the LINE response": "無法確認 LINE 回應", "Receiving stopped. Reload in Settings": "接收已停止，請重新整理",
	"Up to 500 chats can be loaded. List refresh was deferred to preserve new chats and drafts": "最多可載入 500 個聊天室，為保留下書及新對話，已暫停更新列表",
	"Log in with QR code": "使用 QR Code 登入", "Preparing QR code…": "正在產生 QR Code…",
	"Replace the LINE session saved on this device?": "要取代此裝置儲存的 LINE 登入資訊嗎？",
	"Scan the QR code with LINE on your phone":       "請使用手機 LINE 掃描 QR Code", "Approve the login in LINE on your phone": "請在手機 LINE 確認登入",
	"Verifying approval and saving securely on this device…": "正在確認授權並安全儲存登入資訊…",
	"Login saved. Loading chats":                             "登入資訊已儲存，正在載入聊天室", "Login cancelled": "已取消登入",
	"QR code expired. Please try again": "QR Code 已過期，請重試", "Could not log in. Please try again": "登入失敗，請重試",
	"Could not verify login. Check your phone, then reload to check the saved session": "無法確認登入結果，請查看手機並重新整理",
	"Could not log in. Check the saved session and try again":                          "登入失敗，請確認登入資訊後重試",
	"The original message is outside the current history. Cancel the reply":            "回覆的訊息不在目前記錄中，請取消回覆",
	"Could not verify the send result. Check LINE before resending if needed":          "無法確認傳送結果，請先查看 LINE 再決定是否重傳",
	"Could not load history. Please reload":                                            "無法載入訊息記錄，請重新整理", "Some messages could not be decrypted": "部分訊息無法解密",
	"Loading owned stickers…": "正在載入我的貼圖…", "Could not load owned stickers (up to 500 packs). Please retry": "無法載入我的貼圖（最多 500 組），請重試",
	"Still images, no audio. Select a sticker before sending":                            "以靜態圖片預覽，不含音效。選取後再傳送",
	"Custom stickers with editable names or text are not supported":                      "尚不支援可自訂姓名或文字的貼圖",
	"Could not verify sticker ownership. Reload the sticker list or clear the selection": "無法確認貼圖使用權，請重新載入貼圖列表或取消選取",
	"Sticker expired. Open the sticker list and choose again":                            "貼圖已過期，請重新開啟列表選取",
	"Could not show notifications. Check that notify-send is installed":                  "無法顯示通知，請確認已安裝 notify-send", "You have a new message": "收到新訊息",
	"Could not verify the operation. Check LINE before retrying if needed":          "無法確認操作結果，請先查看 LINE 再決定是否重試",
	"Choose a regular file up to 20 MiB. Links and special files are not supported": "請選擇 20 MiB 以下的一般檔案，不支援連結與特殊檔案",
	"Check the save destination": "請確認儲存位置", "File download cancelled": "已取消下載檔案",
	"Preview unavailable (PNG/JPEG, up to 2 MiB and 4096×4096). Save the file instead":            "無法預覽（限 PNG/JPEG、2 MiB、4096×4096），請改為儲存檔案",
	"Could not verify the save result. Existing files are not overwritten. Check the destination": "無法確認儲存結果，既有檔案不會被覆寫，請確認儲存位置",
	"File saved": "檔案已儲存", "Open chat": "開啟聊天室", "No messages yet": "尚無訊息",
}

func chineseText(value string) string {
	if text, ok := chineseLabels[value]; ok {
		return text
	}
	return value
}

func chineseMessage(m, original Message) Message {
	if original.SenderUnavailable {
		if original.Own {
			m.Sender = "我"
		} else {
			m.Sender = "未命名聯絡人"
		}
	}
	if original.Timestamp == 0 && original.Day == "日時不明" {
		m.Day = "日期不明"
	}
	if !original.GeneratedText {
		return m
	}
	switch {
	case original.Status == "decryption_failed":
		m.Text = "無法解密此訊息"
	case original.ContentType == 1:
		m.Text = "[圖片]"
	case original.ContentType == 2:
		m.Text = "[影片]"
	case original.ContentType == 3:
		m.Text = "[音訊]"
	case original.ContentType == 7:
		m.Text = strings.Replace(m.Text, "[Sticker]", "[貼圖]", 1)
	case original.ContentType == 14:
		m.Text = "[檔案：" + original.FileName + "]"
	default:
		m.Text = "[不支援的訊息]"
	}
	return m
}

func (e *Engine) chineseView() View {
	// localizedView is called with mu held, so this projection cannot change live state.
	locale := e.locale
	e.locale = "en"
	defer func() { e.locale = locale }()
	v := e.localizedView()
	v.StatusText = chineseText(v.StatusText)
	v.ContactNote = chineseText(v.ContactNote)
	v.HistoryNote = chineseText(v.HistoryNote)
	v.SendNote = chineseText(v.SendNote)
	v.NotificationNote = chineseText(v.NotificationNote)
	v.Login.Label = chineseText(v.Login.Label)
	v.Login.StatusText = chineseText(v.Login.StatusText)
	v.Stickers.Note = chineseText(v.Stickers.Note)
	if e.state.Account.NameUnavailable {
		v.Account.Name = "我"
	}
	for i := range v.Chats {
		original := e.state.Chats[i]
		if original.NameUnavailable {
			v.Chats[i].Name = "名稱不明"
		}
		if original.PreviewKey != "" {
			v.Chats[i].Preview = chineseText(v.Chats[i].Preview)
		}
		if original.PreviewMessage != nil {
			m := chineseMessage(e.localizedMessage(*original.PreviewMessage), *original.PreviewMessage)
			v.Chats[i].Preview = label(m.Text, 100)
		}
	}
	for i := range v.Contacts {
		if e.state.Contacts[i].NameUnavailable {
			v.Contacts[i].Name = "未命名聯絡人"
		}
	}
	for i := range v.Messages {
		v.Messages[i] = chineseMessage(v.Messages[i], e.state.Messages[i])
	}
	if v.Reply != nil && v.Reply.Source != nil {
		r := *v.Reply
		m := chineseMessage(e.localizedMessage(*r.Source), *r.Source)
		r.Text, r.Sender = label(m.Text, 160), m.Sender
		v.Reply = &r
	}
	return v
}
