import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { useConfigQuery, useSaveConfigMutation } from "@renderer/lib/query-client"
import { Config } from "@shared/types"
import { useNavigate } from "react-router-dom"
import { tipcClient } from "@renderer/lib/tipc-client"
import { Recorder } from "@renderer/lib/recorder"
import { useMutation, useQuery } from "@tanstack/react-query"

type OnboardingStep = "welcome" | "setup-check" | "voice-test" | "complete"

interface SetupStatus {
  hasLocalSTT: boolean
  hasLocalTTS: boolean
  hasAgent: boolean
  agentName?: string
}

export function Component() {
  const [step, setStep] = useState<OnboardingStep>("welcome")
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceResult, setVoiceResult] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const navigate = useNavigate()
  const configQuery = useConfigQuery()
  const saveConfigMutation = useSaveConfigMutation()
  const recorderRef = useRef<Recorder | null>(null)

  // Check voice pipeline status
  const pipelineStatusQuery = useQuery({
    queryKey: ["voicePipelineStatus"],
    queryFn: () => tipcClient.getVoicePipelineStatus(),
    refetchInterval: 2000, // Refresh every 2 seconds while on setup-check step
    enabled: step === "setup-check",
  })

  const setupStatus: SetupStatus = {
    hasLocalSTT: pipelineStatusQuery.data?.hasSTT ?? false,
    hasLocalTTS: pipelineStatusQuery.data?.hasTTS ?? false,
    hasAgent: pipelineStatusQuery.data?.hasAgent ?? false,
    agentName: pipelineStatusQuery.data?.agentName,
  }

  const saveConfig = useCallback(
    (config: Partial<Config>) => {
      if (!configQuery.data) return
      saveConfigMutation.mutate({
        config: {
          ...configQuery.data,
          ...config,
        },
      })
    },
    [saveConfigMutation, configQuery.data]
  )

  // Voice command mutation
  const voiceCommandMutation = useMutation({
    mutationFn: async ({ blob }: { blob: Blob }) => {
      setIsTranscribing(true)
      const result = await tipcClient.createVoiceCommand({
        recording: await blob.arrayBuffer(),
        speakResponse: true,
      })
      return result
    },
    onSuccess: (result) => {
      setIsTranscribing(false)
      if (result?.transcript) {
        setVoiceResult(`You said: "${result.transcript}"\n\nClaude Code responded: ${result.response}`)
      }
    },
    onError: (error: any) => {
      setIsTranscribing(false)
      console.error("Voice command failed:", error)
      setVoiceError(error?.message || String(error))
    },
  })

  // Initialize recorder
  useEffect(() => {
    if (recorderRef.current) return undefined

    const recorder = (recorderRef.current = new Recorder())

    recorder.on("record-start", () => {
      setIsRecording(true)
    })

    recorder.on("record-end", (blob, duration) => {
      setIsRecording(false)
      if (blob.size > 0 && duration >= 100) {
        voiceCommandMutation.mutate({ blob })
      }
    })

    return () => {
      recorder.stopRecording()
    }
  }, [])

  const handleStartRecording = useCallback(async () => {
    setVoiceResult(null)
    setVoiceError(null)
    try {
      await recorderRef.current?.startRecording()
    } catch (error: any) {
      console.error("Failed to start recording:", error)
      setVoiceError(error?.message || "Failed to start recording")
    }
  }, [])

  const handleStopRecording = useCallback(() => {
    recorderRef.current?.stopRecording()
  }, [])

  const handleCompleteOnboarding = useCallback(() => {
    // Enable voice-to-Claude-Code mode and mark onboarding complete
    saveConfig({
      onboardingCompleted: true,
      voiceToClaudeCodeEnabled: true,
      sttProviderId: "local",
    })
    navigate("/")
  }, [saveConfig, navigate])

  const handleSkipOnboarding = useCallback(() => {
    saveConfig({ onboardingCompleted: true })
    navigate("/")
  }, [saveConfig, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="max-w-lg w-full">
        {step === "welcome" && (
          <WelcomeStep
            onNext={() => setStep("setup-check")}
            onSkip={handleSkipOnboarding}
          />
        )}
        {step === "setup-check" && (
          <SetupCheckStep
            status={setupStatus}
            isLoading={pipelineStatusQuery.isLoading}
            onNext={() => setStep("voice-test")}
            onBack={() => setStep("welcome")}
            onSkip={handleSkipOnboarding}
          />
        )}
        {step === "voice-test" && (
          <VoiceTestStep
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            voiceResult={voiceResult}
            voiceError={voiceError}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onNext={handleCompleteOnboarding}
            onBack={() => setStep("setup-check")}
          />
        )}
      </div>
    </div>
  )
}

// Step indicator component
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${
            i < current ? "bg-primary" : i === current ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  )
}

// Welcome Step
function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-6">
        <span className="i-mingcute-mic-fill text-6xl text-primary"></span>
      </div>
      <h1 className="text-3xl font-extrabold mb-4">
        Welcome to VibeCodeManager!
      </h1>
      <p className="text-lg text-muted-foreground mb-4">
        Voice-driven orchestration of Claude Code agents.
      </p>
      <p className="text-muted-foreground mb-8">
        Speak commands, watch Claude Code execute, hear the results.
        <br />
        <span className="text-primary font-medium">Zero API keys needed</span> - just your Claude Pro subscription.
      </p>
      <div className="flex flex-col gap-3 items-center">
        <Button size="lg" onClick={onNext} className="w-64">
          Get Started
        </Button>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          Skip Setup
        </Button>
      </div>
    </div>
  )
}

// Setup Check Step - verifies local STT, TTS, and Claude Code agent
function SetupCheckStep({
  status,
  isLoading,
  onNext,
  onBack,
  onSkip,
}: {
  status: SetupStatus
  isLoading: boolean
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const allReady = status.hasLocalSTT && status.hasAgent

  return (
    <div>
      <StepIndicator current={1} total={2} />
      <h2 className="text-2xl font-bold mb-2 text-center">Checking Setup</h2>
      <p className="text-muted-foreground mb-6 text-center">
        Let's make sure everything is ready for voice commands.
      </p>

      <div className="space-y-4 mb-8">
        {/* Local STT */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            status.hasLocalSTT ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"
          }`}>
            {isLoading ? (
              <span className="i-mingcute-loading-line animate-spin" />
            ) : status.hasLocalSTT ? (
              <span className="i-mingcute-check-fill" />
            ) : (
              <span className="i-mingcute-close-fill" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium">Local Speech-to-Text</div>
            <div className="text-sm text-muted-foreground">
              {status.hasLocalSTT ? "FluidAudio ready" : "Build speakmcp-stt binary"}
            </div>
          </div>
        </div>

        {/* Local TTS */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            status.hasLocalTTS ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"
          }`}>
            {isLoading ? (
              <span className="i-mingcute-loading-line animate-spin" />
            ) : status.hasLocalTTS ? (
              <span className="i-mingcute-check-fill" />
            ) : (
              <span className="i-mingcute-information-line" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium">Local Text-to-Speech</div>
            <div className="text-sm text-muted-foreground">
              {status.hasLocalTTS ? "Kitten TTS ready" : "Optional - set up speakmcp-tts"}
            </div>
          </div>
        </div>

        {/* Claude Code Agent */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            status.hasAgent ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"
          }`}>
            {isLoading ? (
              <span className="i-mingcute-loading-line animate-spin" />
            ) : status.hasAgent ? (
              <span className="i-mingcute-check-fill" />
            ) : (
              <span className="i-mingcute-close-fill" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium">Claude Code Agent</div>
            <div className="text-sm text-muted-foreground">
              {status.hasAgent 
                ? `Connected: ${status.agentName}` 
                : "Add an ACP agent in Settings > Agents"}
            </div>
          </div>
        </div>
      </div>

      {!status.hasLocalSTT && (
        <div className="mb-6 p-4 rounded-lg bg-muted">
          <h3 className="font-medium mb-2">Build Local STT</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Run this command in the project directory:
          </p>
          <code className="block p-2 rounded bg-background text-sm font-mono">
            ./scripts/build-swift.sh
          </code>
        </div>
      )}

      {!status.hasAgent && (
        <div className="mb-6 p-4 rounded-lg bg-muted">
          <h3 className="font-medium mb-2">Install Claude Code ACP</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Install the Claude Code ACP adapter globally:
          </p>
          <code className="block p-2 rounded bg-background text-sm font-mono">
            npm install -g @anthropic-ai/claude-code-acp
          </code>
          <p className="text-sm text-muted-foreground mt-2">
            Then add it in Settings → Agents.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
          <Button onClick={onNext} disabled={!allReady}>
            {allReady ? "Continue" : "Waiting for setup..."}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Voice Test Step
function VoiceTestStep({
  isRecording,
  isTranscribing,
  voiceResult,
  voiceError,
  onStartRecording,
  onStopRecording,
  onNext,
  onBack,
}: {
  isRecording: boolean
  isTranscribing: boolean
  voiceResult: string | null
  voiceError: string | null
  onStartRecording: () => void
  onStopRecording: () => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div>
      <StepIndicator current={2} total={2} />
      <h2 className="text-2xl font-bold mb-2 text-center">Test Voice Commands</h2>
      <p className="text-muted-foreground mb-6 text-center">
        Try saying something like "What time is it?" or "Tell me a joke"
      </p>

      <div className="flex flex-col items-center gap-6 mb-8">
        {/* Recording button */}
        <button
          onMouseDown={onStartRecording}
          onMouseUp={onStopRecording}
          onMouseLeave={onStopRecording}
          onTouchStart={onStartRecording}
          onTouchEnd={onStopRecording}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? "bg-red-500 scale-110"
              : isTranscribing
              ? "bg-yellow-500"
              : "bg-primary hover:bg-primary/90"
          }`}
        >
          {isTranscribing ? (
            <span className="i-mingcute-loading-line text-4xl text-white animate-spin" />
          ) : (
            <span className="i-mingcute-mic-fill text-4xl text-white" />
          )}
        </button>

        <p className="text-sm text-muted-foreground">
          {isRecording
            ? "Listening... Release to send"
            : isTranscribing
            ? "Processing with Claude Code..."
            : "Hold to speak"}
        </p>

        {/* Result display */}
        {voiceResult && (
          <div className="w-full p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <pre className="text-sm whitespace-pre-wrap">{voiceResult}</pre>
          </div>
        )}

        {voiceError && (
          <div className="w-full p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-500">{voiceError}</p>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          {voiceResult ? "Complete Setup" : "Skip Test"}
        </Button>
      </div>
    </div>
  )
}
