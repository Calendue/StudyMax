package ai.calendue.studymax.widgets;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The widgets' and the deadline watch's clock: local midnight, the watch's own ticks, its Stop
 * action, and the system events after which a date or an alarm could be stale (boot, an app
 * update, a time or time-zone change).
 */
public class StudyMaxReceiver extends BroadcastReceiver {

    static final String ACTION_MIDNIGHT = "ai.calendue.studymax.widgets.MIDNIGHT";
    static final String ACTION_WATCH_TICK = "ai.calendue.studymax.widgets.WATCH_TICK";
    static final String ACTION_STOP_WATCH = "ai.calendue.studymax.widgets.STOP_WATCH";

    static PendingIntent pending(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, StudyMaxReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        switch (action) {
            case ACTION_STOP_WATCH:
                DeadlineWatch.stop(context);
                Widgets.scheduleMidnight(context);
                break;
            case ACTION_WATCH_TICK:
                DeadlineWatch.refresh(context);
                break;
            default:
                // Midnight, BOOT_COMPLETED, MY_PACKAGE_REPLACED, TIME_SET, TIMEZONE_CHANGED, LOCALE_CHANGED.
                DeadlineWatch.refresh(context);
                Widgets.updateAll(context);
                break;
        }
    }
}
