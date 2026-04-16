package main

import (
	"flag"
	"fmt"
	"runtime/debug"

	tea "github.com/charmbracelet/bubbletea"

	"skills-manager/internal/tui"
)

var version = "dev"

func resolvedVersion() string {
	if version != "" && version != "dev" {
		return version
	}

	if info, ok := debug.ReadBuildInfo(); ok {
		if info.Main.Version != "" && info.Main.Version != "(devel)" {
			return info.Main.Version
		}
		for _, setting := range info.Settings {
			if setting.Key == "vcs.revision" && setting.Value != "" {
				return setting.Value
			}
		}
	}

	return version
}

func main() {
	showVersion := flag.Bool("version", false, "mostra versão e sai")
	flag.Parse()

	if *showVersion {
		fmt.Printf("skills-manager %s\n", resolvedVersion())
		return
	}

	p := tea.NewProgram(tui.New(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("error: %v\n", err)
	}
}

