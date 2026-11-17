package session

import (
	"fmt"

	"github.com/kongesque/line-cli/pkg/line"
)

// InvalidationError retains only fixed diagnostic codes, never the remote body.
type InvalidationError struct {
	Source string
	Reason string
}

func (e *InvalidationError) Error() string {
	return fmt.Sprintf("LINE session invalidated [%s: %s]; run line login", e.Source, e.Reason)
}
func (e *InvalidationError) Unwrap() error { return ErrSessionInvalidated }

func invalidationError(source string, cause error) error {
	reason := "server-logged-out"
	if line.IsInvalidSenderKey(cause) {
		reason = "invalid-sender-key"
	} else if line.IsRequestNeedLogin(cause) {
		reason = "request-need-login"
	}
	return &InvalidationError{Source: source, Reason: reason}
}
