import SwiftUI
import WidgetKit

struct ClosestCredentialWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ai.calendue.studymax.widget.credential", provider: SnapshotProvider()) { entry in
      ClosestCredentialEntryView(entry: entry)
    }
    .configurationDisplayName("Closest credential")
    .description("The specialization, certificate or minor you're closest to.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct ClosestCredentialEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: SnapshotEntry

  var body: some View {
    Group {
      if let credential = entry.credential {
        if family == .systemMedium {
          CredentialMedium(credential: credential)
        } else {
          CredentialSmall(credential: credential)
        }
      } else {
        EmptyStateView()
      }
    }
    .modifier(WidgetGround(family: family))
    .widgetURL(WidgetLink.plan)
  }
}

/// Accent on a Rose track, with "2 left" in the middle.
private struct ProgressRing: View {
  @Environment(\.widgetRenderingMode) private var mode
  let credential: SnapshotCredential
  var diameter: CGFloat = 64
  var lineWidth: CGFloat = 7

  var body: some View {
    let tone = Tone(mode)
    ZStack {
      Circle().stroke(tone.ringTrack, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: credential.progress)
        .stroke(tone.accent, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
        .widgetAccentable()
      VStack(spacing: -2) {
        Text(credential.left > 0 ? "\(credential.left)" : "Done")
          .font(.system(size: credential.left > 0 ? diameter * 0.36 : diameter * 0.22, weight: .bold, design: .rounded))
          .foregroundStyle(tone.ink)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        if credential.left > 0 {
          Text("left")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tone.accent)
            .widgetAccentable()
        }
      }
      .padding(lineWidth + 2)
    }
    .frame(width: diameter, height: diameter)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(credential.done) of \(credential.total) done, \(credential.left) left")
  }
}

struct CredentialSmall: View {
  @Environment(\.widgetRenderingMode) private var mode
  let credential: SnapshotCredential

  var body: some View {
    let tone = Tone(mode)
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        ProgressRing(credential: credential, diameter: 62)
        Spacer(minLength: 0)
        BrandMark(size: 14, color: tone.accent)
      }
      Spacer(minLength: 6)
      Text(credential.name)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(tone.ink)
        .lineLimit(2)
        .minimumScaleFactor(0.85)
        .fixedSize(horizontal: false, vertical: true)
      Text(credential.kindLabel)
        .font(.caption2)
        .foregroundStyle(tone.inkFaint)
        .lineLimit(1)
        .padding(.top, 1)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .combine)
  }
}

struct CredentialMedium: View {
  @Environment(\.widgetRenderingMode) private var mode
  let credential: SnapshotCredential

  var body: some View {
    let tone = Tone(mode)
    HStack(alignment: .center, spacing: 16) {
      ProgressRing(credential: credential, diameter: 88, lineWidth: 9)
      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .center) {
          Tag(text: credential.kindLabel)
          Spacer(minLength: 0)
          BrandMark(size: 14, color: tone.accent)
        }
        Text(credential.name)
          .font(.headline)
          .foregroundStyle(tone.ink)
          .lineLimit(2)
          .minimumScaleFactor(0.85)
          .padding(.top, 2)
        Text("\(credential.done) of \(credential.total) courses done")
          .font(.caption)
          .foregroundStyle(tone.inkSoft)
          .lineLimit(1)
        Spacer(minLength: 0)
        if let next = credential.nextCourse, !next.code.isEmpty {
          Rectangle().fill(tone.hairline).frame(height: 1)
          Text("Next: \(next.code) · \(next.title)")
            .font(.caption.weight(.medium))
            .foregroundStyle(tone.inkFaint)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.top, 3)
        }
      }
      .frame(maxHeight: .infinity, alignment: .topLeading)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}
