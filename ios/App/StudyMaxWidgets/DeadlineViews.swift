import SwiftUI
import WidgetKit

struct NextDeadlineWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ai.calendue.studymax.widget.deadline", provider: SnapshotProvider()) { entry in
      NextDeadlineEntryView(entry: entry)
    }
    .configurationDisplayName("Next deadline")
    .description("Your next award deadline, and how long you have.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

struct NextDeadlineEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: SnapshotEntry

  var body: some View {
    Group {
      switch family {
      case .systemMedium: DeadlineMedium(entry: entry)
      case .accessoryCircular: DeadlineCircular(entry: entry)
      case .accessoryRectangular: DeadlineRectangular(entry: entry)
      case .accessoryInline: DeadlineInline(entry: entry)
      default: DeadlineSmall(entry: entry)
      }
    }
    .modifier(WidgetGround(family: family))
    .widgetURL(WidgetLink.awards)
  }
}

/// Tag, big number, name, due date. Shared by the small widget and the medium's left column.
private struct DeadlineHero: View {
  @Environment(\.widgetRenderingMode) private var mode
  let deadline: SnapshotDeadline
  let daysLeft: Int
  var numberSize: CGFloat = 40

  var body: some View {
    let tone = Tone(mode)
    let parts = DeadlineMath.parts(daysLeft: daysLeft)
    let urgent = DeadlineMath.isUrgent(daysLeft: daysLeft)
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: 6) {
        Tag(text: urgent ? "Closing soon" : "Next deadline", urgent: urgent)
        Spacer(minLength: 0)
        BrandMark(size: 14, color: tone.accent)
      }
      Spacer(minLength: 4)
      BigNumber(value: parts.value, unit: parts.unit, size: numberSize)
      Text(deadline.name)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(tone.ink)
        .lineLimit(2)
        .minimumScaleFactor(0.85)
        .fixedSize(horizontal: false, vertical: true)
      if let moment = deadline.moment {
        Text("Due \(moment.dueLabel)")
          .font(.caption2)
          .foregroundStyle(tone.inkFaint)
          .lineLimit(1)
          .padding(.top, 2)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(deadline.name), \(parts.value) \(parts.unit)")
  }
}

struct DeadlineSmall: View {
  let entry: SnapshotEntry

  var body: some View {
    if let open = entry.openDeadline {
      DeadlineHero(deadline: open.deadline, daysLeft: open.daysLeft)
    } else {
      EmptyStateView()
    }
  }
}

/// The small layout, plus the value and a hairline divider.
struct DeadlineMedium: View {
  @Environment(\.widgetRenderingMode) private var mode
  let entry: SnapshotEntry

  var body: some View {
    let tone = Tone(mode)
    if let open = entry.openDeadline {
      HStack(alignment: .top, spacing: 14) {
        DeadlineHero(deadline: open.deadline, daysLeft: open.daysLeft, numberSize: 36)
        Rectangle()
          .fill(tone.hairline)
          .frame(width: 1)
          .padding(.vertical, 2)
        VStack(alignment: .leading, spacing: 4) {
          Text("Value")
            .font(.caption2.weight(.bold))
            .foregroundStyle(tone.accent)
            .widgetAccentable()
          Text(open.deadline.value ?? "Not listed")
            .font(.system(.headline, design: .rounded).weight(.semibold))
            .foregroundStyle(open.deadline.value == nil ? tone.inkFaint : tone.ink)
            .lineLimit(3)
            .minimumScaleFactor(0.8)
          Spacer(minLength: 0)
          Text("Open Awards")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tone.inkSoft)
        }
        .frame(width: 112, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .topLeading)
      }
    } else {
      EmptyStateView()
    }
  }
}

/// A gauge of days over 30, capped.
struct DeadlineCircular: View {
  let entry: SnapshotEntry

  var body: some View {
    if let open = entry.openDeadline {
      Gauge(value: Double(min(open.daysLeft, 30)), in: 0...30) {
        Text("days")
      } currentValueLabel: {
        Text(open.daysLeft == 0 ? "Today" : "\(open.daysLeft)")
          .font(.system(.title3, design: .rounded).weight(.bold))
          .minimumScaleFactor(0.5)
      }
      .gaugeStyle(.accessoryCircularCapacity)
      .widgetAccentable()
      .accessibilityLabel(open.daysLeft == 0 ? "Deadline closes tonight" : "\(open.daysLeft) days to the deadline")
    } else {
      ZStack {
        AccessoryWidgetBackground()
        BrandMark(size: 24, color: .primary)
      }
      .accessibilityLabel("StudyMax")
    }
  }
}

struct DeadlineRectangular: View {
  let entry: SnapshotEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      if let open = entry.openDeadline {
        let parts = DeadlineMath.parts(daysLeft: open.daysLeft)
        HStack(spacing: 4) {
          BrandMark(size: 11, color: .primary)
          Text(open.daysLeft == 0 ? "Closes tonight" : "\(parts.value) \(parts.unit)")
            .font(.caption.weight(.bold))
            .lineLimit(1)
        }
        .widgetAccentable()
        Text(open.deadline.name)
          .font(.headline)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        if let moment = open.deadline.moment {
          Text("Due \(moment.dueLabel)")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      } else {
        HStack(spacing: 4) {
          BrandMark(size: 11, color: .primary)
          Text("StudyMax").font(.caption.weight(.bold))
        }
        .widgetAccentable()
        Text("Open StudyMax to see what you're close to")
          .font(.caption)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

struct DeadlineInline: View {
  let entry: SnapshotEntry

  var body: some View {
    if let open = entry.openDeadline {
      Label(
        open.daysLeft == 0 ? "Closes tonight · \(open.deadline.name)" : "\(open.daysLeft)d · \(open.deadline.name)",
        systemImage: "graduationcap.fill")
    } else {
      Label("Open StudyMax", systemImage: "graduationcap.fill")
    }
  }
}
