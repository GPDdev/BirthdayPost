import UIKit
import WebKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?
    private let page = PostalController()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = page
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        page.evaluate("if (typeof Postal !== 'undefined') Postal.resume().catch(()=>{})")
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler done: @escaping () -> Void) {
        DispatchQueue.main.async { self.page.evaluate("if (typeof Postal !== 'undefined') Postal.openToday()"); done() }
    }
}

private struct BirthdayGroup: Decodable {
    let month: Int
    let day: Int
    let names: [String]
}
private struct BirthdayDay: Decodable {
    let date: String
    let names: [String]
}
private struct Plan: Decodable {
    let annual: [BirthdayGroup]
    let dates: [BirthdayDay]
}
private enum PostalError: LocalizedError {
    case invalid
    var errorDescription: String? { "资料格式无效，请重新导入。" }
}

final class PostalController: UIViewController, WKScriptMessageHandlerWithReply, WKNavigationDelegate {
    private var web: WKWebView!
    private let center = UNUserNotificationCenter.current()
    private var previous: Task<Void, Never>?

    override func viewDidLoad() {
        super.viewDidLoad()
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "postal")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        view.backgroundColor = UIColor(red: 0.98, green: 0.97, blue: 0.94, alpha: 1)
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(web)
        web.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        if let page = Bundle.main.url(forResource: "post", withExtension: "html") {
            web.loadFileURL(page, allowingReadAccessTo: page)
        }
    }
    func evaluate(_ script: String) {
        guard isViewLoaded else { return }
        web.evaluateJavaScript(script, completionHandler: nil)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let local = Bundle.main.url(forResource: "post", withExtension: "html")?.standardizedFileURL
        decisionHandler(action.request.url?.standardizedFileURL == local ? .allow : .cancel)
    }
    private func stateURL() throws -> URL {
        let dir = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true)
        return dir.appendingPathComponent("book.json")
    }
    private func status() async -> String {
        switch await center.notificationSettings().authorizationStatus {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }
    private func notification(_ id: String, title: String, body: String,
                              components: DateComponents, repeats: Bool) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "birthdaypost"
        return UNNotificationRequest(identifier: "birthdaypost." + id, content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: repeats))
    }
    private func sync(state: [String: Any], raw: Any) async throws -> String {
        let plan = try JSONDecoder().decode(Plan.self, from: JSONSerialization.data(withJSONObject: raw))
        let clock = (state["time"] as? String ?? "").split(separator: ":").compactMap { Int($0) }
        guard clock.count == 2 else { throw PostalError.invalid }
        let old = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix("birthdaypost.") }
        let enabled = state["enabled"] as? Bool ?? false
        if !enabled {
            center.removePendingNotificationRequests(withIdentifiers: old.map(\.identifier))
            return ""
        }
        guard await status() == "granted" else { return "请在系统设置中允许通知，然后返回应用。" }
        var wanted: [UNNotificationRequest] = []
        let gregorian = Calendar(identifier: .gregorian)
        func build(_ names: [String], _ id: String, _ components: DateComponents, repeatYearly: Bool) {
            let body = String(names.joined(separator: "、").prefix(230)) + "，点此写生日祝福。"
            wanted.append(notification(id, title: "今天有 \(names.count) 位好友过生日", body: body,
                                       components: components, repeats: repeatYearly))
        }
        for g in plan.annual {
            let parts = DateComponents(calendar: gregorian, month: g.month, day: g.day, hour: clock[0], minute: clock[1])
            build(g.names, "annual-\(g.month)-\(g.day)", parts, repeatYearly: true)
        }
        for day in plan.dates {
            let numbers = day.date.split(separator: "-").compactMap { Int($0) }
            guard numbers.count == 3 else { throw PostalError.invalid }
            let parts = DateComponents(calendar: gregorian, year: numbers[0], month: numbers[1], day: numbers[2],
                                       hour: clock[0], minute: clock[1])
            build(day.names, day.date, parts, repeatYearly: false)
        }
        let last = plan.dates.last?.date
        if let last = last {
            let parts = last.split(separator: "-").compactMap { Int($0) }
            if parts.count == 3, let end = gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)),
               let refill = gregorian.date(byAdding: .day, value: -1, to: end), refill > Date() {
                var comps = gregorian.dateComponents([.year,.month,.day,.hour,.minute], from: refill)
                comps.calendar = gregorian
                wanted.append(notification("refill", title: "续排生日提醒", body: "点此打开生辰邮局，继续安排后续生日。",
                                           components: comps, repeats: false))
            }
        }
        let ids = Set(wanted.map(\.identifier))
        center.removePendingNotificationRequests(withIdentifiers: old.filter { !ids.contains($0.identifier) }.map(\.identifier))
        for entry in wanted { try await center.add(entry) }
        return last.map { "生日提醒已排到 \($0)，打开应用会自动续排。" } ?? ""
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, let obj = message.body as? [String: Any], let op = obj["op"] as? String
        else { replyHandler(nil, "无效操作"); return }
        let earlier = previous
        previous = Task { @MainActor in
            await earlier?.value
            do {
                let payload = obj["payload"]
                switch op {
                case "load":
                    let url = try stateURL()
                    let state = FileManager.default.fileExists(atPath: url.path) ? try String(contentsOf: url, encoding: .utf8) : ""
                    replyHandler(state, nil)
                case "save", "sync":
                    guard let bag = payload as? [String: Any], let state = bag["state"] as? [String: Any] else { throw PostalError.invalid }
                    if op == "save" {
                        let data = try JSONSerialization.data(withJSONObject: state)
                        try data.write(to: stateURL(), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    }
                    var label = ""
                    if let plan = bag["plan"] {
                        do { label = try await sync(state: state, raw: plan) }
                        catch { label = "资料已保存，提醒需要重新安排。请检查通知权限后重新保存提醒时间。" }
                    }
                    replyHandler(label, nil)
                case "status": replyHandler(await status(), nil)
                case "request":
                    let granted = try await center.requestAuthorization(options: [.alert,.sound])
                    replyHandler(granted ? "granted" : "denied", nil)
                case "settings":
                    if let url = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(url) }
                    replyHandler(true, nil)
                case "copy":
                    guard let text = payload as? String else { throw PostalError.invalid }
                    UIPasteboard.general.string = text
                    replyHandler(true, nil)
                default: throw PostalError.invalid
                }
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }
}
