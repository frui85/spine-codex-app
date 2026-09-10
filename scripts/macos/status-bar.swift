import AppKit
import Foundation

// English is the source language and fallback for unsupported locales.
// This preference is independent of the launcher's startup-mode preferences.
enum MenuLanguage: String, CaseIterable {
    case english = "en"
    case simplifiedChinese = "zh-Hans"
    case system = "system"

    var nativeName: String {
        switch self {
        case .english: return "English"
        case .simplifiedChinese: return "简体中文"
        case .system: return "Follow System"
        }
    }

    static func resolve(_ preference: MenuLanguage, preferredLanguages: [String]) -> MenuLanguage {
        guard preference == .system else { return preference }
        // Match the primary system language, including region/script variants.
        let primary = (preferredLanguages.first ?? "en").replacingOccurrences(of:"_", with:"-").lowercased()
        if primary == "zh" || primary.hasPrefix("zh-") { return .simplifiedChinese }
        return .english
    }
}

final class MenuLocalization {
    static let preferenceKey = "menuLanguage"
    let defaults: UserDefaults
    let preferredLanguages: () -> [String]
    private(set) var preference: MenuLanguage
    private(set) var language: MenuLanguage = .english

    init(defaults: UserDefaults = UserDefaults(suiteName:"io.github.frui85.spine-status.preferences")!,
         preferredLanguages: @escaping () -> [String] = { Locale.preferredLanguages }) {
        self.defaults = defaults
        self.preferredLanguages = preferredLanguages
        preference = MenuLanguage(rawValue:defaults.string(forKey:Self.preferenceKey) ?? "") ?? .english
        refresh()
    }
    @discardableResult
    func refresh() -> Bool {
        let resolved = MenuLanguage.resolve(preference, preferredLanguages:preferredLanguages())
        let changed = resolved != language
        language = resolved
        return changed
    }
    func select(_ preference: MenuLanguage) {
        self.preference = preference
        defaults.set(preference.rawValue, forKey:Self.preferenceKey)
        refresh()
    }
    func text(_ source: String) -> String {
        language == .simplifiedChinese ? Self.chinese[source] ?? source : source
    }
    static let chinese: [String: String] = [
        "SpineCodex adaptation status": "SpineCodex 适配状态",
        "Connecting to launcher…": "正在连接启动器…",
        "Current mode: ": "当前运行：",
        "Not started": "尚未启动",
        "CLI baseline not checked yet": "适配基线尚未检测",
        "Waiting for compatibility check": "等待兼容检查",
        "Details: ": "详情：",
        "Switch mode and restart…": "切换模式并重启…",
        "View adaptation information…": "查看适配信息…",
        "Copy adaptation information": "复制适配信息",
        "View adaptation and release notes": "查看适配与发布说明",
        "Restart Desktop…": "重启 Desktop…",
        "Quit SpineCodex and Desktop…": "退出 SpineCodex 与 Desktop…",
        "Starting": "启动中",
        "Desktop will quit completely; active tasks may be interrupted. Session files will be preserved. External adapter mode does not provide the history recovery and SSH startup enhancements available in clone mode.": "Desktop 将完整退出；正在执行的任务可能中断。会话文件会保留。外部适配器模式不提供副本模式的历史恢复和 SSH 启动增强。",
        "Cancel": "取消",
        "Open mode menu": "打开模式切换菜单",
        "Restart Desktop?": "重新启动 Desktop？",
        "Restart": "重启",
        "Quit SpineCodex and Desktop?": "退出 SpineCodex 与 Desktop？",
        "Quit": "退出",
        "Switch and restart": "切换并重启",
        "Switch to “%@” and restart?": "切换为“%@”并重启？",
        "Follow System": "跟随系统",
        "Clone mode": "副本模式",
        "External adapter": "外部适配器",
        "Automatic fallback (clone first)": "自动兜底（优先副本）",
        "Automatic fallback": "自动兜底",
        "Unknown": "未知",
        "Official CLI baseline (version match)": "官方适配基线（按版本匹配）",
        "Fork CLI baseline (version match)": "fork 适配基线（按版本匹配）",
        "Current CLI combination has not been regression tested": "当前 CLI 组合尚未回归",
        "Desktop matches the App target version": "Desktop 与 App 目标版本匹配",
        "Desktop differs from this release target": "Desktop 非本次发布目标版本",
        "History recovery and SSH enhancements: clone mode only": "历史恢复与 SSH 增强：仅副本模式提供",
        "History recovery and SSH enhancements: enabled": "历史恢复与 SSH 增强：已启用",
        "Automatic fallback:": "自动兜底：",
        "Starting Desktop…": "正在启动 Desktop…",
        "Renderer connected": "Renderer 已连接",
        "Reconnecting Renderer…": "正在恢复 Renderer 连接…",
        "Clone startup failed; trying external adapter…": "副本启动失败，尝试外部适配器…",
        "Checking compatibility…": "检查兼容性…",
        "Restarting Desktop…": "正在重启 Desktop…",
        "Starting…": "正在启动…",
        "Switch failed; restoring previous mode…": "切换失败，正在恢复原模式…",
        "Ready": "已就绪",
        "Operation incomplete; current instance still running": "操作未完成，当前实例仍运行",
        "Startup failed": "启动失败",
        "Quitting Desktop…": "正在退出 Desktop…",
    ]
}

func output(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
}
func desktop(_ pid: Int32, _ path: String) -> NSRunningApplication? {
    guard let app = NSRunningApplication(processIdentifier: pid),
          app.bundleURL?.standardizedFileURL.path == URL(fileURLWithPath: path).standardizedFileURL.path else { return nil }
    return app
}
if CommandLine.arguments.count == 4 && CommandLine.arguments[1] == "--terminate" {
    guard let pid = Int32(CommandLine.arguments[2]), let app = desktop(pid, CommandLine.arguments[3]) else { exit(2) }
    exit(app.terminate() ? 0 : 3)
}

// Same 20×20 paths as SPINE_LOGO_MARKUP in renderer/00-runtime.jsfrag.
// A template image lets macOS choose its menu-bar foreground in either theme.
func spineStatusImage() -> NSImage {
    let image = NSImage(size:NSSize(width:18, height:18), flipped:true) { _ in
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        let transform = NSAffineTransform()
        transform.scaleX(by:0.9, yBy:0.9)
        transform.concat()
        NSColor.black.setStroke()
        for center in [NSPoint(x:4,y:4.5), NSPoint(x:10,y:3.25), NSPoint(x:16,y:4.5)] {
            let circle = NSBezierPath(ovalIn:NSRect(x:center.x-1.15,y:center.y-1.15,width:2.3,height:2.3))
            circle.lineWidth = 1.3
            circle.stroke()
        }
        let branches = NSBezierPath()
        branches.lineWidth = 1.35
        branches.lineCapStyle = .round
        branches.lineJoinStyle = .round
        branches.move(to:NSPoint(x:4.9,y:5.2))
        branches.curve(to:NSPoint(x:10,y:10.6),controlPoint1:NSPoint(x:4.9,y:8.1),controlPoint2:NSPoint(x:7.2,y:9.2))
        branches.move(to:NSPoint(x:10,y:4.4))
        branches.line(to:NSPoint(x:10,y:10.6))
        branches.move(to:NSPoint(x:15.1,y:5.2))
        branches.curve(to:NSPoint(x:10,y:10.6),controlPoint1:NSPoint(x:15.1,y:8.1),controlPoint2:NSPoint(x:12.8,y:9.2))
        branches.move(to:NSPoint(x:10,y:10.6))
        branches.line(to:NSPoint(x:10,y:13))
        branches.stroke()
        let memory = NSBezierPath(roundedRect:NSRect(x:6.75,y:13,width:6.5,height:3.75),xRadius:1.6,yRadius:1.6)
        memory.lineWidth = 1.35
        memory.stroke()
        let slot = NSBezierPath()
        slot.lineWidth = 1.25
        slot.lineCapStyle = .round
        slot.move(to:NSPoint(x:8.75,y:14.9))
        slot.line(to:NSPoint(x:11.25,y:14.9))
        slot.stroke()
        return true
    }
    image.isTemplate = true
    image.accessibilityDescription = "SpineCodex"
    return image
}

final class StatusBar: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var item: NSStatusItem!
    var state: [String: Any] = [:]
    var buffer = Data()
    var panel: NSWindow?
    var panelText: NSTextField?
    var panelButton: NSButton?
    let languages: MenuLocalization
    let modes = [("clone", "Clone mode"), ("adapter", "External adapter"), ("auto", "Automatic fallback (clone first)")]
    init(languages: MenuLocalization = MenuLocalization()) {
        self.languages = languages
        super.init()
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = spineStatusImage()
        if item.button?.image == nil { item.button?.title = "S" }
        item.button?.image?.isTemplate = true
        item.button?.setAccessibilityLabel(localized("SpineCodex adaptation status"))
        NotificationCenter.default.addObserver(self, selector:#selector(systemLanguageChanged), name:NSLocale.currentLocaleDidChangeNotification, object:nil)
        render()
        FileHandle.standardInput.readabilityHandler = { handle in
            let data = handle.availableData
            DispatchQueue.main.async {
                if data.isEmpty { NSApp.terminate(nil); return }
                self.buffer.append(data)
                while let range = self.buffer.firstRange(of: Data([10])) {
                    let line = self.buffer.subdata(in: 0..<range.lowerBound)
                    self.buffer.removeSubrange(0..<range.upperBound)
                    if let value = try? JSONSerialization.jsonObject(with: line) as? [String: Any] {
                        self.state = value
                        self.render()
                    }
                }
            }
        }
        output(["action":"ready"])
        if CommandLine.arguments.contains("--preview") { showStatus() }
    }
    func localized(_ source: String) -> String { languages.text(source) }
    func text(_ key: String, _ fallback: String = "—") -> String { state[key] as? String ?? fallback }
    func display(_ key: String, _ fallback: String = "—") -> String {
        let value = text(key, fallback)
        // Errors and version identifiers are diagnostic data, not catalog keys.
        return ["status", "activeModeLabel", "baselineLabel", "desktopStatus", "note", "productVersion"].contains(key) ? localized(value) : value
    }
    func noteText() -> String {
        [display("note", ""), text("fallbackReason", "")].filter { !$0.isEmpty }.joined(separator:" ")
    }
    @objc func systemLanguageChanged() {
        if languages.preference == .system { render() }
    }
    func menuWillOpen(_ menu: NSMenu) {
        // Re-read preferred languages on every opening as well as locale notifications.
        if languages.refresh() { render() }
    }
    @objc func changeLanguage(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String, let preference = MenuLanguage(rawValue:id) else { return }
        languages.select(preference)
        render()
    }
    func row(_ title: String, _ menu: NSMenu) {
        let item = NSMenuItem(title:title, action:nil, keyEquivalent:"")
        item.isEnabled = false
        menu.addItem(item)
    }
    @discardableResult
    func action(_ title: String, _ selector: Selector, _ menu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title:title, action:selector, keyEquivalent:"")
        item.target = self
        menu.addItem(item)
        return item
    }
    func render() {
        languages.refresh()
        let menu = item.menu ?? NSMenu()
        menu.removeAllItems()
        menu.delegate = self
        menu.autoenablesItems = false
        row("SpineCodex App " + text("appVersion"), menu)
        row(display("status", localized("Connecting to launcher…")), menu)
        row(localized("Current mode: ") + display("activeModeLabel", localized("Not started")), menu)
        menu.addItem(.separator())
        row("Desktop " + text("desktopVersion"), menu)
        row("SpineCodex " + display("productVersion") + " → CLI " + text("compatibilityVersion"), menu)
        row(display("baselineLabel", localized("CLI baseline not checked yet")), menu)
        row(display("desktopStatus", localized("Waiting for compatibility check")), menu)
        if !noteText().isEmpty { row(noteText(), menu) }
        if let error = state["error"] as? String, !error.isEmpty {
            let errorItem = NSMenuItem(title:localized("Details: ") + String(error.prefix(62)), action:nil, keyEquivalent:"")
            errorItem.toolTip = error; errorItem.isEnabled = false; menu.addItem(errorItem)
        }
        menu.addItem(.separator())
        let modesItem = NSMenuItem(title:localized("Switch mode and restart…"), action:nil, keyEquivalent:"")
        let choices = NSMenu(); choices.autoenablesItems = false
        for (id, label) in modes {
            let choice = action(localized(label), #selector(changeMode(_:)), choices)
            choice.representedObject = id
            choice.state = text("requestedMode") == id ? .on : .off
            choice.isEnabled = state["busy"] as? Bool != true
        }
        modesItem.submenu = choices; menu.addItem(modesItem)
        let languageItem = NSMenuItem(title:"Language / 语言", action:nil, keyEquivalent:"")
        let languageMenu = NSMenu(); languageMenu.autoenablesItems = false
        for preference in MenuLanguage.allCases {
            let label = preference == .system ? localized("Follow System") : preference.nativeName
            let choice = action(label, #selector(changeLanguage(_:)), languageMenu)
            choice.representedObject = preference.rawValue
            choice.state = languages.preference == preference ? .on : .off
        }
        languageItem.submenu = languageMenu; menu.addItem(languageItem)
        action(localized("View adaptation information…"), #selector(showStatus), menu)
        action(localized("Copy adaptation information"), #selector(copyInfo), menu)
        action(localized("View adaptation and release notes"), #selector(openDocs), menu)
        let restart = action(localized("Restart Desktop…"), #selector(restartDesktop), menu)
        restart.isEnabled = state["busy"] as? Bool != true
        menu.addItem(.separator())
        let quit = action(localized("Quit SpineCodex and Desktop…"), #selector(quitAll), menu)
        quit.isEnabled = state["busy"] as? Bool != true
        panelText?.stringValue = statusText()
        panel?.title = localized("SpineCodex adaptation status")
        panelButton?.title = localized("Open mode menu")
        item.button?.setAccessibilityLabel(localized("SpineCodex adaptation status"))
        item.button?.image?.accessibilityDescription = localized("SpineCodex adaptation status")
        item.menu = menu
        item.button?.toolTip = "SpineCodex · " + display("activeModeLabel", localized("Starting")) + " · " + display("status")
    }
    func confirm(_ title: String, _ button: String, completion: @escaping () -> Void) {
        showStatus()
        let alert = NSAlert(); alert.messageText = title
        alert.informativeText = localized("Desktop will quit completely; active tasks may be interrupted. Session files will be preserved. External adapter mode does not provide the history recovery and SSH startup enhancements available in clone mode.")
        alert.addButton(withTitle:button); alert.addButton(withTitle:localized("Cancel"))
        alert.beginSheetModal(for:panel!) { response in
            if response == .alertFirstButtonReturn { completion() }
        }
    }
    func statusText() -> String {
        return ["SpineCodex App " + text("appVersion"), display("status"),
                localized("Current mode: ") + display("activeModeLabel", localized("Not started")),
                "Desktop " + text("desktopVersion"),
                "SpineCodex " + display("productVersion") + " → Codex CLI " + text("compatibilityVersion"),
                display("baselineLabel"), display("desktopStatus"), noteText(), text("error", "")].filter { !$0.isEmpty }.joined(separator: "\n\n")
    }
    @objc func showStatus() {
        if panel == nil {
            let window = NSWindow(contentRect:NSRect(x:0,y:0,width:480,height:370), styleMask:[.titled,.closable], backing:.buffered, defer:false)
            window.title = localized("SpineCodex adaptation status")
            window.isReleasedWhenClosed = false
            let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18
            stack.translatesAutoresizingMaskIntoConstraints = false
            let label = NSTextField(wrappingLabelWithString:statusText()); label.font = .systemFont(ofSize:13)
            label.isSelectable = true
            panelText = label; stack.addArrangedSubview(label)
            let button = NSButton(title:localized("Open mode menu"), target:self, action:#selector(showMenu))
            panelButton = button
            button.bezelStyle = .rounded; stack.addArrangedSubview(button)
            window.contentView?.addSubview(stack)
            NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor,constant:-24),stack.topAnchor.constraint(equalTo:window.contentView!.topAnchor,constant:24),stack.bottomAnchor.constraint(lessThanOrEqualTo:window.contentView!.bottomAnchor,constant:-24)])
            panel = window
        }
        panelText?.stringValue = statusText(); panel?.center(); panel?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps:true)
    }
    @objc func showMenu() { item.button?.performClick(nil) }
    @objc func changeMode(_ sender: NSMenuItem) {
        guard let mode = sender.representedObject as? String, mode != text("requestedMode") else { return }
        confirm(String(format:localized("Switch to “%@” and restart?"), sender.title), localized("Switch and restart")) { output(["action":"switch", "mode":mode]) }
    }
    @objc func restartDesktop() { confirm(localized("Restart Desktop?"), localized("Restart")) { output(["action":"restart"]) } }
    @objc func quitAll() { confirm(localized("Quit SpineCodex and Desktop?"), localized("Quit")) { output(["action":"quit"]) } }
    @objc func copyInfo() {
        let keys = ["appVersion","status","requestedMode","activeModeLabel","desktopVersion","productVersion","compatibilityVersion","baselineLabel","desktopStatus","note","error"]
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(keys.map { "\($0): \($0 == "note" ? noteText() : display($0))" }.joined(separator:"\n"), forType:.string)
    }
    @objc func openDocs() { NSWorkspace.shared.open(URL(string:"https://github.com/frui85/spine-codex-app#readme")!) }
}
let delegate = StatusBar()
NSApplication.shared.delegate = delegate
NSApplication.shared.run()
