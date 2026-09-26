import UIKit
import Capacitor

/// The app's bridge view controller. Local (in-app) plugins are registered here,
/// once the bridge exists, as Capacitor 8 requires.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StudyMaxWidgetsPlugin())
    }
}
