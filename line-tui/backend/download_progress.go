package line

import (
	"context"
	"io"
)

type downloadProgressKey struct{}

func WithDownloadProgress(ctx context.Context, report func(int64, int64)) context.Context {
	return context.WithValue(ctx, downloadProgressKey{}, report)
}

func TrackDownload(ctx context.Context, reader io.Reader, total int64) io.Reader {
	report, _ := ctx.Value(downloadProgressKey{}).(func(int64, int64))
	if report == nil {
		return reader
	}
	return &downloadProgressReader{reader: reader, total: total, report: report}
}

type downloadProgressReader struct {
	reader          io.Reader
	total, received int64
	report          func(int64, int64)
}

func (r *downloadProgressReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	r.received += int64(n)
	if n > 0 {
		r.report(r.received, r.total)
	}
	return n, err
}
