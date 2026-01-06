import { createBrowserRouter } from "react-router-dom"

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter([
    {
      path: "/",
      lazy: () => import("./components/app-layout"),
      children: [
        // Level 1: Project Dashboard (all projects overview)
        {
          path: "",
          lazy: () => import("./components/project-dashboard"),
        },
        // Level 2: Project View (single project with all agents)
        {
          path: "project/:projectId",
          lazy: () => import("./components/project-view"),
        },
        // Level 3: Agent Terminal View (single agent session)
        {
          path: "project/:projectId/agent/:sessionId",
          lazy: () => import("./pages/sessions"),
        },
        // Legacy session routes (keep for backwards compatibility)
        {
          path: "session/:id",
          lazy: () => import("./pages/sessions"),
        },
        {
          path: "history",
          lazy: () => import("./pages/sessions"),
        },
        {
          path: "history/:id",
          lazy: () => import("./pages/sessions"),
        },
        {
          path: "settings",
          lazy: () => import("./pages/settings-general"),
        },
        {
          path: "settings/general",
          lazy: () => import("./pages/settings-general"),
        },
        {
          path: "settings/providers",
          lazy: () => import("./pages/settings-providers-and-models"),
        },
        {
          path: "settings/models",
          lazy: () => import("./pages/settings-providers-and-models"),
        },
        {
          path: "settings/tools",
          lazy: () => import("./pages/settings-tools"),
        },
        {
          path: "settings/mcp-tools",
          lazy: () => import("./pages/settings-mcp-tools"),
        },
        {
          path: "settings/remote-server",
          lazy: () => import("./pages/settings-remote-server"),
        },
        {
          path: "settings/acp-agents",
          lazy: () => import("./pages/settings-acp-agents"),
        },
        {
          path: "settings/projects",
          lazy: () => import("./pages/settings-projects"),
        },
        {
          path: "settings/claude-config",
          lazy: () => import("./pages/settings-claude-config"),
        },

      ],
    },
    {
      path: "/setup",
      lazy: () => import("./pages/setup"),
    },
    {
      path: "/onboarding",
      lazy: () => import("./pages/onboarding"),
    },
    {
      path: "/panel",
      lazy: () => import("./pages/panel"),
    },
  ])
