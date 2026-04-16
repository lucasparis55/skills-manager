package runlog

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func Append(projectPath string, event string) {
	if projectPath == "" {
		return
	}

	dir := filepath.Join(projectPath, ".skills-manager")
	_ = os.MkdirAll(dir, 0o755)

	line := fmt.Sprintf("%s %s\n", time.Now().Format(time.RFC3339), event)
	path := filepath.Join(dir, "last-run.log")

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()

	_, _ = f.WriteString(line)
}

