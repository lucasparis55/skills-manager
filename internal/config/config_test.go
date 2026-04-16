package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReturnsErrorForInvalidJSON(t *testing.T) {
	project := t.TempDir()
	configDir := filepath.Join(project, ".skills-manager")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(configDir, "config.json")
	if err := os.WriteFile(configPath, []byte("{invalid-json"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := Load(project); err == nil {
		t.Fatalf("expected invalid JSON to return an error")
	}
}

