package linker

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestDetectTreatsRealDirectoryAsPresent(t *testing.T) {
	tmp := t.TempDir()
	source := filepath.Join(tmp, "skills", "alpha")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}

	status := Detect(source, source)
	if status.Kind != StatusPresent {
		t.Fatalf("expected %q, got %q", StatusPresent, status.Kind)
	}
	if status.IsLink {
		t.Fatalf("expected real directory not to be treated as link")
	}
}

func TestUnlinkRejectsRealDirectory(t *testing.T) {
	tmp := t.TempDir()
	destination := filepath.Join(tmp, "dest")
	if err := os.MkdirAll(destination, 0o755); err != nil {
		t.Fatal(err)
	}

	err := Unlink(destination)
	if !errors.Is(err, ErrUnsafeUnlink) {
		t.Fatalf("expected ErrUnsafeUnlink, got %v", err)
	}

	if _, statErr := os.Stat(destination); statErr != nil {
		t.Fatalf("expected directory to remain after unsafe unlink rejection: %v", statErr)
	}
}

func TestUnlinkRemovesSymlink(t *testing.T) {
	tmp := t.TempDir()
	source := filepath.Join(tmp, "source")
	destination := filepath.Join(tmp, "destination")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(source, destination); err != nil {
		t.Skipf("symlink not available in this environment: %v", err)
	}

	if err := Unlink(destination); err != nil {
		t.Fatalf("expected symlink unlink to succeed, got %v", err)
	}

	if _, err := os.Lstat(destination); !os.IsNotExist(err) {
		t.Fatalf("expected destination to be removed, got err=%v", err)
	}
}

