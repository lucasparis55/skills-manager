package linker

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type StatusKind string

const (
	StatusMissing StatusKind = "missing"
	StatusLinked  StatusKind = "linked"
	StatusPresent StatusKind = "present"
)

type Status struct {
	Kind        StatusKind
	Source      string
	Destination string
	Details     string
	IsLink      bool
}

var ErrUnsafeUnlink = errors.New("unsafe unlink target: destination is not a link")

func resolvePath(path string) string {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil || resolved == "" {
		return filepath.Clean(path)
	}
	return resolved
}

func Detect(sourcePath, destinationPath string) Status {
	if destinationPath == "" {
		return Status{
			Kind:         StatusMissing,
			Source:       sourcePath,
			Destination:  destinationPath,
			Details:      "root global não configurado",
		}
	}

	st, err := os.Lstat(destinationPath)
	if err != nil {
		if os.IsNotExist(err) {
			return Status{
				Kind:        StatusMissing,
				Source:      sourcePath,
				Destination: destinationPath,
			}
		}

		// Se não deu para ler o destino, trata como “present” para não sugerir link seguro.
		return Status{
			Kind:        StatusPresent,
			Source:      sourcePath,
			Destination: destinationPath,
			Details:     err.Error(),
		}
	}

	isLink := (st.Mode() & os.ModeSymlink) != 0

	// Só consideramos `linked` quando o destino é realmente um link.
	if !isLink {
		return Status{
			Kind:        StatusPresent,
			Source:      sourcePath,
			Destination: destinationPath,
			IsLink:      false,
		}
	}

	srcReal := resolvePath(sourcePath)
	destReal := resolvePath(destinationPath)
	if srcReal == destReal {
		return Status{
			Kind:        StatusLinked,
			Source:      sourcePath,
			Destination: destinationPath,
			IsLink:      isLink,
		}
	}

	return Status{
		Kind:        StatusPresent,
		Source:      sourcePath,
		Destination: destinationPath,
		IsLink:      isLink,
	}
}

func Link(sourcePath, destinationPath string) error {
	if destinationPath == "" {
		return fmt.Errorf("destinationPath vazio")
	}

	if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
		return err
	}

	if runtime.GOOS == "windows" {
		// 1) tenta symlink (pode falhar por permissão).
		if err := os.Symlink(sourcePath, destinationPath); err == nil {
			return nil
		}

		// 2) fallback para junction (geralmente funciona sem privilégios de developer mode).
		cmd := exec.Command("cmd.exe", "/c", "mklink", "/J", destinationPath, sourcePath)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("mklink /J falhou: %w (%s)", err, string(out))
		}
		return nil
	}

	return os.Symlink(sourcePath, destinationPath)
}

func Unlink(destinationPath string) error {
	if destinationPath == "" {
		return fmt.Errorf("destinationPath vazio")
	}

	st, err := os.Lstat(destinationPath)
	if err != nil {
		return err
	}
	if (st.Mode() & os.ModeSymlink) == 0 {
		return fmt.Errorf("%w: %s", ErrUnsafeUnlink, destinationPath)
	}

	return os.Remove(destinationPath)
}

