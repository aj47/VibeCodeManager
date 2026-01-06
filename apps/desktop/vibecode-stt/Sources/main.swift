import Foundation
import FluidAudio

/// Output format for transcription results
struct TranscriptionResult: Codable {
    let text: String
    let durationMs: Int
    let success: Bool
    let error: String?
}

/// Print JSON result to stdout
func outputResult(_ result: TranscriptionResult) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

/// Print error and exit
func exitWithError(_ message: String) {
    let result = TranscriptionResult(text: "", durationMs: 0, success: false, error: message)
    outputResult(result)
    exit(1)
}

/// Main entry point
@main
struct VibecodeSTT {
    static func main() async {
        let args = CommandLine.arguments

        // Parse arguments
        guard args.count >= 2 else {
            exitWithError("Usage: vibecode-stt <audio-file> [--model v2|v3]")
            return
        }

        let audioPath = args[1]
        var modelVersion: AsrModelVersion = .v3

        // Check for model version flag
        if args.count >= 4 && args[2] == "--model" {
            if args[3] == "v2" {
                modelVersion = .v2
            }
        }

        // Verify audio file exists
        guard FileManager.default.fileExists(atPath: audioPath) else {
            exitWithError("Audio file not found: \(audioPath)")
            return
        }

        let startTime = Date()

        do {
            // Load models (this will cache after first load)
            let models = try await AsrModels.downloadAndLoad(version: modelVersion)
            let asrManager = AsrManager(config: .default)
            try await asrManager.initialize(models: models)

            // Convert and resample audio to 16kHz
            let audioURL = URL(fileURLWithPath: audioPath)
            let converter = AudioConverter()
            let samples = try converter.resampleAudioFile(audioURL)

            // Transcribe
            let transcription = try await asrManager.transcribe(samples)

            let durationMs = Int(Date().timeIntervalSince(startTime) * 1000)

            let result = TranscriptionResult(
                text: transcription.text,
                durationMs: durationMs,
                success: true,
                error: nil
            )
            outputResult(result)

        } catch {
            exitWithError("Transcription failed: \(error.localizedDescription)")
        }
    }
}
