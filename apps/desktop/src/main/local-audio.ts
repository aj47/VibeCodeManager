/**
 * Local Audio Services - FluidAudio STT and Kitten TTS
 * Zero-API-key voice processing using local models
 */

import { spawn } from "child_process"
import { app } from "electron"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

/**
 * Get the path to a bundled binary resource
 */
function getBinaryPath(name: string): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(__dirname, "../../resources/bin", name)
  }
  return path.join(process.resourcesPath, "bin", name)
}

/**
 * Get the path to the Python venv
 */
function getTTSPythonPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(__dirname, "../../speakmcp-tts/.venv/bin/python")
  }
  // In production, we'll bundle the venv or use system python
  return path.join(process.resourcesPath, "speakmcp-tts/.venv/bin/python")
}

/**
 * Get the path to the TTS script
 */
function getTTSScriptPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(__dirname, "../../speakmcp-tts/tts.py")
  }
  return path.join(process.resourcesPath, "speakmcp-tts/tts.py")
}

interface LocalSTTResult {
  text: string
  durationMs: number
  success: boolean
  error?: string
}

interface LocalTTSResult {
  success: boolean
  output?: string
  error?: string
}

/**
 * Transcribe audio using local FluidAudio/Parakeet
 * @param audioBuffer - Audio data as ArrayBuffer (webm format)
 * @returns Transcription result
 */
export async function transcribeLocal(audioBuffer: ArrayBuffer): Promise<LocalSTTResult> {
  const tempDir = os.tmpdir()
  const tempWav = path.join(tempDir, `speakmcp-stt-${Date.now()}.wav`)
  const tempWebm = path.join(tempDir, `speakmcp-stt-${Date.now()}.webm`)

  try {
    // Write webm to temp file
    fs.writeFileSync(tempWebm, Buffer.from(audioBuffer))

    // Convert webm to wav using ffmpeg (required for FluidAudio)
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", tempWebm,
        "-ar", "16000",
        "-ac", "1",
        "-y",
        tempWav
      ], { stdio: ["pipe", "pipe", "pipe"] })

      ffmpeg.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg exited with code ${code}`))
      })
      ffmpeg.on("error", reject)
    })

    // Run local STT
    const sttBinary = getBinaryPath("speakmcp-stt")

    return new Promise((resolve) => {
      const stt = spawn(sttBinary, [tempWav])
      let stdout = ""
      let stderr = ""

      stt.stdout.on("data", (data) => { stdout += data.toString() })
      stt.stderr.on("data", (data) => { stderr += data.toString() })

      stt.on("close", (code) => {
        // Clean up temp files
        try { fs.unlinkSync(tempWebm) } catch {}
        try { fs.unlinkSync(tempWav) } catch {}

        if (code === 0 && stdout) {
          try {
            const result = JSON.parse(stdout) as LocalSTTResult
            resolve(result)
          } catch {
            resolve({ text: "", durationMs: 0, success: false, error: "Failed to parse STT output" })
          }
        } else {
          resolve({ text: "", durationMs: 0, success: false, error: stderr || `STT exited with code ${code}` })
        }
      })

      stt.on("error", (err) => {
        resolve({ text: "", durationMs: 0, success: false, error: err.message })
      })
    })

  } catch (error) {
    // Clean up temp files on error
    try { fs.unlinkSync(tempWebm) } catch {}
    try { fs.unlinkSync(tempWav) } catch {}

    return {
      text: "",
      durationMs: 0,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Generate speech using local Kitten TTS
 * @param text - Text to synthesize
 * @param voice - Voice ID (e.g., "expr-voice-2-f")
 * @returns Audio data as ArrayBuffer (WAV format, 24kHz)
 */
export async function synthesizeLocal(text: string, voice: string = "expr-voice-2-f"): Promise<ArrayBuffer> {
  const tempDir = os.tmpdir()
  const tempWav = path.join(tempDir, `speakmcp-tts-${Date.now()}.wav`)

  try {
    const pythonPath = getTTSPythonPath()
    const scriptPath = getTTSScriptPath()

    return new Promise((resolve, reject) => {
      const tts = spawn(pythonPath, [scriptPath, tempWav, "--voice", voice, "--text", text])
      let stdout = ""
      let stderr = ""

      tts.stdout.on("data", (data) => { stdout += data.toString() })
      tts.stderr.on("data", (data) => { stderr += data.toString() })

      tts.on("close", (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout) as LocalTTSResult
            if (result.success && fs.existsSync(tempWav)) {
              const audioData = fs.readFileSync(tempWav)
              fs.unlinkSync(tempWav)
              resolve(audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength))
            } else {
              reject(new Error(result.error || "TTS failed"))
            }
          } catch {
            reject(new Error("Failed to parse TTS output"))
          }
        } else {
          try { fs.unlinkSync(tempWav) } catch {}
          reject(new Error(stderr || `TTS exited with code ${code}`))
        }
      })

      tts.on("error", (err) => {
        try { fs.unlinkSync(tempWav) } catch {}
        reject(err)
      })
    })

  } catch (error) {
    try { fs.unlinkSync(tempWav) } catch {}
    throw error
  }
}

/**
 * Check if local STT is available
 */
export function isLocalSTTAvailable(): boolean {
  const sttBinary = getBinaryPath("speakmcp-stt")
  return fs.existsSync(sttBinary)
}

/**
 * Check if local TTS is available
 */
export function isLocalTTSAvailable(): boolean {
  const pythonPath = getTTSPythonPath()
  const scriptPath = getTTSScriptPath()
  return fs.existsSync(pythonPath) && fs.existsSync(scriptPath)
}
