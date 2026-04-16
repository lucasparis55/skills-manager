package tui

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"skills-manager/internal/config"
	"skills-manager/internal/ide"
	"skills-manager/internal/linker"
	"skills-manager/internal/runlog"
	"skills-manager/internal/skills"
)

type ideItem struct {
	name        string
	description string
}

func (i ideItem) FilterValue() string { return strings.ToLower(i.name) }
func (i ideItem) Title() string       { return i.name }
func (i ideItem) Description() string { return i.description }

type model struct {
	screen       int
	choices      list.Model
	status       string

	selectedIDE string
	skills      []skills.Skill

	projectPath       string
	globalSkillsRoot  string
	configInput       textinput.Model
	windowWidth       int
	windowHeight      int

	pendingAction      string // link | unlink | relink
	pendingSource      string
	pendingDestination string
	pendingSkillName  string
}

const (
	screenIDE = iota
	screenSkills
	screenConfig
	screenConfirm
)

type skillItem struct {
	name             string
	sourcePath      string
	destinationPath string
	status          linker.StatusKind
	isLink          bool
}

func (s skillItem) FilterValue() string { return strings.ToLower(s.name) }
func (s skillItem) Title() string       { return s.name }

func (s skillItem) statusLabel() string {
	switch s.status {
	case linker.StatusMissing:
		return "missing"
	case linker.StatusLinked:
		return "linked"
	case linker.StatusPresent:
		if s.isLink {
			return "present (link) - pode duplicar"
		}
		return "present (dir) - pode duplicar"
	default:
		return string(s.status)
	}
}

func (s skillItem) Description() string {
	if s.destinationPath == "" {
		return s.statusLabel()
	}
	return fmt.Sprintf("%s -> %s", s.statusLabel(), s.destinationPath)
}

func (m model) buildSkillsItems() []list.Item {
	items := make([]list.Item, 0, len(m.skills))
	for _, s := range m.skills {
		dest := ""
		if m.globalSkillsRoot != "" {
			dest = filepath.Join(m.globalSkillsRoot, s.Name)
		}

		st := linker.Detect(s.SourcePath, dest)
		items = append(items, skillItem{
			name:             s.Name,
			sourcePath:      s.SourcePath,
			destinationPath: dest,
			status:          st.Kind,
			isLink:          st.IsLink,
		})
	}
	return items
}

func (m *model) resizeChoices() {
	if m.windowWidth <= 0 || m.windowHeight <= 0 {
		return
	}

	width := m.windowWidth - 4
	height := m.windowHeight - 8
	if width < 20 {
		width = 20
	}
	if height < 8 {
		height = 8
	}
	m.choices.SetSize(width, height)
}

func validateSkillsRoot(root string) error {
	root = strings.TrimSpace(root)
	if root == "" {
		return fmt.Errorf("caminho vazio")
	}

	st, err := os.Stat(root)
	if err != nil {
		return err
	}
	if !st.IsDir() {
		return fmt.Errorf("deve apontar para um diretório existente")
	}
	return nil
}

func newList(items []list.Item, title string) list.Model {
	// Size será ajustado quando chegarmos no WindowSizeMsg.
	const defaultW = 72
	const defaultH = 18

	delegate := list.NewDefaultDelegate()
	l := list.New(items, delegate, defaultW, defaultH)
	l.Title = title

	// Mantém uma UI estável e evita “saltos” quando a lista muda.
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(false)
	return l
}

func New() tea.Model {
	ideItems := []list.Item{
		ideItem{name: "Claude Code CLI", description: "Configurar links para o ambiente do Claude Code."},
		ideItem{name: "Codex CLI", description: "Configurar links para o ambiente do Codex CLI."},
		ideItem{name: "Codex Desktop", description: "Configurar links para o ambiente do Codex Desktop."},
		ideItem{name: "OpenCode", description: "Configurar links para o ambiente do OpenCode."},
		ideItem{name: "Cursor", description: "Configurar links para o ambiente do Cursor."},
	}

	ti := textinput.New()
	ti.Prompt = "Global skills root > "
	ti.Cursor.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("170"))
	ti.CharLimit = 512

	return model{
		screen:  screenIDE,
		choices: newList(ideItems, "Skills Manager - Selecione uma IDE"),
		configInput: ti,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.windowWidth = msg.Width
		m.windowHeight = msg.Height
		m.resizeChoices()
		return m, nil
	}

	// Tela de confirmação (dry-run visual + execução mediante "y").
	if m.screen == screenConfirm {
		if key, ok := msg.(tea.KeyMsg); ok {
			switch key.String() {
			case "ctrl+c", "q":
				return m, tea.Quit
			case "esc", "n":
				m.screen = screenSkills
				m.status = "Ação cancelada."
				m.choices = newList(m.buildSkillsItems(), fmt.Sprintf("Skills - %s (fase 3)", m.selectedIDE))
				m.resizeChoices()
				return m, nil
			case "y", "Y":
				var err error
				switch m.pendingAction {
				case "link":
					err = linker.Link(m.pendingSource, m.pendingDestination)
				case "unlink":
					err = linker.Unlink(m.pendingDestination)
				case "relink":
					if uerr := linker.Unlink(m.pendingDestination); uerr != nil {
						err = uerr
					} else {
						err = linker.Link(m.pendingSource, m.pendingDestination)
					}
				default:
					err = fmt.Errorf("pendingAction desconhecida: %s", m.pendingAction)
				}

				runlog.Append(
					m.projectPath,
					fmt.Sprintf("action=%s ide=%s skill=%s src=%s dest=%s err=%v", m.pendingAction, m.selectedIDE, m.pendingSkillName, m.pendingSource, m.pendingDestination, err),
				)

				if err != nil {
					m.status = fmt.Sprintf("Erro ao executar: %v", err)
					return m, nil
				}

				m.status = "Operação concluída."
				m.screen = screenSkills
				m.choices = newList(m.buildSkillsItems(), fmt.Sprintf("Skills - %s (fase 3)", m.selectedIDE))
				m.resizeChoices()
				return m, nil
			}
		}

		return m, nil
	}

	// Tela de configuração (quando o adapter não consegue achar o root global).
	if m.screen == screenConfig {
		if key, ok := msg.(tea.KeyMsg); ok {
			switch key.String() {
			case "ctrl+c", "q":
				return m, tea.Quit
			case "esc":
				// Cancela e volta para a tela de skills (se já carregamos).
				m.screen = screenSkills
				m.globalSkillsRoot = ""
				m.status = "Configuração cancelada. Root global não configurado."
				m.choices = newList(m.buildSkillsItems(), fmt.Sprintf("Skills - %s (fase 3)", m.selectedIDE))
				m.resizeChoices()
				return m, nil
			case "enter":
				root := strings.TrimSpace(m.configInput.Value())
				if err := validateSkillsRoot(root); err != nil {
					m.status = fmt.Sprintf("Caminho inválido: %v.", err)
					return m, nil
				}

				cfg, err := config.Load(m.projectPath)
				if err != nil {
					// Permite recuperar de JSON corrompido recriando a estrutura mínima.
					cfg = config.Config{IDEs: map[string]config.IDEConfig{}}
				}
				if cfg.IDEs == nil {
					cfg.IDEs = map[string]config.IDEConfig{}
				}
				cfg.IDEs[m.selectedIDE] = config.IDEConfig{GlobalSkillsRoot: root}
				if err := config.Save(m.projectPath, cfg); err != nil {
					m.status = fmt.Sprintf("Erro ao salvar config: %v", err)
					return m, nil
				}

				runlog.Append(m.projectPath, fmt.Sprintf("config ide=%s globalSkillsRoot=%s", m.selectedIDE, root))

				m.globalSkillsRoot = root
				m.status = fmt.Sprintf("Root configurado para %s.", m.selectedIDE)
				m.screen = screenSkills

				m.choices = newList(m.buildSkillsItems(), fmt.Sprintf("Skills - %s (fase 3)", m.selectedIDE))
				m.resizeChoices()
				return m, nil
			}
		}

		var cmd tea.Cmd
		m.configInput, cmd = m.configInput.Update(msg)
		return m, cmd
	}

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			return m, tea.Quit
		case "d":
			if m.screen == screenSkills {
				selected, ok := m.choices.SelectedItem().(skillItem)
				if !ok {
					m.status = "Selecione uma skill."
					return m, nil
				}

				if selected.status != linker.StatusLinked {
					m.status = "Nada para desvincular: essa skill não está 'linked'."
					return m, nil
				}

				m.pendingAction = "unlink"
				m.pendingSkillName = selected.name
				m.pendingSource = selected.sourcePath
				m.pendingDestination = selected.destinationPath
				m.status = fmt.Sprintf("Desvincular %s? (dry-run) Pressione y para confirmar.", selected.name)
				m.screen = screenConfirm
				return m, nil
			}
		case "r":
			if m.screen == screenSkills {
				selected, ok := m.choices.SelectedItem().(skillItem)
				if !ok {
					m.status = "Selecione uma skill."
					return m, nil
				}

				if selected.status != linker.StatusPresent || !selected.isLink {
					m.status = "Re-link só é permitido quando a pasta global existe como link (não como diretório)."
					return m, nil
				}

				m.pendingAction = "relink"
				m.pendingSkillName = selected.name
				m.pendingSource = selected.sourcePath
				m.pendingDestination = selected.destinationPath
				m.status = fmt.Sprintf("Re-link %s? (dry-run) Pressione y para confirmar.", selected.name)
				m.screen = screenConfirm
				return m, nil
			}
		case "backspace", "b":
			if m.screen == screenSkills {
				// Volta para a seleção de IDE.
				ideItems := []list.Item{
					ideItem{name: "Claude Code CLI", description: "Configurar links para o ambiente do Claude Code."},
					ideItem{name: "Codex CLI", description: "Configurar links para o ambiente do Codex CLI."},
					ideItem{name: "Codex Desktop", description: "Configurar links para o ambiente do Codex Desktop."},
					ideItem{name: "OpenCode", description: "Configurar links para o ambiente do OpenCode."},
					ideItem{name: "Cursor", description: "Configurar links para o ambiente do Cursor."},
				}
				m.screen = screenIDE
				m.choices = newList(ideItems, "Skills Manager - Selecione uma IDE")
				m.resizeChoices()
				m.status = "Tela de IDE."
				return m, nil
			}
		}
	}

	var cmd tea.Cmd
	m.choices, cmd = m.choices.Update(msg)

	if key, ok := msg.(tea.KeyMsg); ok && key.String() == "enter" {
		if m.screen == screenIDE {
			if selected, ok := m.choices.SelectedItem().(ideItem); ok {
				m.selectedIDE = selected.name
				m.status = fmt.Sprintf("Carregando skills do projeto para %s...", selected.name)

				projectPath := "."
				abs, err := os.Getwd()
				if err == nil {
					projectPath = abs
				}
				m.projectPath = projectPath

				loaded, err := skills.LoadSkills(projectPath)
				if err != nil {
					m.skills = nil
					m.status = fmt.Sprintf("Erro ao carregar skills: %v", err)
				} else {
					m.skills = loaded

					adapter, err := ide.GetAdapter(selected.name)
					if err != nil {
						m.status = fmt.Sprintf("Adapter não encontrado: %v", err)
						return m, nil
					}

					// 1) tenta config persistente
					var root string
					cfg, cfgErr := config.Load(projectPath)
					if cfgErr != nil {
						m.screen = screenConfig
						m.configInput.SetValue("")
						m.status = fmt.Sprintf("Não foi possível ler .skills-manager/config.json (%v). Corrija/remova o arquivo e informe o root:", cfgErr)
						return m, m.configInput.Focus()
					}
					if cfg.IDEs != nil {
						if perIDE, ok := cfg.IDEs[selected.name]; ok {
							candidate := strings.TrimSpace(perIDE.GlobalSkillsRoot)
							if candidate != "" {
								if err := validateSkillsRoot(candidate); err != nil {
									m.screen = screenConfig
									m.configInput.SetValue(candidate)
									m.status = fmt.Sprintf("Root configurado para %s é inválido (%v). Corrija o caminho:", selected.name, err)
									return m, m.configInput.Focus()
								}
								root = candidate
							}
						}
					}

					// 2) fallback: guess do adapter
					if root == "" {
						guessed, guessErr := adapter.GuessGlobalSkillsRoot()
						if guessErr != nil {
							var nf ide.SkillsRootNotFoundError
							if errors.As(guessErr, &nf) || nf.SuggestedRoot != "" {
								m.screen = screenConfig
								m.configInput.SetValue(nf.SuggestedRoot)
								m.status = fmt.Sprintf("Root global não encontrado para %s. Confirme/edite:", selected.name)
								// Foco no input para o usuário digitar imediatamente.
								return m, m.configInput.Focus()
							}

							m.status = fmt.Sprintf("Erro ao adivinhar root global: %v", guessErr)
							return m, nil
						}
						root = guessed
					}

					m.globalSkillsRoot = root
					runlog.Append(
						m.projectPath,
						fmt.Sprintf("ide=%s globalSkillsRoot=%s skills=%d", selected.name, m.globalSkillsRoot, len(loaded)),
					)

					m.screen = screenSkills
					m.choices = newList(m.buildSkillsItems(), fmt.Sprintf("Skills - %s (fase 3)", selected.name))
					m.resizeChoices()
					if len(loaded) == 0 {
						m.status = fmt.Sprintf("Nenhuma skill encontrada em ./skills/<skillName>/ (projeto: %s).", projectPath)
					} else {
						m.status = fmt.Sprintf("%d skills carregadas. Root global: %s", len(loaded), m.globalSkillsRoot)
					}
				}
			}
		} else if m.screen == screenSkills {
			selected, ok := m.choices.SelectedItem().(skillItem)
			if !ok {
				m.status = "Selecione uma skill."
				return m, nil
			}

			switch selected.status {
			case linker.StatusMissing:
				if selected.destinationPath == "" {
					m.status = "Root global não configurado. Use a IDE para configurar o caminho."
					return m, nil
				}

				m.pendingAction = "link"
				m.pendingSkillName = selected.name
				m.pendingSource = selected.sourcePath
				m.pendingDestination = selected.destinationPath
				m.status = fmt.Sprintf("Linkar %s em %s? (dry-run) Pressione y para confirmar.", selected.name, selected.destinationPath)
				m.screen = screenConfirm
				return m, nil
			case linker.StatusPresent:
				if selected.isLink {
					m.pendingAction = "relink"
					m.pendingSkillName = selected.name
					m.pendingSource = selected.sourcePath
					m.pendingDestination = selected.destinationPath
					m.status = fmt.Sprintf("Re-link %s para apontar ao projeto? (dry-run) Pressione y para confirmar.", selected.name)
					m.screen = screenConfirm
					return m, nil
				}
				m.status = "Skill já existe como diretório; para evitar sobrescrita, não vamos criar link."
			case linker.StatusLinked:
				m.status = "Essa skill já está linked. Use d para desvincular."
			default:
				m.status = "Status desconhecido para esta skill."
			}
		}
	}

	return m, cmd
}

func (m model) View() string {
	titleStyle := lipgloss.NewStyle().Bold(true)
	bodyStyle := lipgloss.NewStyle()

	if m.screen == screenConfirm {
		header := titleStyle.Render("Skills Manager - Confirmação\n\n")
		msg := ""
		switch m.pendingAction {
		case "link":
			msg = fmt.Sprintf("Criar link (symlink/junction)\n\nFonte: %s\nDestino: %s\n\n", m.pendingSource, m.pendingDestination)
		case "unlink":
			msg = fmt.Sprintf("Remover link\n\nDestino: %s\n\n", m.pendingDestination)
		case "relink":
			msg = fmt.Sprintf("Remover e recriar link\n\nFonte: %s\nDestino: %s\n\n", m.pendingSource, m.pendingDestination)
		default:
			msg = "Ação desconhecida.\n\n"
		}

		help := "\nAtalhos: y = confirmar • n/esc = cancelar • q = sair"
		return bodyStyle.Render(header + msg + fmt.Sprintf("%s%s\n", m.status, help))
	}

	if m.screen == screenConfig {
		header := titleStyle.Render("Skills Manager - Configuração\n\n")
		help := "\nAtalhos: Enter = salvar • esc = voltar • q = sair"
		return bodyStyle.Render(
			header +
				fmt.Sprintf("IDE: %s\n\n", m.selectedIDE) +
				m.configInput.View() +
				fmt.Sprintf("\n%s%s\n", m.status, help),
		)
	}

	status := m.status
	if status == "" {
		status = "Use ↑/↓ para navegar e Enter para selecionar. q para sair."
	}

	help := ""
	switch m.screen {
	case screenIDE:
		help = "\nAtalhos: q/esc = sair • Enter = selecionar"
	case screenSkills:
		help = "\nAtalhos: q/esc = sair • Enter = link/relink • d = unlink (quando linked) • b/backspace = voltar"
	default:
		help = "\nAtalhos: q/esc = sair"
	}

	header := titleStyle.Render("Skills Manager\n\n")
	return bodyStyle.Render(
		header +
			m.choices.View() +
			fmt.Sprintf("\n%s%s\n", status, help),
	)
}

