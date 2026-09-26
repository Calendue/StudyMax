package ai.calendue.studymax.widgets;

import android.Manifest;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

/**
 * The native half of src/widgets.ts. Same name and methods as the iOS plugin:
 * save / clear / startDeadlineWatch / stopDeadlineWatch / getDeadlineWatch.
 */
@CapacitorPlugin(
    name = "StudyMaxWidgets",
    permissions = {
        @Permission(alias = StudyMaxWidgetsPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class StudyMaxWidgetsPlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";

    @PluginMethod
    public void save(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        Context context = getContext();
        WidgetData.prefs(context).edit().putString(WidgetData.KEY_SNAPSHOT, snapshot).apply();
        Widgets.updateAll(context);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context context = getContext();
        WidgetData.prefs(context).edit().remove(WidgetData.KEY_SNAPSHOT).apply();
        DeadlineWatch.stop(context);
        Widgets.updateAll(context);
        call.resolve();
    }

    @PluginMethod
    public void startDeadlineWatch(PluginCall call) {
        String name = call.getString("name");
        String dueDate = call.getString("dueDate");
        long deadline = WidgetData.deadlineMillis(dueDate);
        if (name == null || deadline < 0 || deadline <= System.currentTimeMillis()) {
            fail(call, "error");
            return;
        }
        // Asked at the moment of the tap, through Capacitor, so the result comes back to this call.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState(NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(NOTIFICATIONS, call, "onNotificationPermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void onNotificationPermission(PluginCall call) {
        if (getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED) {
            begin(call);
        } else {
            fail(call, "denied");
        }
    }

    private void begin(PluginCall call) {
        Context context = getContext();
        try {
            DeadlineWatch.ensureChannel(context);
            if (DeadlineWatch.isBlocked(context)) {
                fail(call, "disabled");
                return;
            }
            String id = call.getString("id");
            String name = call.getString("name");
            String dueDate = call.getString("dueDate");
            JSObject data = call.getData();
            String value = data.isNull("value") ? null : WidgetData.optString(data, "value");
            String url = WidgetData.optString(data, "url");
            DeadlineWatch.start(context, id != null ? id : name + "|" + dueDate, name, value, dueDate, url);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            fail(call, "error");
        }
    }

    private static void fail(PluginCall call, String reason) {
        JSObject result = new JSObject();
        result.put("started", false);
        result.put("reason", reason);
        call.resolve(result);
    }

    @PluginMethod
    public void stopDeadlineWatch(PluginCall call) {
        Context context = getContext();
        DeadlineWatch.stop(context);
        Widgets.scheduleMidnight(context);
        call.resolve();
    }

    @PluginMethod
    public void getDeadlineWatch(PluginCall call) {
        String id = DeadlineWatch.activeId(getContext());
        JSObject result = new JSObject();
        result.put("active", id != null);
        result.put("id", id != null ? id : JSONObject.NULL);
        call.resolve(result);
    }
}
