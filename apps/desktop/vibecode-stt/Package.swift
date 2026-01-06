// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "vibecode-stt",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "vibecode-stt", targets: ["VibecodeSTT"])
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", from: "0.9.1")
    ],
    targets: [
        .executableTarget(
            name: "VibecodeSTT",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio")
            ],
            path: "Sources"
        )
    ]
)
