// Compiled with the production helper, replacing only its application entry point.
func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}
let suite = "spine-menu-tests.\(UUID().uuidString)"
let defaults = UserDefaults(suiteName:suite)!
defer { defaults.removePersistentDomain(forName:suite) }
var systemLanguages = ["zh-Hans-CN", "en-US"]
let localization = MenuLocalization(defaults:defaults, preferredLanguages:{ systemLanguages })
expect(localization.preference == .english, "first launch defaults to English even on a Chinese system")
expect(localization.text("Ready") == "Ready", "English source text")
for (tag, language) in [("en", MenuLanguage.english), ("en-GB", .english), ("zh", .simplifiedChinese), ("zh_CN", .simplifiedChinese), ("zh-Hans-CN", .simplifiedChinese), ("zh-Hant-TW", .simplifiedChinese), ("ja-JP", .english), ("fr-FR", .english)] {
    expect(MenuLanguage.resolve(.system, preferredLanguages:[tag]) == language, "resolve \(tag)")
}
expect(MenuLanguage.resolve(.system, preferredLanguages:[]) == .english, "missing system locale falls back to English")
expect(MenuLanguage.resolve(.system, preferredLanguages:["fr-FR", "zh-CN"]) == .english, "unsupported primary language falls back to English")
localization.select(.system)
expect(localization.language == .simplifiedChinese, "follow system resolves immediately")
expect(localization.text("Ready") == "已就绪", "translate status")
systemLanguages = ["en-AU"]
expect(localization.refresh(), "system language change detected")
expect(localization.text("Ready") == "Ready", "system language refreshed")
localization.select(.simplifiedChinese)
systemLanguages = ["en-US"]
expect(!localization.refresh(), "manual preference overrides system")
let restored = MenuLocalization(defaults:UserDefaults(suiteName:suite)!, preferredLanguages:{ systemLanguages })
expect(restored.preference == .simplifiedChinese, "manual preference survives helper recreation")
restored.select(.system)
expect(MenuLocalization(defaults:defaults).preference == .system, "system preference is persisted as a mode")
defaults.set("invalid", forKey:MenuLocalization.preferenceKey)
expect(MenuLocalization(defaults:defaults).preference == .english, "invalid preference falls back safely")
expect(localization.text("untranslated diagnostic") == "untranslated diagnostic", "unknown strings stay intact")
let bar = StatusBar(languages:localization)
bar.state = ["appVersion":"test", "status":"Ready", "activeModeLabel":"Clone mode", "productVersion":"0.4.1", "baselineLabel":"Fork CLI baseline (version match)", "desktopStatus":"Desktop matches the App target version", "note":"Automatic fallback:", "fallbackReason":"socket timeout", "error":"raw diagnostic"]
expect(bar.statusText().contains("已就绪"), "status panel is localized")
expect(bar.statusText().contains("当前运行：副本模式"), "mode label is localized")
expect(bar.statusText().contains("fork 适配基线（按版本匹配）"), "baseline is localized")
expect(bar.statusText().contains("自动兜底： socket timeout"), "fallback prefix translated without rewriting diagnostic")
expect(bar.statusText().contains("raw diagnostic"), "errors preserved")
localization.select(.english)
expect(bar.statusText().contains("Current mode: Clone mode"), "existing state changes language without restarting session")
expect(!bar.statusText().contains("已就绪"), "old translation does not persist")
print("Native menu language checks passed")
