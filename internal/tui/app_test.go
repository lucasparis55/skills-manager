package tui

import (
	"os"
	"path/filepath"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestValidateSkillsRoot(t *testing.T) {
	tmp := t.TempDir()

	if err := validateSkillsRoot(""); err == nil {
		t.Fatalf("expected empty path to fail validation")
	}

	missing := filepath.Join(tmp, "missing")
	if err := validateSkillsRoot(missing); err == nil {
		t.Fatalf("expected missing path to fail validation")
	}

	filePath := filepath.Join(tmp, "file.txt")
	if err := os.WriteFile(filePath, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := validateSkillsRoot(filePath); err == nil {
		t.Fatalf("expected file path to fail validation")
	}

	dirPath := filepath.Join(tmp, "skills-root")
	if err := os.MkdirAll(dirPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := validateSkillsRoot(dirPath); err != nil {
		t.Fatalf("expected directory path to pass validation, got %v", err)
	}
}

func TestWindowResizeUpdatesListSize(t *testing.T) {
	base, ok := New().(model)
	if !ok {
		t.Fatalf("expected New() to return tui.model")
	}

	updated, cmd := base.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	if cmd != nil {
		t.Fatalf("expected no command on resize, got %v", cmd)
	}

	next, ok := updated.(model)
	if !ok {
		t.Fatalf("expected updated model type")
	}

	if next.windowWidth != 120 || next.windowHeight != 40 {
		t.Fatalf("expected stored window size 120x40, got %dx%d", next.windowWidth, next.windowHeight)
	}

	if next.choices.Width() != 116 {
		t.Fatalf("expected list width 116, got %d", next.choices.Width())
	}
	if next.choices.Height() != 32 {
		t.Fatalf("expected list height 32, got %d", next.choices.Height())
	}
}

