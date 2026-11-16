package gui

import (
	"context"
	"time"

	"github.com/kongesque/line-cli/pkg/line"
)

func (e *Engine) downloadContext(ctx context.Context, c Command, epoch, generation uint64) context.Context {
	var last time.Time
	return line.WithDownloadProgress(ctx, func(received, total int64) {
		if !last.IsZero() && time.Since(last) < 100*time.Millisecond && (total <= 0 || received < total) {
			return
		}
		last = time.Now()
		e.mu.Lock()
		defer e.mu.Unlock()
		if e.disposed || e.epoch != epoch || e.fileGeneration != generation || !e.current(c) || ctx.Err() != nil {
			return
		}
		e.state.DownloadReceived = received
		e.state.DownloadTotal = total
		e.state.DownloadMessageID = c.MessageID
		e.publish()
	})
}
