package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type IDEConfig struct {
	GlobalSkillsRoot string `json:"globalSkillsRoot"`
}

type Config struct {
	IDEs map[string]IDEConfig `json:"ides"`
}

func defaultConfig() Config {
	return Config{
		IDEs: map[string]IDEConfig{},
	}
}

func configPath(projectPath string) string {
	return filepath.Join(projectPath, ".skills-manager", "config.json")
}

func Load(projectPath string) (Config, error) {
	path := configPath(projectPath)

	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultConfig(), nil
		}
		return Config{}, err
	}

	var cfg Config
	if err := json.Unmarshal(b, &cfg); err != nil {
		return Config{}, err
	}

	if cfg.IDEs == nil {
		cfg.IDEs = map[string]IDEConfig{}
	}
	return cfg, nil
}

func Save(projectPath string, cfg Config) error {
	dir := filepath.Join(projectPath, ".skills-manager")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath(projectPath), b, 0o644)
}

