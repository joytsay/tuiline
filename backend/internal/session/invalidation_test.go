package session

import (
	"errors"
	"strings"
	"testing"
)

func TestInvalidationDiagnosticsRetainOnlySafeReasonCodes(t *testing.T) {
	for _, tc := range []struct{ raw, reason string }{
		{`API error 400: {"code":10051,"data":{"name":"TalkException","code":83,"reason":"invalid sender key","secret":"PRIVATE"}}`, "invalid-sender-key"},
		{`API error 401: {"code":10004,"message":"REQUEST_NEED_LOGIN","private":"PRIVATE"}`, "request-need-login"},
		{`V3_TOKEN_CLIENT_LOGGED_OUT PRIVATE`, "server-logged-out"},
	} {
		err := invalidationError("request", errors.New(tc.raw))
		var detail *InvalidationError
		if !errors.Is(err, ErrSessionInvalidated) || !errors.As(err, &detail) || detail.Reason != tc.reason || strings.Contains(err.Error(), "PRIVATE") {
			t.Fatal("unsafe or missing reason", err)
		}
	}
}
