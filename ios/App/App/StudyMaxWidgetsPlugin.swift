import Foundation
import UIKit
import Capacitor
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/**
 The native half of StudyMaxWidgets: hands the snapshot JSON to the widget
 extension through the App Group, and starts / ends the Deadline watch Live
 Activity. Registered in MainViewController.capacitorDidLoad().
 */
@objc(StudyMaxWidgetsPlugin)
public class StudyMaxWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "StudyMaxWidgetsPlugin"
  public let jsName = "StudyMaxWidgets"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "startDeadlineWatch", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stopDeadlineWatch", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDeadlineWatch", returnType: CAPPluginReturnPromise),
  ]

  static let appGroup = "group.ai.calendue.studymax"
  static let snapshotKey = "studymax.snapshot"
  /// ActivityKit ends an activity after 8 hours; the watch goes stale no later than that.
  static let maxActivityLife: TimeInterval = 8 * 60 * 60

  override public func load() {
    NotificationCenter.default.addObserver(
      self, selector: #selector(appDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification, object: nil)
  }

  deinit { NotificationCenter.default.removeObserver(self) }

  @objc private func appDidBecomeActive() {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      Task { await Self.refreshWatch() }
    }
    #endif
  }

  // MARK: Snapshot

  @objc func save(_ call: CAPPluginCall) {
    guard let snapshot = call.getString("snapshot") else {
      call.reject("snapshot must be a JSON string")
      return
    }
    guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
      call.reject("App Group \(Self.appGroup) is unavailable")
      return
    }
    defaults.set(snapshot, forKey: Self.snapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
    call.resolve()
  }

  @objc func clear(_ call: CAPPluginCall) {
    UserDefaults(suiteName: Self.appGroup)?.removeObject(forKey: Self.snapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      Task {
        await Self.endAll()
        call.resolve()
      }
      return
    }
    #endif
    call.resolve()
  }

  // MARK: Deadline watch

  @objc func startDeadlineWatch(_ call: CAPPluginCall) {
    #if canImport(ActivityKit)
    guard #available(iOS 16.2, *) else {
      call.resolve(["started": false, "reason": "unsupported"])
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      call.resolve(["started": false, "reason": "disabled"])
      return
    }
    guard
      let id = call.getString("id"), !id.isEmpty,
      let name = call.getString("name"), !name.isEmpty,
      let dueDate = call.getString("dueDate"),
      let deadline = DeadlineMath.moment(for: dueDate),
      deadline > Date()
    else {
      call.resolve(["started": false, "reason": "error"])
      return
    }
    let attributes = DeadlineWatchAttributes(
      id: id,
      name: name,
      value: call.getString("value"),
      url: call.getString("url") ?? "",
      dueDate: dueDate)

    Task {
      await Self.endAll()
      do {
        let state = DeadlineWatchAttributes.ContentState(deadline: deadline, closed: false)
        _ = try Activity.request(
          attributes: attributes,
          content: ActivityContent(state: state, staleDate: Self.staleDate(for: deadline)),
          pushType: nil)
        call.resolve(["started": true])
      } catch {
        CAPLog.print("StudyMaxWidgets: could not start the Deadline watch: \(error)")
        call.resolve(["started": false, "reason": "error"])
      }
    }
    #else
    call.resolve(["started": false, "reason": "unsupported"])
    #endif
  }

  @objc func stopDeadlineWatch(_ call: CAPPluginCall) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      Task {
        await Self.endAll()
        call.resolve()
      }
      return
    }
    #endif
    call.resolve()
  }

  @objc func getDeadlineWatch(_ call: CAPPluginCall) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      if let activity = Self.liveActivities().first {
        call.resolve(["active": true, "id": activity.attributes.id])
      } else {
        call.resolve(["active": false, "id": NSNull()])
      }
      return
    }
    #endif
    call.resolve(["active": false, "id": NSNull()])
  }

  // MARK: ActivityKit helpers

  #if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private static func liveActivities() -> [Activity<DeadlineWatchAttributes>] {
    Activity<DeadlineWatchAttributes>.activities.filter {
      $0.activityState == .active || $0.activityState == .stale
    }
  }

  @available(iOS 16.2, *)
  private static func staleDate(for deadline: Date) -> Date {
    min(deadline, Date().addingTimeInterval(maxActivityLife))
  }

  @available(iOS 16.2, *)
  private static func endAll() async {
    for activity in Activity<DeadlineWatchAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  /// On foreground: a watch whose deadline has passed ends with a final
  /// "Closed" state; a running one gets a fresh staleDate so its day count is
  /// redrawn.
  @available(iOS 16.2, *)
  private static func refreshWatch() async {
    for activity in liveActivities() {
      let deadline = activity.content.state.deadline
      if deadline <= Date() {
        let final = DeadlineWatchAttributes.ContentState(deadline: deadline, closed: true)
        await activity.end(ActivityContent(state: final, staleDate: nil), dismissalPolicy: .default)
      } else {
        await activity.update(ActivityContent(
          state: activity.content.state, staleDate: staleDate(for: deadline)))
      }
    }
  }
  #endif
}
