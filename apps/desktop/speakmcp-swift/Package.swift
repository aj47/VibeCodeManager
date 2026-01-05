// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "speakmcp-stt",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "speakmcp-stt", targets: ["SpeakMCPSTT"])
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", from: "0.9.1")
    ],
    targets: [
        .executableTarget(
            name: "SpeakMCPSTT",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio")
            ],
            path: "Sources"
        )
    ]
)
