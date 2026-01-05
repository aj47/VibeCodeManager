import { useCallback } from "react"
import { Control, ControlGroup, ControlLabel } from "@renderer/components/ui/control"
import { Switch } from "@renderer/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import {
  useConfigQuery,
  useSaveConfigMutation,
} from "@renderer/lib/query-client"
import { Config } from "@shared/types"
import { Mic, Volume2, Bot, Zap, CheckCircle, AlertCircle } from "lucide-react"
import {
  LOCAL_TTS_VOICES,
} from "@shared/index"
import { useQuery } from "@tanstack/react-query"
import { tipcClient } from "@renderer/lib/tipc-client"

export function Component() {
  const configQuery = useConfigQuery()
  const saveConfigMutation = useSaveConfigMutation()

  // Check voice pipeline status
  const pipelineStatusQuery = useQuery({
    queryKey: ["voicePipelineStatus"],
    queryFn: () => tipcClient.getVoicePipelineStatus(),
    refetchInterval: 5000,
  })

  const saveConfig = useCallback(
    (config: Partial<Config>) => {
      saveConfigMutation.mutate({
        config: {
          ...configQuery.data,
          ...config,
        },
      })
    },
    [saveConfigMutation, configQuery.data],
  )

  if (!configQuery.data) return null

  const isVoiceToClaudeEnabled = configQuery.data.voiceToClaudeCodeEnabled ?? true
  const hasLocalSTT = pipelineStatusQuery.data?.hasSTT ?? false
  const hasLocalTTS = pipelineStatusQuery.data?.hasTTS ?? false
  const hasAgent = pipelineStatusQuery.data?.hasAgent ?? false

  return (
    <div className="modern-panel h-full overflow-auto px-6 py-4">
      <div className="grid gap-6">
        
        {/* Voice Mode Status */}
        <ControlGroup title="Voice Mode">
          <div className="px-3 py-2 bg-primary/5 border-b border-primary/20">
            <p className="text-xs text-muted-foreground">
              Voice commands are processed locally and routed to Claude Code. No cloud API keys needed.
            </p>
          </div>
          
          <Control
            label={
              <ControlLabel
                label={
                  <span className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    Voice-to-Claude-Code
                  </span>
                }
                tooltip="Voice commands are sent directly to Claude Code for processing."
              />
            }
            className="px-3"
          >
            <Switch
              checked={isVoiceToClaudeEnabled}
              onCheckedChange={(checked) => saveConfig({ voiceToClaudeCodeEnabled: checked })}
            />
          </Control>

          {isVoiceToClaudeEnabled && (
            <div className="px-3 py-2 bg-green-500/5 border-t border-green-500/20">
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Voice commands will be processed by Claude Code.
              </p>
            </div>
          )}
        </ControlGroup>

        {/* Local Providers Status */}
        <ControlGroup title="Local Processing">
          <div className="px-3 py-2 bg-muted/30 border-b">
            <p className="text-xs text-muted-foreground">
              On-device voice processing for complete privacy.
            </p>
          </div>

          {/* STT Status */}
          <Control
            label={
              <ControlLabel
                label={
                  <span className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-muted-foreground" />
                    Speech-to-Text (FluidAudio)
                  </span>
                }
                tooltip="Local voice transcription using FluidAudio/Parakeet"
              />
            }
            className="px-3"
          >
            {hasLocalSTT ? (
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Ready
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                Not installed
              </span>
            )}
          </Control>

          {!hasLocalSTT && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-amber-500/5">
              Build the STT binary: <code className="bg-muted px-1 rounded">./scripts/build-swift.sh</code>
            </div>
          )}

          {/* TTS Status */}
          <Control
            label={
              <ControlLabel
                label={
                  <span className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                    Text-to-Speech (Kitten TTS)
                  </span>
                }
                tooltip="Local voice synthesis using Kitten TTS"
              />
            }
            className="px-3"
          >
            {hasLocalTTS ? (
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Ready
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                Not installed
              </span>
            )}
          </Control>

          {!hasLocalTTS && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-amber-500/5">
              Set up TTS: <code className="bg-muted px-1 rounded">cd speakmcp-tts && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt</code>
            </div>
          )}

          {/* Voice Selection (only when TTS is available) */}
          {hasLocalTTS && (
            <Control
              label={<ControlLabel label="Voice" tooltip="Select the TTS voice" />}
              className="px-3"
            >
              <Select
                value={configQuery.data.localTtsVoice || "expr-voice-2-f"}
                onValueChange={(value) => saveConfig({ localTtsVoice: value })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCAL_TTS_VOICES.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      {voice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Control>
          )}

          {/* Agent Status */}
          <Control
            label={
              <ControlLabel
                label={
                  <span className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    Claude Code Agent
                  </span>
                }
                tooltip="ACP agent for processing voice commands"
              />
            }
            className="px-3"
          >
            {hasAgent ? (
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Configured
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                Not configured
              </span>
            )}
          </Control>

          {!hasAgent && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-amber-500/5">
              Go to Settings → Agents to add Claude Code agent.
            </div>
          )}
        </ControlGroup>

        {/* TTS Settings */}
        <ControlGroup title="Text-to-Speech Settings">
          <Control
            label={<ControlLabel label="Enable TTS" tooltip="Speak responses aloud" />}
            className="px-3"
          >
            <Switch
              checked={configQuery.data.ttsEnabled ?? true}
              onCheckedChange={(checked) => saveConfig({ ttsEnabled: checked })}
            />
          </Control>

          <Control
            label={<ControlLabel label="Auto-play responses" tooltip="Automatically speak agent responses" />}
            className="px-3"
          >
            <Switch
              checked={configQuery.data.ttsAutoPlay ?? true}
              onCheckedChange={(checked) => saveConfig({ ttsAutoPlay: checked })}
            />
          </Control>

          <Control
            label={<ControlLabel label="Remove code blocks" tooltip="Don't read code blocks aloud" />}
            className="px-3"
          >
            <Switch
              checked={configQuery.data.ttsRemoveCodeBlocks ?? true}
              onCheckedChange={(checked) => saveConfig({ ttsRemoveCodeBlocks: checked })}
            />
          </Control>
        </ControlGroup>
      </div>
    </div>
  )
}
