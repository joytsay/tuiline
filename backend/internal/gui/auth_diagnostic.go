package gui

import (
	"errors"
	"fmt"

	"github.com/kongesque/line-cli/internal/session"
	"github.com/kongesque/line-cli/pkg/line"
)

type snapshotFailure struct {
	operation string
	reason    string
	cause     error
}

func (e *snapshotFailure) Error() string {
	return fmt.Sprintf("載入失敗 [%s: %s]，請按 Ctrl+R 重試。", e.operation, e.reason)
}
func (e *snapshotFailure) Unwrap() error { return e.cause }

func snapshotError(operation string, err error) error {
	reason := "request-failed"
	var invalidation *session.InvalidationError
	protocol := session.ProtocolError(err)
	switch {
	case errors.As(err, &invalidation):
		reason = "session-invalidated/" + invalidation.Source + "/" + invalidation.Reason
	case errors.Is(err, session.ErrNotFound):
		reason = "saved-session-missing"
	case errors.Is(err, session.ErrSessionInvalidated), line.IsLoggedOut(protocol):
		reason = "session-invalidated"
	case errors.Is(err, session.ErrSessionChanged):
		reason = "session-changed"
	case errors.Is(err, session.ErrStorageUnavailable):
		reason = "keyring-unavailable"
	case line.IsRefreshRequired(protocol):
		reason = "token-refresh-required"
	case line.IsAuthError(protocol):
		reason = "authentication-rejected"
	}
	return &snapshotFailure{operation: operation, reason: reason, cause: classify(err)}
}
