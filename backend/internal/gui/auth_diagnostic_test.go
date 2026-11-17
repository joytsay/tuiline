package gui

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/kongesque/line-cli/internal/session"
)

func TestRecoverableRefreshErrorDoesNotDiscardAccount(t *testing.T) {
	cause := errors.New("access token refresh required PRIVATE-RESPONSE")
	if errors.Is(classify(cause), ErrUnauthenticated) {
		t.Fatal("recoverable refresh treated as terminal logout")
	}
	e, _ := readyEngine(Operations{Snapshot: func(context.Context) (Snapshot, error) { return Snapshot{}, snapshotError("profile", cause) }})
	defer e.Close()
	e.Handle(Command{Action: "refresh"})
	e.Wait()
	v := e.View()
	if v.Status != "error" || v.Account.Name != "Me" {
		t.Fatal("discarded account after recoverable error", v.Status, v.Account.Name)
	}
	if !strings.Contains(v.AuthDiagnostic, "profile: token-refresh-required") || strings.Contains(v.AuthDiagnostic, "PRIVATE") {
		t.Fatal("bad diagnostic", v.AuthDiagnostic)
	}
}

func TestInvalidatedSessionStillLogsOutWithSafeDiagnostic(t *testing.T) {
	e, _ := readyEngine(Operations{Snapshot: func(context.Context) (Snapshot, error) {
		return Snapshot{}, snapshotError("message-boxes", session.ErrSessionInvalidated)
	}})
	defer e.Close()
	e.Handle(Command{Action: "refresh"})
	e.Wait()
	v := e.View()
	if v.Status != "unauthenticated" || !strings.Contains(v.AuthDiagnostic, "message-boxes: session-invalidated") {
		t.Fatal(v.Status, v.AuthDiagnostic)
	}
}

func TestSnapshotLogPreservesInvalidationSource(t *testing.T) {
	err := snapshotError("profile", &session.InvalidationError{Source: "token-refresh", Reason: "server-logged-out"})
	if !strings.Contains(err.Error(), "profile: session-invalidated/token-refresh/server-logged-out") || !errors.Is(err, ErrUnauthenticated) {
		t.Fatal(err)
	}
}
