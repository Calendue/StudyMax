import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/**
 Compiled into BOTH the App target (which starts the Deadline watch) and the
 StudyMaxWidgets extension (which draws it and the widgets). ActivityKit needs
 the identical attributes type on both sides, and the widgets need the same
 day arithmetic the Live Activity uses, so both live in this one file.
 */

/// The deadline arithmetic shared by the widgets, the Live Activity and the plugin.
///
/// Calendar days, not elapsed time: daysLeft = dueDate's local calendar date
/// minus today's, so 0 is "closes today", 1 is tomorrow, and a negative number
/// means the deadline has passed. The app's own daysUntil() uses the same rule.
enum DeadlineMath {
  private static var calendar: Calendar { Calendar.current }

  /// "YYYY-MM-DD" as a local calendar day (midnight at its start), or nil.
  static func day(from dueDate: String) -> Date? {
    let parts = dueDate.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  /// The deadline moment: dueDate at 23:59:59 local time.
  static func moment(for dueDate: String) -> Date? {
    guard let start = day(from: dueDate) else { return nil }
    return calendar.date(bySettingHour: 23, minute: 59, second: 59, of: start)
  }

  /// Calendar days from `now`'s local date to dueDate's. Negative once passed.
  static func daysLeft(to dueDate: String, from now: Date = Date()) -> Int? {
    guard let due = day(from: dueDate) else { return nil }
    return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: due).day
  }

  static func daysLeft(toMoment moment: Date, from now: Date = Date()) -> Int {
    calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: moment)).day ?? 0
  }

  /// The big number and its small unit: ("6", "days left"), ("1", "day left"), ("Today", "closes tonight").
  static func parts(daysLeft: Int) -> (value: String, unit: String) {
    switch daysLeft {
    case ..<1: return ("Today", "closes tonight")
    case 1: return ("1", "day left")
    default: return ("\(daysLeft)", "days left")
    }
  }

  static func isUrgent(daysLeft: Int) -> Bool { daysLeft <= 14 }

  /// The next local midnight after `date`: where a countdown in days ticks over.
  static func nextMidnight(after date: Date) -> Date {
    calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: date) ?? date.addingTimeInterval(86_400))
  }
}

#if canImport(ActivityKit)
/// The Deadline watch Live Activity. Everything drawn is fixed for the watch or
/// derivable from `deadline`, so the system can render it without updates.
@available(iOS 16.1, *)
struct DeadlineWatchAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// dueDate at 23:59:59 local time. The countdown is derived from this.
    var deadline: Date
    /// True on the final update when the watch is ended because the deadline passed.
    var closed: Bool
  }

  var id: String
  var name: String
  var value: String?
  var url: String
  /// "YYYY-MM-DD", as the app sent it.
  var dueDate: String
}
#endif
