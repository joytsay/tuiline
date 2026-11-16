package gui

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/kongesque/line-cli/pkg/line"
)

func TestTUIDownloadProgress(t *testing.T) {
	e := NewEngine(Operations{}, nil)
	defer e.Close()
	e.state.SelectedID = "chat"
	c := Command{ID: "chat", Session: e.state.Session, Selection: e.state.Selection, MessageID: "123"}
	ctx := e.downloadContext(context.Background(), c, e.epoch, e.fileGeneration)
	reader := line.TrackDownload(ctx, strings.NewReader("abcdef"), 6)
	if _, err := reader.Read(make([]byte, 3)); err != nil {
		t.Fatal(err)
	}
	if e.View().DownloadReceived != 3 || e.View().DownloadTotal != 6 || e.View().DownloadMessageID != "123" {
		t.Fatal("missing partial byte progress", e.View())
	}
	io.ReadAll(reader)
	if e.View().DownloadReceived != 6 {
		t.Fatal("missing final byte progress")
	}
	e.fileGeneration++
	io.ReadAll(line.TrackDownload(ctx, strings.NewReader("stale update"), 12))
	if e.View().DownloadReceived != 6 {
		t.Fatal("stale download updated progress")
	}
	unknown := e.downloadContext(context.Background(), c, e.epoch, e.fileGeneration)
	io.ReadAll(line.TrackDownload(unknown, strings.NewReader("abc"), -1))
	if e.View().DownloadReceived != 3 || e.View().DownloadTotal != -1 {
		t.Fatal("unknown total lost byte count")
	}
}
