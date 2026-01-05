import { useState, useCallback } from "react"
import { ControlGroup } from "@renderer/components/ui/control"
import { Input } from "@renderer/components/ui/input"
import { Button } from "@renderer/components/ui/button"
import { Label } from "@renderer/components/ui/label"
import { Textarea } from "@renderer/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ProjectConfig, ProjectDirectory, ProjectParentFolder } from "../../../shared/types"
import { Plus, Pencil, Trash2, FolderOpen, GitBranch, Check, FolderPlus, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@renderer/lib/utils"

// Helper to generate unique IDs
const generateId = () => crypto.randomUUID()

function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
  parentFolders,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectConfig | null
  onSave: (project: ProjectConfig) => void
  parentFolders: ProjectParentFolder[]
}) {
  const [name, setName] = useState(project?.name || "")
  const [description, setDescription] = useState(project?.description || "")
  const [directories, setDirectories] = useState<ProjectDirectory[]>(
    project?.directories || []
  )
  const [gitRepoUrl, setGitRepoUrl] = useState(project?.gitRepoUrl || "")
  const [claudeCodeArgs, setClaudeCodeArgs] = useState(
    project?.claudeCodeArgs?.join(" ") || ""
  )

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setName(project?.name || "")
      setDescription(project?.description || "")
      setDirectories(project?.directories || [])
      setGitRepoUrl(project?.gitRepoUrl || "")
      setClaudeCodeArgs(project?.claudeCodeArgs?.join(" ") || "")
    }
    onOpenChange(newOpen)
  }

  const handleAddDirectory = async () => {
    try {
      const result = await tipcClient.selectDirectory()
      if (result) {
        const newDir: ProjectDirectory = {
          id: generateId(),
          path: result,
          isDefault: directories.length === 0,
        }
        setDirectories([...directories, newDir])
      }
    } catch (error) {
      toast.error("Failed to select directory")
    }
  }

  const handleRemoveDirectory = (id: string) => {
    const remaining = directories.filter((d) => d.id !== id)
    // If we removed the default, make the first one default
    if (remaining.length > 0 && !remaining.some((d) => d.isDefault)) {
      remaining[0].isDefault = true
    }
    setDirectories(remaining)
  }

  const handleSetDefaultDirectory = (id: string) => {
    setDirectories(
      directories.map((d) => ({
        ...d,
        isDefault: d.id === id,
      }))
    )
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Project name is required")
      return
    }
    if (directories.length === 0) {
      toast.error("At least one directory is required")
      return
    }

    const now = Date.now()
    const projectData: ProjectConfig = {
      id: project?.id || generateId(),
      name: name.trim(),
      description: description.trim() || undefined,
      directories,
      gitRepoUrl: gitRepoUrl.trim() || undefined,
      claudeCodeArgs: claudeCodeArgs.trim()
        ? claudeCodeArgs.trim().split(/\s+/)
        : undefined,
      createdAt: project?.createdAt || now,
      updatedAt: now,
    }

    onSave(projectData)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription>
            Configure a project with one or more working directories for Claude Code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Project"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this project"
              rows={2}
            />
          </div>

          {/* Directories */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Working Directories</Label>
              <Button variant="outline" size="sm" onClick={handleAddDirectory}>
                <FolderPlus className="mr-1 h-4 w-4" />
                Add Directory
              </Button>
            </div>
            {directories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No directories added yet. Click "Add Directory" to select a folder.
              </p>
            ) : (
              <div className="space-y-2">
                {directories.map((dir) => (
                  <div
                    key={dir.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2",
                      dir.isDefault && "border-primary bg-primary/5"
                    )}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm" title={dir.path}>
                      {dir.path}
                    </span>
                    {dir.isDefault ? (
                      <span className="text-xs text-primary">Default</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefaultDirectory(dir.id)}
                        title="Set as default"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveDirectory(dir.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Git Repo URL */}
          <div className="space-y-2">
            <Label htmlFor="git-url">Git Repository URL (optional)</Label>
            <Input
              id="git-url"
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
            />
          </div>

          {/* Claude Code Args */}
          <div className="space-y-2">
            <Label htmlFor="claude-args">Claude Code Arguments (optional)</Label>
            <Input
              id="claude-args"
              value={claudeCodeArgs}
              onChange={(e) => setClaudeCodeArgs(e.target.value)}
              placeholder="--dangerously-skip-permissions"
            />
            <p className="text-xs text-muted-foreground">
              Additional arguments to pass to Claude Code when running in this project.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {project ? "Save Changes" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


// Query hook for config
function useConfigQuery() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => tipcClient.getConfig(),
  })
}

export function Component() {
  const queryClient = useQueryClient()
  const configQuery = useConfigQuery()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectConfig | null>(null)

  const projects = configQuery.data?.projects || []
  const activeProjectId = configQuery.data?.activeProjectId
  const parentFolders = configQuery.data?.projectParentFolders || []

  const saveProjectsMutation = useMutation({
    mutationFn: async (newProjects: ProjectConfig[]) => {
      await tipcClient.saveConfig({
        config: { projects: newProjects },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
    },
  })

  const setActiveProjectMutation = useMutation({
    mutationFn: async (projectId: string | undefined) => {
      await tipcClient.saveConfig({
        config: { activeProjectId: projectId },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
    },
  })

  const handleSaveProject = useCallback(
    (project: ProjectConfig) => {
      const existing = projects.find((p) => p.id === project.id)
      let newProjects: ProjectConfig[]

      if (existing) {
        newProjects = projects.map((p) => (p.id === project.id ? project : p))
        toast.success(`Project "${project.name}" updated`)
      } else {
        newProjects = [...projects, project]
        toast.success(`Project "${project.name}" created`)
      }

      saveProjectsMutation.mutate(newProjects)
      setEditingProject(null)
    },
    [projects, saveProjectsMutation]
  )

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return

      if (!confirm(`Delete project "${project.name}"?`)) return

      const newProjects = projects.filter((p) => p.id !== projectId)
      saveProjectsMutation.mutate(newProjects)

      // If we deleted the active project, clear activeProjectId
      if (activeProjectId === projectId) {
        setActiveProjectMutation.mutate(undefined)
      }

      toast.success(`Project "${project.name}" deleted`)
    },
    [projects, activeProjectId, saveProjectsMutation, setActiveProjectMutation]
  )

  const handleSetActiveProject = useCallback(
    (projectId: string) => {
      const newActiveId = activeProjectId === projectId ? undefined : projectId
      setActiveProjectMutation.mutate(newActiveId)
      const project = projects.find((p) => p.id === projectId)
      if (newActiveId && project) {
        toast.success(`"${project.name}" is now the active project`)
      }
    },
    [activeProjectId, projects, setActiveProjectMutation]
  )

  if (configQuery.isLoading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="modern-panel h-full overflow-auto px-6 py-4">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Manage your projects and their working directories for Claude Code.
          </p>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Your Projects</span>
          <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New Project
          </Button>
        </div>
        <ControlGroup>
          {projects.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No projects yet. Create one to get started!
            </div>
          ) : (
            <div className="divide-y">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId
                const defaultDir = project.directories.find((d) => d.isDefault)
                return (
                  <div
                    key={project.id}
                    className={cn(
                      "flex items-center gap-3 p-3",
                      isActive && "bg-primary/5"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{project.name}</span>
                        {isActive && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            Active
                          </span>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {project.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FolderOpen className="h-3 w-3" />
                          {project.directories.length} dir{project.directories.length !== 1 && "s"}
                        </span>
                        {defaultDir && (
                          <span className="truncate" title={defaultDir.path}>
                            {defaultDir.path}
                          </span>
                        )}
                        {project.gitRepoUrl && (
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            Git
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleSetActiveProject(project.id)}
                      >
                        {isActive ? "Active" : "Set Active"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingProject(project)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteProject(project.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ControlGroup>
      </div>

      {/* Add Project Dialog */}
      <ProjectDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        project={null}
        onSave={handleSaveProject}
        parentFolders={parentFolders}
      />

      {/* Edit Project Dialog */}
      <ProjectDialog
        open={!!editingProject}
        onOpenChange={(open) => !open && setEditingProject(null)}
        project={editingProject}
        onSave={handleSaveProject}
        parentFolders={parentFolders}
      />
    </div>
  )
}

