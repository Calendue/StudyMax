import ActivityKit
import SwiftUI
import WidgetKit

/**
 The Deadline watch Live Activity: the Lock Screen / banner view and the
 Dynamic Island. The countdown is coarse ("6d") until the final 24 hours, when
 it becomes a live Text(timerInterval:) that the system ticks on its own.

 ActivityKit keeps an activity for at most 8 hours, so the app sets a staleDate
 no later than that; the stale render recomputes the day count and asks for a
 refresh rather than showing a number that has drifted.
 */
struct DeadlineWatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DeadlineWatchAttributes.self) { context in
      DeadlineWatchLockScreen(context: context)
        .activityBackgroundTint(Brand.oldLace)
        .activitySystemActionForegroundColor(Brand.accent)
        .widgetURL(WidgetLink.awards)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            BrandMark(size: 18, color: Brand.rose)
            Text("Deadline watch")
              .font(.caption.weight(.semibold))
              .foregroundStyle(Brand.rose)
              .lineLimit(1)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          WatchCountdown(state: context.state, style: .expanded)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            Text(context.attributes.name)
              .font(.headline)
              .foregroundStyle(Brand.oldLace)
              .lineLimit(2)
            HStack(alignment: .firstTextBaseline) {
              if let value = context.attributes.value, !value.isEmpty {
                Text(value)
                  .font(.caption)
                  .foregroundStyle(Brand.oldLace.opacity(0.72))
                  .lineLimit(1)
              }
              Spacer(minLength: 8)
              Link(destination: WidgetLink.awards) {
                Text("Open Awards")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(Brand.oldLace)
                  .padding(.horizontal, 10)
                  .padding(.vertical, 5)
                  .background(Capsule().fill(Brand.accent))
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        BrandMark(size: 16, color: Brand.rose)
      } compactTrailing: {
        WatchCountdown(state: context.state, style: .compact)
      } minimal: {
        WatchCountdown(state: context.state, style: .minimal)
      }
      .widgetURL(WidgetLink.awards)
      .keylineTint(Brand.accent)
    }
  }
}

/// "6d", or a live timer in the final 24 hours, or "Closed".
private struct WatchCountdown: View {
  enum Style { case compact, minimal, expanded }

  let state: DeadlineWatchAttributes.ContentState
  let style: Style

  var body: some View {
    let now = Date()
    let remaining = state.deadline.timeIntervalSince(now)
    let days = DeadlineMath.daysLeft(toMoment: state.deadline, from: now)
    Group {
      if state.closed || remaining <= 0 {
        Text("Closed")
      } else if remaining <= 86_400 {
        Text(timerInterval: now...state.deadline, countsDown: true)
          .monospacedDigit()
      } else if style == .expanded {
        Text("\(days) \(days == 1 ? "day" : "days")")
      } else {
        Text("\(days)d")
      }
    }
    .font(style == .expanded
      ? .system(.title3, design: .rounded).weight(.bold)
      : .system(.caption, design: .rounded).weight(.bold))
    .foregroundStyle(Brand.oldLace)
    .lineLimit(1)
    .minimumScaleFactor(0.5)
    // Text(timerInterval:) lays out for its widest value; the cap stops it
    // stretching the island.
    .frame(maxWidth: style == .expanded ? 96 : (style == .minimal ? 30 : 44), alignment: .trailing)
    .multilineTextAlignment(.trailing)
  }
}

private struct DeadlineWatchLockScreen: View {
  let context: ActivityViewContext<DeadlineWatchAttributes>

  var body: some View {
    let now = Date()
    let remaining = context.state.deadline.timeIntervalSince(now)
    let days = DeadlineMath.daysLeft(toMoment: context.state.deadline, from: now)
    let closed = context.state.closed || remaining <= 0
    HStack(alignment: .center, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          BrandMark(size: 14)
          Text(closed ? "Deadline closed" : (DeadlineMath.isUrgent(daysLeft: days) ? "Closing soon" : "Deadline watch"))
            .font(.caption.weight(.bold))
            .foregroundStyle(Brand.accent)
        }
        Text(context.attributes.name)
          .font(.headline)
          .foregroundStyle(Brand.ink)
          .lineLimit(2)
        if let value = context.attributes.value, !value.isEmpty {
          Text(value)
            .font(.caption)
            .foregroundStyle(Brand.inkSoft)
            .lineLimit(1)
        }
        if context.isStale && !closed {
          Text("Open StudyMax to refresh")
            .font(.caption2)
            .foregroundStyle(Brand.inkFaint)
        }
      }
      Spacer(minLength: 8)
      VStack(alignment: .trailing, spacing: 0) {
        if closed {
          Text("Closed")
            .font(.system(size: 22, weight: .bold, design: .rounded))
            .foregroundStyle(Brand.ink)
        } else if remaining <= 86_400 {
          Text(timerInterval: now...context.state.deadline, countsDown: true)
            .font(.system(size: 26, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(Brand.ink)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 110, alignment: .trailing)
          Text("closes tonight")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Brand.accent)
        } else {
          let parts = DeadlineMath.parts(daysLeft: days)
          Text(parts.value)
            .font(.system(size: 40, weight: .bold, design: .rounded))
            .foregroundStyle(Brand.ink)
          Text(parts.unit)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Brand.accent)
        }
      }
      .lineLimit(1)
      .minimumScaleFactor(0.6)
    }
    .padding(16)
    .background(Brand.background)
    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
  }
}
