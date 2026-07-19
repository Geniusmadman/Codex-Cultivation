import AppKit
import Foundation

final class CultivationMenuDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let controller: String

    init(controller: String) {
        self.controller = controller
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Codex Cultivation")
        statusItem.button?.toolTip = "Codex Cultivation"
        rebuildMenu()
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let menuItem = NSMenuItem(title: title, action: action, keyEquivalent: "")
        menuItem.target = self
        return menuItem
    }

    private func rebuildMenu() {
        let menu = NSMenu()
        let title = NSMenuItem(title: "Codex Cultivation", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())
        menu.addItem(item("应用或重新应用", #selector(startCultivation)))
        menu.addItem(item("暂停皮肤", #selector(pauseCultivation)))
        menu.addItem(item("继续显示皮肤", #selector(resumeCultivation)))
        menu.addItem(item("更换背景图...", #selector(selectImage)))
        menu.addItem(item("验证并保存截图", #selector(verifyCultivation)))
        menu.addItem(.separator())
        menu.addItem(item("完全恢复 Codex", #selector(restoreCultivation)))
        menu.addItem(item("退出菜单栏", #selector(quitMenu)))
        statusItem.menu = menu
    }

    private func run(_ arguments: [String], completion: ((Int32, String) -> Void)? = nil) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", controller] + arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do {
            try process.run()
            DispatchQueue.global().async {
                process.waitUntilExit()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                DispatchQueue.main.async {
                    completion?(process.terminationStatus, output)
                    if process.terminationStatus != 0 { self.showError(output) }
                }
            }
        } catch {
            showError(error.localizedDescription)
        }
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Codex Cultivation"
        alert.informativeText = message.trimmingCharacters(in: .whitespacesAndNewlines)
        alert.alertStyle = .warning
        alert.runModal()
    }

    @objc private func startCultivation() { run(["start", "--prompt-restart"]) }
    @objc private func pauseCultivation() { run(["pause"]) }
    @objc private func resumeCultivation() { run(["resume"]) }

    @objc private func selectImage() {
        let panel = NSOpenPanel()
        panel.title = "选择 Codex Cultivation 背景图"
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let path = panel.url?.path {
            run(["set-image", "--image", path])
        }
    }

    @objc private func verifyCultivation() {
        let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first!
        let screenshot = desktop.appendingPathComponent("codex-cultivation-check.png").path
        run(["verify", "--screenshot", screenshot]) { status, _ in
            if status == 0 { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: screenshot)]) }
        }
    }

    @objc private func restoreCultivation() { run(["restore", "--prompt-restart"]) }
    @objc private func quitMenu() { NSApplication.shared.terminate(nil) }
}

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: menubar-codex-cultivation.swift <controller-path>\n", stderr)
    exit(2)
}

let app = NSApplication.shared
let delegate = CultivationMenuDelegate(controller: CommandLine.arguments[1])
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
