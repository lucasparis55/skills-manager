package ide

import "errors"

var ErrSkillsRootNotFound = errors.New("skills root not found")

type SkillsRootNotFoundError struct {
	SuggestedRoot string
}

func (e SkillsRootNotFoundError) Error() string {
	if e.SuggestedRoot == "" {
		return ErrSkillsRootNotFound.Error()
	}
	return ErrSkillsRootNotFound.Error() + ": " + e.SuggestedRoot
}

func (e SkillsRootNotFoundError) Unwrap() error { return ErrSkillsRootNotFound }

// IDEAdapter é responsável por descobrir onde o IDE procura skills no host.
// Esse “root” é um diretório que contém subpastas por skill (skillName/).
type IDEAdapter interface {
	Name() string
	GuessGlobalSkillsRoot() (string, error)
}

