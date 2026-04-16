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

	// Defaults based on official documentation:
	// - Claude Code CLI: ~/.claude/agents (subagents, not skills)
	// - Codex CLI/Desktop: ~/.agents/skills
	// - OpenCode: ~/.config/opencode/skills (primary), ~/.claude/skills and ~/.agents/skills (fallback)
	// - Cursor: ~/.cursor/skills
	return map[string]IDEAdapter{
		"Claude Code CLI": adapter{
			name: "Claude Code CLI",
			candidates: []string{
				filepath.Join(home, ".claude", "agents"),
			},
		},
		"Codex CLI": adapter{
			name: "Codex CLI",
			candidates: []string{
				filepath.Join(home, ".agents", "skills"),
			},
		},
		"Codex Desktop": adapter{
			name: "Codex Desktop",
			candidates: []string{
				filepath.Join(home, ".agents", "skills"),
			},
		},
		"OpenCode": adapter{
			name: "OpenCode",
			candidates: []string{
				filepath.Join(home, ".config", "opencode", "skills"),
				filepath.Join(home, ".claude", "skills"),
				filepath.Join(home, ".agents", "skills"),
			},
		},
		"Cursor": adapter{
			name: "Cursor",
			candidates: []string{
				filepath.Join(home, ".cursor", "skills"),
				filepath.Join(home, ".agents", "skills"),
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
