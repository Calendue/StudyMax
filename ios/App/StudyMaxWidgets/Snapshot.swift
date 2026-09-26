import Foundation
import WidgetKit

/**
 What the app wrote into the App Group (snapshot JSON v1). The app decides what
 the widgets show; this only reads it. Every field decodes tolerantly, so a
 field this build has not heard of never blanks the widget.
 */
struct WidgetSnapshot: Decodable {
  var v: Int = 1
  var updatedAt: String?
  var deadline: SnapshotDeadline?
  var credential: SnapshotCredential?

  static let appGroup = "group.ai.calendue.studymax"
  static let key = "studymax.snapshot"

  init(deadline: SnapshotDeadline?, credential: SnapshotCredential?) {
    self.deadline = deadline
    self.credential = credential
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    v = (try? c.decodeIfPresent(Int.self, forKey: .v)) ?? 1
    updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)
    deadline = try? c.decodeIfPresent(SnapshotDeadline.self, forKey: .deadline)
    credential = try? c.decodeIfPresent(SnapshotCredential.self, forKey: .credential)
  }

  private enum CodingKeys: String, CodingKey { case v, updatedAt, deadline, credential }

  static func load() -> WidgetSnapshot? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: key),
      let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  /// What the gallery shows: plausible, and obviously a sample.
  static var preview: WidgetSnapshot {
    let due = Calendar.current.date(byAdding: .day, value: 6, to: Date()) ?? Date()
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: due)
    return WidgetSnapshot(
      deadline: SnapshotDeadline(
        id: "preview",
        name: "Continuing Student Bursary application",
        value: "Varies by bursary",
        dueDate: String(format: "%04d-%02d-%02d", parts.year ?? 2026, parts.month ?? 10, parts.day ?? 1),
        url: nil),
      credential: SnapshotCredential(
        name: "Artificial Intelligence", kind: "specialization", done: 4, total: 6, left: 2,
        nextCourse: SnapshotCourse(code: "CMPT 317", title: "Introduction to Artificial Intelligence")))
  }
}

struct SnapshotDeadline: Decodable {
  var id: String
  var name: String
  var value: String?
  var dueDate: String
  var url: String?

  init(id: String, name: String, value: String?, dueDate: String, url: String?) {
    self.id = id; self.name = name; self.value = value; self.dueDate = dueDate; self.url = url
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
    name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? ""
    value = try? c.decodeIfPresent(String.self, forKey: .value)
    dueDate = (try? c.decodeIfPresent(String.self, forKey: .dueDate)) ?? ""
    url = try? c.decodeIfPresent(String.self, forKey: .url)
  }

  private enum CodingKeys: String, CodingKey { case id, name, value, dueDate, url }

  var moment: Date? { DeadlineMath.moment(for: dueDate) }
  func daysLeft(at now: Date) -> Int? { DeadlineMath.daysLeft(to: dueDate, from: now) }
}

struct SnapshotCourse: Decodable {
  var code: String
  var title: String

  init(code: String, title: String) { self.code = code; self.title = title }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    code = (try? c.decodeIfPresent(String.self, forKey: .code)) ?? ""
    title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
  }

  private enum CodingKeys: String, CodingKey { case code, title }
}

struct SnapshotCredential: Decodable {
  var name: String
  var kind: String
  var done: Int
  var total: Int
  var left: Int
  var nextCourse: SnapshotCourse?

  init(name: String, kind: String, done: Int, total: Int, left: Int, nextCourse: SnapshotCourse?) {
    self.name = name; self.kind = kind; self.done = done; self.total = total; self.left = left
    self.nextCourse = nextCourse
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? ""
    kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? ""
    done = (try? c.decodeIfPresent(Int.self, forKey: .done)) ?? 0
    total = (try? c.decodeIfPresent(Int.self, forKey: .total)) ?? 0
    left = (try? c.decodeIfPresent(Int.self, forKey: .left)) ?? max(0, total - done)
    nextCourse = try? c.decodeIfPresent(SnapshotCourse.self, forKey: .nextCourse)
  }

  private enum CodingKeys: String, CodingKey { case name, kind, done, total, left, nextCourse }

  var progress: Double { total > 0 ? min(1, max(0, Double(done) / Double(total))) : 0 }

  var kindLabel: String {
    switch kind.lowercased() {
    case "specialization": return "Specialization"
    case "certificate": return "Certificate"
    case "minor": return "Minor"
    default: return kind.capitalized
    }
  }
}

struct SnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?

  /// The deadline when there is one still open on this entry's day.
  var openDeadline: (deadline: SnapshotDeadline, daysLeft: Int)? {
    guard let d = snapshot?.deadline, let days = d.daysLeft(at: date), days >= 0 else { return nil }
    return (d, days)
  }

  var credential: SnapshotCredential? {
    guard let c = snapshot?.credential, !c.name.isEmpty, c.total > 0 else { return nil }
    return c
  }
}

/**
 One provider for both widgets. The app reloads timelines whenever it saves a
 snapshot; on its own the timeline only has to tick the day count over, so it
 has one entry now and one at each of the next local midnights. Never per
 second.
 */
struct SnapshotProvider: TimelineProvider {
  func placeholder(in context: Context) -> SnapshotEntry {
    SnapshotEntry(date: Date(), snapshot: .preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
    // The gallery shows this before anyone has added the widget.
    completion(SnapshotEntry(date: Date(), snapshot: context.isPreview ? .preview : WidgetSnapshot.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
    let now = Date()
    let snapshot = WidgetSnapshot.load()
    var entries = [SnapshotEntry(date: now, snapshot: snapshot)]
    var next = now
    for _ in 0..<15 {
      next = DeadlineMath.nextMidnight(after: next)
      entries.append(SnapshotEntry(date: next, snapshot: snapshot))
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}
