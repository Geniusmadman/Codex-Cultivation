import AppKit
import Foundation

final class CultivationMenuDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private let controller: String
    private let menu = NSMenu()
    private var syncingSpiritPet = false

    private enum SpiritPetStatus {
        case disabled
        case notInstalled
        case installed(realm: String, pendingReload: Bool)
        case invalid
    }

    init(controller: String) {
        self.controller = controller
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Codex Cultivation")
        statusItem.button?.toolTip = "Codex Cultivation"
        menu.delegate = self
        statusItem.menu = menu
        rebuildMenu()
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let menuItem = NSMenuItem(title: title, action: action, keyEquivalent: "")
        menuItem.target = self
        return menuItem
    }

    private func rebuildMenu() {
        menu.removeAllItems()
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
        let petStatus = spiritPetStatus()
        let petStatusItem = NSMenuItem(title: spiritPetStatusTitle(petStatus), action: nil, keyEquivalent: "")
        petStatusItem.isEnabled = false
        menu.addItem(petStatusItem)
        let syncItem = item(syncingSpiritPet ? "正在同步银月境界..." : "同步银月境界", #selector(syncSpiritPet))
        syncItem.isEnabled = !syncingSpiritPet
        menu.addItem(syncItem)
        if case .installed(_, let pendingReload) = petStatus, pendingReload {
            menu.addItem(item("重启 Codex 应用灵宠进阶", #selector(restartForSpiritPet)))
        }
        menu.addItem(.separator())
        menu.addItem(item("完全恢复 Codex", #selector(restoreCultivation)))
        menu.addItem(item("退出菜单栏", #selector(quitMenu)))
    }

    func menuWillOpen(_ menu: NSMenu) {
        rebuildMenu()
    }

    private func spiritPetStatus() -> SpiritPetStatus {
        let stateRoot = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/CodexCultivation", isDirectory: true)
        let disabledPath = stateRoot.appendingPathComponent("spirit-pet-disabled").path
        if FileManager.default.fileExists(atPath: disabledPath) {
            return .disabled
        }

        let statePath = stateRoot.appendingPathComponent("pet-state.json").path
        guard FileManager.default.fileExists(atPath: statePath) else {
            return .notInstalled
        }
        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: statePath))
            guard let state = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  state["managedBy"] as? String == "CodexCultivation",
                  state["petId"] as? String == "yinyue",
                  let realm = state["activeRealm"] as? String else {
                return .invalid
            }
            return .installed(realm: realm, pendingReload: state["pendingReload"] as? Bool ?? false)
        } catch {
            return .invalid
        }
    }

    private func spiritPetStatusTitle(_ status: SpiritPetStatus) -> String {
        switch status {
        case .disabled:
            return "灵宠：已禁用"
        case .notInstalled:
            return "灵宠：银月未安装"
        case .installed(let realm, _):
            let realmNames = [
                "qi": "炼气",
                "foundation": "筑基",
                "golden-core": "金丹",
                "nascent-soul": "元婴",
                "transformation": "化神",
            ]
            return "灵宠：银月 · \(realmNames[realm] ?? realm)"
        case .invalid:
            return "灵宠：银月状态异常"
        }
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

    @objc private func startCultivation() {
        run(["start", "--prompt-restart"]) { status, _ in
            if status == 0 { self.rebuildMenu() }
        }
    }
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

    @objc private func syncSpiritPet() {
        guard !syncingSpiritPet else { return }
        syncingSpiritPet = true
        rebuildMenu()
        run(["sync-pet"]) { _, _ in
            self.syncingSpiritPet = false
            self.rebuildMenu()
        }
    }

    @objc private func restartForSpiritPet() {
        let alert = NSAlert()
        alert.messageText = "重启 Codex 应用灵宠进阶？"
        alert.informativeText = "Codex 将关闭并重新打开。请先保存正在进行的工作。"
        alert.alertStyle = .warning
        alert.addButton(withTitle: "重新启动")
        alert.addButton(withTitle: "取消")
        NSApplication.shared.activate(ignoringOtherApps: true)
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        run(["start", "--restart-for-spirit-pet", "--restart-existing"]) { status, _ in
            if status == 0 { self.rebuildMenu() }
        }
    }

    @objc private func restoreCultivation() {
        run(["restore", "--prompt-restart"]) { status, _ in
            if status == 0 { self.rebuildMenu() }
        }
    }
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
