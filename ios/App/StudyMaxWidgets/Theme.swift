import SwiftUI
import WidgetKit

private extension Color {
  init(hex: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity)
  }
}

/**
 StudyMax's palette, as the widgets and the Deadline watch use it. Mirrors
 public/brand/brand-colors.css. No pure white or black anywhere.
 */
enum Brand {
  /// Old Lace: the app's page, the ground's top-left.
  static let oldLace = Color(hex: 0xFFF8EB)
  /// The ground's bottom-right.
  static let groundEnd = Color(hex: 0xF8EBE1)
  /// Cherry Rose.
  static let accent = Color(hex: 0x982649)
  static let rose = Color(hex: 0xC38D94)
  static let ink = Color(hex: 0x12262B)
  static let inkSoft = ink.opacity(0.72)
  /// The lowest opacity allowed for text.
  static let inkFaint = ink.opacity(0.55)
  /// The fill behind a tag: the accent, well diluted.
  static let capsule = accent.opacity(0.14)
  static let hairline = ink.opacity(0.10)
  static let ringTrack = rose.opacity(0.35)

  /// Two-tone ground, top-left to bottom-right.
  static var ground: LinearGradient {
    LinearGradient(colors: [oldLace, groundEnd], startPoint: .topLeading, endPoint: .bottomTrailing)
  }

  /// Cherry Rose caught in the top-right corner.
  static var glow: RadialGradient {
    RadialGradient(
      colors: [accent.opacity(0.20), accent.opacity(0.0)],
      center: UnitPoint(x: 1.05, y: -0.1),
      startRadius: 0,
      endRadius: 190)
  }

  static var background: some View { ZStack { ground; glow } }
}

/**
 The palette as the current rendering mode allows it. On the Lock Screen
 (vibrant) and on tinted Home Screens (accented) the system recolours
 everything, and dark ink would vanish, so those modes use the primary style at
 the same three opacity levels and let `widgetAccentable()` carry the accent.
 */
struct Tone {
  let fullColor: Bool

  init(_ mode: WidgetRenderingMode) { fullColor = mode == .fullColor }

  var ink: Color { fullColor ? Brand.ink : .primary }
  var inkSoft: Color { fullColor ? Brand.inkSoft : Color.primary.opacity(0.72) }
  var inkFaint: Color { fullColor ? Brand.inkFaint : Color.primary.opacity(0.55) }
  var accent: Color { fullColor ? Brand.accent : .primary }
  var capsule: Color { fullColor ? Brand.capsule : Color.primary.opacity(0.14) }
  var hairline: Color { fullColor ? Brand.hairline : Color.primary.opacity(0.10) }
  var ringTrack: Color { fullColor ? Brand.ringTrack : Color.primary.opacity(0.20) }
}

enum WidgetLink {
  static let awards = URL(string: "studymax://awards")!
  static let plan = URL(string: "studymax://plan")!
}

/// The StudyMax paper-hop S: a template image, so it takes whatever tint it is given.
struct BrandMark: View {
  var size: CGFloat = 14
  var color: Color = Brand.accent

  var body: some View {
    Image("WidgetMark")
      .renderingMode(.template)
      .resizable()
      .aspectRatio(contentMode: .fit)
      .frame(width: size, height: size)
      .foregroundStyle(color)
      .widgetAccentable()
      .accessibilityHidden(true)
  }
}

/// A tag in an accent capsule, or the urgent chip: accent fill, Old Lace text.
struct Tag: View {
  @Environment(\.widgetRenderingMode) private var mode
  let text: String
  var urgent = false

  var body: some View {
    let tone = Tone(mode)
    Text(text)
      .font(.caption2.weight(.bold))
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .foregroundStyle(urgent && tone.fullColor ? Brand.oldLace : tone.accent)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(
        Capsule().fill(urgent ? tone.accent : tone.capsule)
          .opacity(urgent && !tone.fullColor ? 0.25 : 1)
      )
      .widgetAccentable()
  }
}

/// A big number with a small unit.
struct BigNumber: View {
  @Environment(\.widgetRenderingMode) private var mode
  let value: String
  let unit: String
  var size: CGFloat = 40

  var body: some View {
    let tone = Tone(mode)
    HStack(alignment: .firstTextBaseline, spacing: 5) {
      Text(value)
        .font(.system(size: size, weight: .bold, design: .rounded))
        .foregroundStyle(tone.ink)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(unit)
        .font(.caption.weight(.semibold))
        .foregroundStyle(tone.accent)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .widgetAccentable()
    }
  }
}

/// Paints the ground on the Home Screen: containerBackground on iOS 17+, the
/// old inline background (with the old manual padding) before it. The Lock
/// Screen gets nothing of ours; the system draws its own material there.
struct WidgetGround: ViewModifier {
  let family: WidgetFamily

  private var isAccessory: Bool {
    family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline
  }

  func body(content: Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      if isAccessory {
        content.containerBackground(for: .widget) { Color.clear }
      } else {
        content.containerBackground(for: .widget) { Brand.background }
      }
    } else if isAccessory {
      content
    } else {
      ZStack {
        Brand.background
        content.padding(16)
      }
    }
  }
}

/// The calm empty and placeholder state: the mark and one line.
struct EmptyStateView: View {
  @Environment(\.widgetRenderingMode) private var mode

  var body: some View {
    let tone = Tone(mode)
    VStack(alignment: .leading, spacing: 8) {
      BrandMark(size: 28, color: tone.accent)
      Spacer(minLength: 0)
      Text("Open StudyMax to see what you're close to")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(tone.ink)
        .lineLimit(3)
        .minimumScaleFactor(0.85)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("StudyMax. Open StudyMax to see what you're close to.")
  }
}

extension Date {
  /// "Thu, Oct 1".
  var dueLabel: String { formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()) }
}
