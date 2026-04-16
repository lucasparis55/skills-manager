package ide

import (
	"errors"
	"os"
	"path/filepath"
)

type adapter struct {
	name       string
	candidates []string
}

func (a adapter) Name() string { return a.name }

func (a adapter) GuessGlobalSkillsRoot() (string, error) {
	for _, c := range a.candidates {
		if c == "" {
			continue
		}
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c, nil
		}
	}

	// Se nenhum candidato existir, devolvemos o primeiro "default" como sugestao.
	for _, c := range a.candidates {
		if c != "" {
			return "", SkillsRootNotFoundError{SuggestedRoot: c}
		}
	}
	return "", ErrSkillsRootNotFound
}

func adapters() map[string]IDEAdapter {
	home, _ := os.UserHomeDir()
	if home == "" {
		home = "."
	}

	// Defaults best-effort. Se nao existir, a UI pedira que o usuario configure.
	return map[string]IDEAdapter{
		"Claude Code CLI": adapter{
			name: "Claude Code CLI",
			candidates: []string{
				filepath.Join(home, ".config", "claude-code", "skills"),
				filepath.Join(home, ".config", "claude", "skills"),
				filepath.Join(home, ".local", "share", "claude-code", "skills"),
				filepath.Join(os.Getenv("APPDATA"), "Claude Code", "skills"),
				filepath.Join(os.Getenv("LOCALAPPDATA"), "Claude Code", "skills"),
			},
		},
		"Codex CLI": adapter{
			name: "Codex CLI",
			candidates: []string{
				filepath.Join(home, ".config", "codex", "skills"),
				filepath.Join(home, ".local", "share", "codex", "skills"),
				filepath.Join(os.Getenv("APPDATA"), "Codex", "skills"),
				filepath.Join(os.Getenv("LOCALAPPDATA"), "Codex", "skills"),
			},
		},
		"Codex Desktop": adapter{
			name: "Codex Desktop",
			candidates: []string{
				filepath.Join(home, ".config", "codex-desktop", "skills"),
				filepath.Join(home, ".config", "codex", "skills"),
				filepath.Join(os.Getenv("APPDATA"), "Codex", "skills"),
				filepath.Join(os.Getenv("LOCALAPPDATA"), "Codex", "skills"),
			},
		},
		"OpenCode": adapter{
			name: "OpenCode",
			candidates: []string{
				filepath.Join(home, ".config", "opencode", "skills"),
				filepath.Join(home, ".local", "share", "opencode", "skills"),
				filepath.Join(os.Getenv("APPDATA"), "OpenCode", "skills"),
				filepath.Join(os.Getenv("LOCALAPPDATA"), "OpenCode", "skills"),
			},
		},
		"Cursor": adapter{
			name: "Cursor",
			candidates: []string{
				filepath.Join(home, ".cursor", "skills"),
				filepath.Join(home, ".agents", "skills"),
				filepath.Join(os.Getenv("APPDATA"), "Cursor", "skills"),
				filepath.Join(os.Getenv("LOCALAPPDATA"), "Cursor", "skills"),
			},
		},
	}
}

func GetAdapter(name string) (IDEAdapter, error) {
	a, ok := adapters()[name]
	if !ok {
		return nil, errors.New("adapter not found: " + name)
	}
	return a, nil
}
