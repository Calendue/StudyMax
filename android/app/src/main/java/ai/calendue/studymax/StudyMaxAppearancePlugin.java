package ai.calendue.studymax;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Android WebView does not reliably expose system night mode through matchMedia. */
@CapacitorPlugin(name = "StudyMaxAppearance")
public class StudyMaxAppearancePlugin extends Plugin {
    private JSObject appearance(Configuration config) {
        UiModeManager manager = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        int mode = manager.getNightMode();
        boolean dark = mode == UiModeManager.MODE_NIGHT_YES ||
            (mode != UiModeManager.MODE_NIGHT_NO && (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
        JSObject result = new JSObject();
        result.put("dark", dark);
        return result;
    }

    @PluginMethod
    public void getSystemTheme(PluginCall call) {
        call.resolve(appearance(getContext().getResources().getConfiguration()));
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration configuration) {
        notifyListeners("change", appearance(configuration));
    }

    @Override
    protected void handleOnResume() {
        notifyListeners("change", appearance(getContext().getResources().getConfiguration()));
    }
}
