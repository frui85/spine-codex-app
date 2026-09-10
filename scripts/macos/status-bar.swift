import AppKit
import Foundation

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
    image.accessibilityDescription = "SpineCodex 适配状态"
    return image
}

final class StatusBar: NSObject, NSApplicationDelegate {
    var item: NSStatusItem!
    var state: [String: Any] = [:]
    var buffer = Data()
    var panel: NSWindow?
    var panelText: NSTextField?
    let modes = [("clone", "副本模式"), ("adapter", "外部适配器"), ("auto", "自动兜底（优先副本）")]
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = spineStatusImage()
        if item.button?.image == nil { item.button?.title = "S" }
        item.button?.image?.isTemplate = true
        item.button?.setAccessibilityLabel("SpineCodex 适配状态")
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
    func text(_ key: String, _ fallback: String = "—") -> String { state[key] as? String ?? fallback }
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
        let menu = NSMenu()
        menu.autoenablesItems = false
        row("SpineCodex App " + text("appVersion"), menu)
        row(text("status", "正在连接启动器…"), menu)
        row("当前运行：" + text("activeModeLabel", "尚未启动"), menu)
        menu.addItem(.separator())
        row("Desktop " + text("desktopVersion"), menu)
        row("SpineCodex " + text("productVersion") + " → CLI " + text("compatibilityVersion"), menu)
        row(text("baselineLabel", "适配基线尚未检测"), menu)
        row(text("desktopStatus", "等待兼容检查"), menu)
        if let note = state["note"] as? String, !note.isEmpty { row(note, menu) }
        if let error = state["error"] as? String, !error.isEmpty {
            let errorItem = NSMenuItem(title:"详情：" + String(error.prefix(62)), action:nil, keyEquivalent:"")
            errorItem.toolTip = error; errorItem.isEnabled = false; menu.addItem(errorItem)
        }
        menu.addItem(.separator())
        let modesItem = NSMenuItem(title:"切换模式并重启…", action:nil, keyEquivalent:"")
        let choices = NSMenu(); choices.autoenablesItems = false
        for (id, label) in modes {
            let choice = action(label, #selector(changeMode(_:)), choices)
            choice.representedObject = id
            choice.state = text("requestedMode") == id ? .on : .off
            choice.isEnabled = state["busy"] as? Bool != true
        }
        modesItem.submenu = choices; menu.addItem(modesItem)
        action("查看适配信息…", #selector(showStatus), menu)
        action("复制适配信息", #selector(copyInfo), menu)
        action("查看适配与发布说明", #selector(openDocs), menu)
        let restart = action("重启 Desktop…", #selector(restartDesktop), menu)
        restart.isEnabled = state["busy"] as? Bool != true
        menu.addItem(.separator())
        let quit = action("退出 SpineCodex 与 Desktop…", #selector(quitAll), menu)
        quit.isEnabled = state["busy"] as? Bool != true
        panelText?.stringValue = statusText()
        item.menu = menu
        item.button?.toolTip = "SpineCodex · " + text("activeModeLabel", "启动中") + " · " + text("status")
    }
    func confirm(_ title: String, _ button: String, completion: @escaping () -> Void) {
        showStatus()
        let alert = NSAlert(); alert.messageText = title
        alert.informativeText = "Desktop 将完整退出；正在执行的任务可能中断。会话文件会保留。外部适配器模式不提供副本模式的历史恢复和 SSH 启动增强。"
        alert.addButton(withTitle:button); alert.addButton(withTitle:"取消")
        alert.beginSheetModal(for:panel!) { response in
            if response == .alertFirstButtonReturn { completion() }
        }
    }
    func statusText() -> String {
        return ["SpineCodex App " + text("appVersion"), text("status"),
                "当前运行：" + text("activeModeLabel", "尚未启动"),
                "Desktop " + text("desktopVersion"),
                "SpineCodex " + text("productVersion") + " → Codex CLI " + text("compatibilityVersion"),
                text("baselineLabel"), text("desktopStatus"), text("note", ""), text("error", "")].filter { !$0.isEmpty }.joined(separator: "\n\n")
    }
    @objc func showStatus() {
        if panel == nil {
            let window = NSWindow(contentRect:NSRect(x:0,y:0,width:480,height:370), styleMask:[.titled,.closable], backing:.buffered, defer:false)
            window.title = "SpineCodex 适配状态"
            window.isReleasedWhenClosed = false
            let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18
            stack.translatesAutoresizingMaskIntoConstraints = false
            let label = NSTextField(wrappingLabelWithString:statusText()); label.font = .systemFont(ofSize:13)
            label.isSelectable = true
            panelText = label; stack.addArrangedSubview(label)
            let button = NSButton(title:"打开模式切换菜单", target:self, action:#selector(showMenu))
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
        confirm("切换为“\(sender.title)”并重启？", "切换并重启") { output(["action":"switch", "mode":mode]) }
    }
    @objc func restartDesktop() { confirm("重新启动 Desktop？", "重启") { output(["action":"restart"]) } }
    @objc func quitAll() { confirm("退出 SpineCodex 与 Desktop？", "退出") { output(["action":"quit"]) } }
    @objc func copyInfo() {
        let keys = ["appVersion","status","requestedMode","activeModeLabel","desktopVersion","productVersion","compatibilityVersion","baselineLabel","desktopStatus","note","error"]
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(keys.map { "\($0): \(text($0))" }.joined(separator:"\n"), forType:.string)
    }
    @objc func openDocs() { NSWorkspace.shared.open(URL(string:"https://github.com/frui85/spine-codex-app#readme")!) }
}
let delegate = StatusBar()
NSApplication.shared.delegate = delegate
NSApplication.shared.run()
