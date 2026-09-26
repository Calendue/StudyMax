package ai.calendue.studymax.widgets;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;

import java.util.Collections;

import ai.calendue.studymax.R;

/**
 * The deadline watch: Android's Live Update, the counterpart of the iOS Live Activity.
 *
 * One ongoing notification, promoted on Android 16+ (status-bar chip, top of the shade, lock
 * screen): the award's name and value, "Closes in 6 days", a ProgressStyle bar through the last 30
 * days, a Stop action, and a tap that opens studymax://awards. In the final 24 hours the chip and
 * the notification count down live with a chronometer. It ends itself at the deadline.
 */
public final class DeadlineWatch {

    static final String CHANNEL_ID = "deadline_watch";
    static final int NOTIFICATION_ID = 4101;

    private static final String KEY_ID = "watch_id";
    private static final String KEY_NAME = "watch_name";
    private static final String KEY_VALUE = "watch_value";
    private static final String KEY_DUE = "watch_due";
    private static final String KEY_URL = "watch_url";

    /** Notification.EXTRA_REQUEST_PROMOTED_ONGOING (public from API 36.1; honoured from 36). */
    private static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";

    private static final long HOUR_MS = 3_600_000L;
    private static final long DAY_MS = 24 * HOUR_MS;
    /** The progress bar covers the last 30 days, in hours. */
    private static final int WINDOW_HOURS = 30 * 24;

    private DeadlineWatch() {}

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        // Default importance so it shows on the lock screen and can be promoted (MIN can't be),
        // but silent: a countdown should never buzz.
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                context.getString(R.string.sm_watch_channel_name), NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(context.getString(R.string.sm_watch_channel_description));
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    /** True when the app's notifications, or the deadline_watch channel, are switched off. */
    static boolean isBlocked(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) return true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            return channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE;
        }
        return false;
    }

    /** Starts (or replaces) the watch. */
    static void start(Context context, String id, String name, String value, String dueDate, String url) {
        WidgetData.prefs(context).edit()
                .putString(KEY_ID, id)
                .putString(KEY_NAME, name)
                .putString(KEY_VALUE, value)
                .putString(KEY_DUE, dueDate)
                .putString(KEY_URL, url)
                .apply();
        post(context);
        Widgets.scheduleMidnight(context);
    }

    public static void stop(Context context) {
        WidgetData.prefs(context).edit()
                .remove(KEY_ID).remove(KEY_NAME).remove(KEY_VALUE).remove(KEY_DUE).remove(KEY_URL)
                .apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(StudyMaxReceiver.pending(context, StudyMaxReceiver.ACTION_WATCH_TICK, 101));
    }

    /** The watched award's id, or null. A watch whose deadline has passed is ended here. */
    static String activeId(Context context) {
        SharedPreferences prefs = WidgetData.prefs(context);
        String id = prefs.getString(KEY_ID, null);
        if (id == null) return null;
        long deadline = WidgetData.deadlineMillis(prefs.getString(KEY_DUE, null));
        if (deadline < 0 || System.currentTimeMillis() >= deadline) {
            stop(context);
            return null;
        }
        return id;
    }

    /** Redraws the notification (midnight, the final-24-hours switch, boot), or ends it if it's due. */
    static void refresh(Context context) {
        if (activeId(context) != null) post(context);
    }

    private static void post(Context context) {
        SharedPreferences prefs = WidgetData.prefs(context);
        String name = prefs.getString(KEY_NAME, null);
        String value = prefs.getString(KEY_VALUE, null);
        String dueDate = prefs.getString(KEY_DUE, null);
        long deadline = WidgetData.deadlineMillis(dueDate);
        long now = System.currentTimeMillis();
        if (name == null || deadline < 0 || now >= deadline) {
            stop(context);
            return;
        }
        ensureChannel(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.notify(NOTIFICATION_ID, build(context, name, value, dueDate, deadline, now));
        scheduleTick(context, deadline, now);
    }

    static Notification build(Context context, String name, String value, String dueDate, long deadline, long now) {
        long remaining = deadline - now;
        int days = WidgetData.daysLeft(dueDate, now);
        boolean finalDay = remaining <= DAY_MS;
        String closes = days <= 0 ? "Closes tonight" : days == 1 ? "Closes tomorrow" : "Closes in " + days + " days";
        int accent = context.getColor(R.color.sm_accent);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);

        PendingIntent stop = StudyMaxReceiver.pending(context, StudyMaxReceiver.ACTION_STOP_WATCH, 102);
        builder.setSmallIcon(R.drawable.ic_stat_studymax)
                .setColor(accent)
                .setContentTitle(name)
                .setContentText(value != null ? closes + " · " + value : closes)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(Widgets.openLink(context, Widgets.LINK_AWARDS, 13))
                // Android 14+ lets people swipe even an ongoing notification away: treat it as Stop.
                .setDeleteIntent(stop)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(context, R.drawable.ic_stat_stop),
                        context.getString(R.string.sm_watch_stop), stop).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // The system takes it down at the deadline even if our alarm runs late.
            builder.setTimeoutAfter(Math.max(1_000L, remaining));
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_DEFAULT);
        }

        if (finalDay) {
            // The last 24 hours count down live: the chronometer ticks in the shade and the chip.
            builder.setWhen(deadline).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        } else {
            builder.setShowWhen(false);
        }

        int hoursLeft = (int) Math.min(WINDOW_HOURS, Math.max(0L, (remaining + HOUR_MS - 1) / HOUR_MS));
        int progress = WINDOW_HOURS - hoursLeft;

        Bundle extras = new Bundle();
        extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
        builder.addExtras(extras);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
            // The status-bar chip: "6d" while it's days away; in the final 24 hours no text, so the
            // chip shows the chronometer instead.
            if (!finalDay) builder.setShortCriticalText(Math.max(days, 1) + "d");
            builder.setStyle(new Notification.ProgressStyle()
                    .setStyledByProgress(true)
                    .setProgressSegments(Collections.singletonList(
                            new Notification.ProgressStyle.Segment(WINDOW_HOURS).setColor(accent)))
                    .setProgress(progress)
                    .setProgressTrackerIcon(Icon.createWithResource(context, R.drawable.widget_mark)));
        } else {
            builder.setProgress(WINDOW_HOURS, progress, false);
        }
        return builder.build();
    }

    /** Wakes once more: at the start of the final 24 hours (to switch to the countdown), then at the deadline. */
    private static void scheduleTick(Context context, long deadline, long now) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        long finalDayStarts = deadline - DAY_MS;
        long at = finalDayStarts > now ? finalDayStarts : deadline;
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at,
                StudyMaxReceiver.pending(context, StudyMaxReceiver.ACTION_WATCH_TICK, 101));
    }
}
