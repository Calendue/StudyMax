import SwiftUI
import WidgetKit

@main
struct StudyMaxWidgetBundle: WidgetBundle {
  var body: some Widget {
    NextDeadlineWidget()
    ClosestCredentialWidget()
    DeadlineWatchLiveActivity()
  }
}
