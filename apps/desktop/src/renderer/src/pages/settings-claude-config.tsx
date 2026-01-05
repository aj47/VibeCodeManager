import { useState, useEffect } from "react"
import { ControlGroup } from "@renderer/components/ui/control"
import { Button } from "@renderer/components/ui/button"
import { Label } from "@renderer/components/ui/label"
import { Textarea } from "@renderer/components/ui/textarea"
import { Input } from "@renderer/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@renderer/components/ui/tabs"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ProjectConfig, ClaudeCodeMCPServer, ClaudeCodeProjectSettings, ClaudeCodeHooks } from "../../../shared/types"
import { Server, Settings, FileText, Plus, Trash2, Save, RefreshCw, FolderOpen, Sparkles, Globe, Terminal } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@renderer/lib/utils"

// Query hook for config
function useConfigQuery() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => tipcClient.getConfig(),
  })
}

// Query hook for global Claude config (~/.claude.json)
function useGlobalConfigQuery() {
  return useQuery({
    queryKey: ["claudeGlobalConfig"],
    queryFn: () => tipcClient.readClaudeGlobalConfig(),
  })
}

// Query hook for user settings (~/.claude/settings.json)
function useUserSettingsQuery() {
  return useQuery({
    queryKey: ["claudeUserSettings"],
    queryFn: () => tipcClient.readClaudeUserSettings(),
  })
}

// Query hook for Claude Code config for a specific project
function useClaudeCodeConfigQuery(projectPath: string | null) {
  return useQuery({
    queryKey: ["claudeCodeConfig", projectPath],
    queryFn: async () => {
      if (!projectPath) return null
      return tipcClient.readClaudeCodeConfig({ projectPath })
    },
    enabled: !!projectPath,
  })
}

// Query hook for project skills
function useProjectSkillsQuery(projectPath: string | null) {
  return useQuery({
    queryKey: ["projectSkills", projectPath],
    queryFn: async () => {
      if (!projectPath) return []
      return tipcClient.readProjectSkills({ projectPath })
    },
    enabled: !!projectPath,
  })
}

// Query hook for user commands (~/.claude/commands/)
function useUserCommandsQuery() {
  return useQuery({
    queryKey: ["userCommands"],
    queryFn: () => tipcClient.readUserCommands(),
  })
}

// MCP Servers Editor Component
function MCPServersEditor({
  servers,
  onChange,
  title,
  description,
  readOnly = false,
}: {
  servers: Record<string, ClaudeCodeMCPServer>
  onChange: (servers: Record<string, ClaudeCodeMCPServer>) => void
  title: string
  description: string
  readOnly?: boolean
}) {
  const [newServerName, setNewServerName] = useState("")

  const handleAddServer = () => {
    if (!newServerName.trim()) {
      toast.error("Server name is required")
      return
    }
    if (servers[newServerName]) {
      toast.error("Server with this name already exists")
      return
    }
    onChange({
      ...servers,
      [newServerName]: { command: "", args: [] },
    })
    setNewServerName("")
  }

  const handleRemoveServer = (name: string) => {
    const { [name]: _, ...rest } = servers
    onChange(rest)
  }

  const handleUpdateServer = (name: string, server: ClaudeCodeMCPServer) => {
    onChange({ ...servers, [name]: server })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {Object.entries(servers).length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No MCP servers configured</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(servers).map(([name, server]) => (
            <div key={name} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{name}</span>
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveServer(name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-2">
                <div>
                  <Label className="text-xs">Command</Label>
                  <Input
                    value={server.command || ""}
                    onChange={(e) => handleUpdateServer(name, { ...server, command: e.target.value })}
                    placeholder="npx, node, python, etc."
                    disabled={readOnly}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Arguments (space-separated)</Label>
                  <Input
                    value={server.args?.join(" ") || ""}
                    onChange={(e) => handleUpdateServer(name, { ...server, args: e.target.value.split(" ").filter(Boolean) })}
                    placeholder="-y @modelcontextprotocol/server-filesystem"
                    disabled={readOnly}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <Input
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
            placeholder="New server name"
            className="h-8"
          />
          <Button variant="outline" size="sm" onClick={handleAddServer}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      )}
    </div>
  )
}

// Hooks Editor Component
function HooksEditor({
  hooks,
  onChange,
}: {
  hooks: ClaudeCodeHooks
  onChange: (hooks: ClaudeCodeHooks) => void
}) {
  const hookTypes = ["PreToolUse", "PostToolUse", "SessionStart", "SessionEnd", "Notification", "Stop"] as const

  const handleAddHook = (type: keyof ClaudeCodeHooks) => {
    const current = hooks[type] || []
    onChange({
      ...hooks,
      [type]: [...current, { matcher: "*", hooks: [{ type: "command", command: "" }] }],
    })
  }

  const handleRemoveHook = (type: keyof ClaudeCodeHooks, index: number) => {
    const current = hooks[type] || []
    onChange({
      ...hooks,
      [type]: current.filter((_, i) => i !== index),
    })
  }

  const handleUpdateHook = (type: keyof ClaudeCodeHooks, index: number, matcher: string, command: string) => {
    const current = hooks[type] || []
    const updated = [...current]
    updated[index] = { matcher, hooks: [{ type: "command", command }] }
    onChange({ ...hooks, [type]: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Hooks</h3>
        <p className="text-xs text-muted-foreground">
          Configure commands to run at various lifecycle events
        </p>
      </div>

      {hookTypes.map((type) => (
        <div key={type} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">{type}</Label>
            <Button variant="ghost" size="sm" onClick={() => handleAddHook(type)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {(hooks[type] || []).map((hook, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                value={hook.matcher}
                onChange={(e) => handleUpdateHook(type, index, e.target.value, hook.hooks[0]?.command || "")}
                placeholder="Matcher (e.g., Write|Edit or *)"
                className="h-7 text-xs flex-1"
              />
              <Input
                value={hook.hooks[0]?.command || ""}
                onChange={(e) => handleUpdateHook(type, index, hook.matcher, e.target.value)}
                placeholder="Command to run"
                className="h-7 text-xs flex-[2]"
              />
              <Button variant="ghost" size="sm" onClick={() => handleRemoveHook(type, index)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Skills Editor Component (reused for both project skills and user commands)
function SkillsEditor({
  skills,
  onSave,
  onDelete,
  isSaving,
  title = "Skills / Subagents",
  description = "Skills are markdown files in .claude/agents/ that define specialized subagents. Use @skillname to invoke them in Claude Code.",
  prefix = "@",
}: {
  skills: Array<{ name: string; content: string }>
  onSave: (name: string, content: string) => void
  onDelete: (name: string) => void
  isSaving: boolean
  title?: string
  description?: string
  prefix?: string
}) {
  const [newSkillName, setNewSkillName] = useState("")
  const [editingSkill, setEditingSkill] = useState<{ name: string; content: string } | null>(null)

  const handleAddSkill = () => {
    if (!newSkillName.trim()) {
      toast.error("Name is required")
      return
    }
    if (skills.some((s) => s.name === newSkillName)) {
      toast.error("Item with this name already exists")
      return
    }
    setEditingSkill({ name: newSkillName, content: `# ${newSkillName}\n\nDescribe what this does...\n` })
    setNewSkillName("")
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {skills.length === 0 && !editingSkill ? (
        <p className="text-sm text-muted-foreground italic">None configured</p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill: { name: string; content: string; type?: string }) => (
            <div key={skill.name} className="rounded-md border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{prefix}{skill.name}</span>
                  {skill.type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {skill.type === "skills" ? ".claude/skills/" : ".claude/agents/"}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingSkill(skill)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(skill.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {skill.content.split("\n").slice(0, 2).join(" ")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add new item */}
      <div className="flex gap-2">
        <Input
          value={newSkillName}
          onChange={(e) => setNewSkillName(e.target.value)}
          placeholder={`New name (e.g., ${prefix === "/" ? "my-command" : "code-reviewer"})`}
          className="h-8"
        />
        <Button variant="outline" size="sm" onClick={handleAddSkill}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Edit modal/panel */}
      {editingSkill && (
        <div className="rounded-md border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Editing: {prefix}{editingSkill.name}</Label>
            <Button variant="ghost" size="sm" onClick={() => setEditingSkill(null)}>
              Cancel
            </Button>
          </div>
          <Textarea
            value={editingSkill.content}
            onChange={(e) => setEditingSkill({ ...editingSkill, content: e.target.value })}
            placeholder="# Name&#10;&#10;Describe what this does..."
            className="min-h-[200px] font-mono text-sm"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => {
                onSave(editingSkill.name, editingSkill.content)
                setEditingSkill(null)
              }}
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Main Component
export function Component() {
  const queryClient = useQueryClient()
  const configQuery = useConfigQuery()
  const globalConfigQuery = useGlobalConfigQuery()
  const userSettingsQuery = useUserSettingsQuery()
  const projects = configQuery.data?.projects || []
  const activeProjectId = configQuery.data?.activeProjectId

  // Find active project or first project
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0]
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Set initial selected project
  useEffect(() => {
    if (!selectedProjectId && activeProject) {
      setSelectedProjectId(activeProject.id)
    }
  }, [activeProject, selectedProjectId])

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const projectPath = selectedProject?.directories.find((d) => d.isDefault)?.path || selectedProject?.directories[0]?.path

  const claudeConfigQuery = useClaudeCodeConfigQuery(projectPath || null)
  const skillsQuery = useProjectSkillsQuery(projectPath || null)
  const userCommandsQuery = useUserCommandsQuery()

  // Local state for editing
  const [projectMcpServers, setProjectMcpServers] = useState<Record<string, ClaudeCodeMCPServer>>({})
  const [projectSettings, setProjectSettings] = useState<ClaudeCodeProjectSettings>({})
  const [claudeMd, setClaudeMd] = useState("")
  const [hasChanges, setHasChanges] = useState(false)

  // Sync local state when config loads
  useEffect(() => {
    if (claudeConfigQuery.data) {
      setProjectMcpServers(claudeConfigQuery.data.projectMcpServers || {})
      setProjectSettings(claudeConfigQuery.data.projectSettings || {})
      setClaudeMd(claudeConfigQuery.data.claudeMd || "")
      setHasChanges(false)
    }
  }, [claudeConfigQuery.data])

  // Save mutations
  const saveMcpMutation = useMutation({
    mutationFn: async () => {
      if (!projectPath) throw new Error("No project path")
      return tipcClient.writeProjectMcpConfig({
        projectPath,
        config: { mcpServers: projectMcpServers },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claudeCodeConfig", projectPath] })
      toast.success("MCP servers saved")
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!projectPath) throw new Error("No project path")
      return tipcClient.writeProjectSettings({
        projectPath,
        settings: projectSettings,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claudeCodeConfig", projectPath] })
      toast.success("Settings saved")
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  const saveClaudeMdMutation = useMutation({
    mutationFn: async () => {
      if (!projectPath) throw new Error("No project path")
      return tipcClient.writeClaudeMd({ projectPath, content: claudeMd })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claudeCodeConfig", projectPath] })
      toast.success("CLAUDE.md saved")
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  const saveSkillMutation = useMutation({
    mutationFn: async ({ name, content }: { name: string; content: string }) => {
      if (!projectPath) throw new Error("No project path")
      return tipcClient.writeProjectSkill({ projectPath, name, content })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectSkills", projectPath] })
      toast.success("Skill saved")
    },
    onError: (error) => {
      toast.error(`Failed to save skill: ${error.message}`)
    },
  })

  const deleteSkillMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!projectPath) throw new Error("No project path")
      return tipcClient.deleteProjectSkill({ projectPath, name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectSkills", projectPath] })
      toast.success("Skill deleted")
    },
    onError: (error) => {
      toast.error(`Failed to delete skill: ${error.message}`)
    },
  })

  const saveUserCommandMutation = useMutation({
    mutationFn: async ({ name, content }: { name: string; content: string }) => {
      return tipcClient.writeUserCommand({ name, content })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userCommands"] })
      toast.success("Command saved")
    },
    onError: (error) => {
      toast.error(`Failed to save command: ${error.message}`)
    },
  })

  const deleteUserCommandMutation = useMutation({
    mutationFn: async (name: string) => {
      return tipcClient.deleteUserCommand({ name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userCommands"] })
      toast.success("Command deleted")
    },
    onError: (error) => {
      toast.error(`Failed to delete command: ${error.message}`)
    },
  })

  if (configQuery.isLoading) {
    return <div className="p-6">Loading...</div>
  }

  if (projects.length === 0) {
    return (
      <div className="modern-panel h-full overflow-auto px-6 py-4">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Claude Code Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Configure MCP servers, hooks, and project instructions for Claude Code.
            </p>
          </div>
          <div className="rounded-md border border-dashed p-8 text-center">
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-sm font-medium">No Projects</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a project first to configure Claude Code settings.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.href = "#/settings/projects"}>
              Go to Projects
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modern-panel h-full overflow-auto px-6 py-4">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Claude Code Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure MCP servers, hooks, and project instructions for Claude Code.
          </p>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-4">
          <Label>Project:</Label>
          <Select value={selectedProjectId || ""} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectPath && (
            <span className="text-xs text-muted-foreground truncate max-w-[300px]" title={projectPath}>
              {projectPath}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => claudeConfigQuery.refetch()}
            disabled={claudeConfigQuery.isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", claudeConfigQuery.isFetching && "animate-spin")} />
          </Button>
        </div>

        {/* Tabs for different config sections */}
        <Tabs defaultValue="global" className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="global" className="gap-1">
              <Globe className="h-4 w-4" />
              Global
            </TabsTrigger>
            <TabsTrigger value="commands" className="gap-1">
              <Terminal className="h-4 w-4" />
              Commands
            </TabsTrigger>
            <TabsTrigger value="mcp" className="gap-1">
              <Server className="h-4 w-4" />
              MCP Servers
            </TabsTrigger>
            <TabsTrigger value="skills" className="gap-1">
              <Sparkles className="h-4 w-4" />
              Skills
            </TabsTrigger>
            <TabsTrigger value="hooks" className="gap-1">
              <Settings className="h-4 w-4" />
              Hooks
            </TabsTrigger>
            <TabsTrigger value="claudemd" className="gap-1">
              <FileText className="h-4 w-4" />
              CLAUDE.md
            </TabsTrigger>
          </TabsList>

          {/* Global Config Tab */}
          <TabsContent value="global" className="space-y-6 mt-4">
            <ControlGroup>
              <div className="p-4 space-y-6">
                {/* Global Config (~/.claude.json) */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Global Config (~/.claude.json)</h3>
                    <p className="text-xs text-muted-foreground">
                      Global preferences and MCP servers. Edit the file directly to modify.
                    </p>
                  </div>
                  {globalConfigQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : globalConfigQuery.data ? (
                    <div className="rounded-md border p-3 bg-muted/30">
                      <pre className="text-xs font-mono overflow-auto max-h-[200px]">
                        {JSON.stringify(globalConfigQuery.data, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No global config found (~/.claude.json)</p>
                  )}
                </div>

                {/* User Settings (~/.claude/settings.json) */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">User Settings (~/.claude/settings.json)</h3>
                    <p className="text-xs text-muted-foreground">
                      User-level settings including permissions and hooks. Edit the file directly to modify.
                    </p>
                  </div>
                  {userSettingsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : userSettingsQuery.data ? (
                    <div className="rounded-md border p-3 bg-muted/30">
                      <pre className="text-xs font-mono overflow-auto max-h-[200px]">
                        {JSON.stringify(userSettingsQuery.data, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No user settings found (~/.claude/settings.json)</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      globalConfigQuery.refetch()
                      userSettingsQuery.refetch()
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            </ControlGroup>
          </TabsContent>

          {/* Commands Tab (User slash commands) */}
          <TabsContent value="commands" className="space-y-6 mt-4">
            <ControlGroup>
              <div className="p-4">
                <SkillsEditor
                  skills={userCommandsQuery.data || []}
                  onSave={(name, content) => saveUserCommandMutation.mutate({ name, content })}
                  onDelete={(name) => deleteUserCommandMutation.mutate(name)}
                  isSaving={saveUserCommandMutation.isPending}
                  title="User Commands (~/.claude/commands/)"
                  description="Custom slash commands available globally. Use /commandname to invoke in Claude Code."
                  prefix="/"
                />
              </div>
            </ControlGroup>
          </TabsContent>

          {/* MCP Servers Tab */}
          <TabsContent value="mcp" className="space-y-6 mt-4">
            <ControlGroup>
              {/* Global MCP Servers (read-only) */}
              <div className="p-4 border-b">
                <MCPServersEditor
                  servers={globalConfigQuery.data?.mcpServers || {}}
                  onChange={() => {}}
                  title="Global MCP Servers (~/.claude.json)"
                  description="These are configured globally and apply to all projects. Edit ~/.claude.json directly to modify."
                  readOnly
                />
              </div>

              {/* Project MCP Servers */}
              <div className="p-4">
                <MCPServersEditor
                  servers={projectMcpServers}
                  onChange={(servers) => {
                    setProjectMcpServers(servers)
                    setHasChanges(true)
                  }}
                  title="Project MCP Servers (.mcp.json)"
                  description="MCP servers specific to this project."
                />
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => saveMcpMutation.mutate()} disabled={saveMcpMutation.isPending}>
                    <Save className="h-4 w-4 mr-1" />
                    Save MCP Config
                  </Button>
                </div>
              </div>
            </ControlGroup>
          </TabsContent>

          {/* Skills Tab */}
          <TabsContent value="skills" className="space-y-6 mt-4">
            <ControlGroup>
              <div className="p-4">
                <SkillsEditor
                  skills={skillsQuery.data || []}
                  onSave={(name, content) => saveSkillMutation.mutate({ name, content })}
                  onDelete={(name) => deleteSkillMutation.mutate(name)}
                  isSaving={saveSkillMutation.isPending}
                />
              </div>
            </ControlGroup>
          </TabsContent>

          {/* Hooks Tab */}
          <TabsContent value="hooks" className="space-y-6 mt-4">
            <ControlGroup>
              <div className="p-4">
                <HooksEditor
                  hooks={projectSettings.hooks || {}}
                  onChange={(hooks) => {
                    setProjectSettings({ ...projectSettings, hooks })
                    setHasChanges(true)
                  }}
                />
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                    <Save className="h-4 w-4 mr-1" />
                    Save Settings
                  </Button>
                </div>
              </div>
            </ControlGroup>
          </TabsContent>

          {/* CLAUDE.md Tab */}
          <TabsContent value="claudemd" className="space-y-6 mt-4">
            <ControlGroup>
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Project Instructions (CLAUDE.md)</h3>
                  <p className="text-xs text-muted-foreground">
                    Markdown file with project-specific instructions for Claude Code.
                  </p>
                </div>
                <Textarea
                  value={claudeMd}
                  onChange={(e) => {
                    setClaudeMd(e.target.value)
                    setHasChanges(true)
                  }}
                  placeholder="# Project Instructions&#10;&#10;Add project-specific instructions for Claude Code here..."
                  className="min-h-[300px] font-mono text-sm"
                />
                <div className="flex justify-end">
                  <Button onClick={() => saveClaudeMdMutation.mutate()} disabled={saveClaudeMdMutation.isPending}>
                    <Save className="h-4 w-4 mr-1" />
                    Save CLAUDE.md
                  </Button>
                </div>
              </div>
            </ControlGroup>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

