package ai.calendue.studymax;

import android.os.Bundle;

import ai.calendue.studymax.widgets.StudyMaxWidgetsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Local plugins register before super.onCreate, which builds the bridge.
        registerPlugin(StudyMaxWidgetsPlugin.class);
        registerPlugin(StudyMaxAppearancePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
