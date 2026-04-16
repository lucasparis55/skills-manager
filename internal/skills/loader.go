package skills

import (
	"os"
	"path/filepath"
	"sort"
)

// Skill representa uma skill carregada do projeto.
// Convenção (fase 1): cada skill é uma pasta em `skills/<skillName>/`.
type Skill struct {
	Name       string
	SourcePath string
}

func LoadSkills(projectPath string) ([]Skill, error) {
	root := filepath.Join(projectPath, "skills")

	entries, err := os.ReadDir(root)
	if err != nil {
		// Se a pasta não existir, trata como “nenhuma skill” (em vez de falhar a UI).
		if os.IsNotExist(err) {
			return []Skill{}, nil
		}
		return nil, err
	}

	var out []Skill
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if name == "" || name[0] == '.' {
			continue
		}
		out = append(out, Skill{
			Name:       name,
			SourcePath: filepath.Join(root, name),
		})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

