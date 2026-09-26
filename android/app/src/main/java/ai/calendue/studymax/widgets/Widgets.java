package ai.calendue.studymax.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.widget.RemoteViews;

import java.util.Map;

import ai.calendue.studymax.MainActivity;
import ai.calendue.studymax.R;

/** What both widgets share: deep links, responsive sizing, the ring, and the midnight roll-over. */
final class Widgets {

    static final String LINK_AWARDS = "studymax://awards";
    static final String LINK_PLAN = "studymax://plan";

    /** The width, in dp, from which a widget switches to its medium (4x2) layout. */
    private static final float MEDIUM_MIN_WIDTH_DP = 300f;

    private Widgets() {}

    /** Opens the app on a studymax:// link; @capacitor/app's appUrlOpen routes it. */
    static PendingIntent openLink(Context context, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Redraws every placed widget from the stored snapshot, and keeps the midnight update armed. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        DeadlineWidget.update(context, manager, ids(context, manager, DeadlineWidget.class));
        CredentialWidget.update(context, manager, ids(context, manager, CredentialWidget.class));
        scheduleMidnight(context);
    }

    private static int[] ids(Context context, AppWidgetManager manager, Class<?> provider) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
        return ids == null ? new int[0] : ids;
    }

    /**
     * Both sizes in one: from Android 12 the launcher picks the layout for the widget's current
     * size itself (and re-picks on resize); before that we read the size from the options.
     */
    static RemoteViews responsive(AppWidgetManager manager, int widgetId, RemoteViews small, RemoteViews medium) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Map<SizeF, RemoteViews> layouts = new ArrayMap<>();
            layouts.put(new SizeF(100f, 100f), small);
            layouts.put(new SizeF(MEDIUM_MIN_WIDTH_DP, 100f), medium);
            return new RemoteViews(layouts);
        }
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int minWidth = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        return minWidth >= MEDIUM_MIN_WIDTH_DP ? medium : small;
    }

    /** The credential ring: Cherry Rose on a rose-grey track, from twelve o'clock, round caps. */
    static Bitmap ring(Context context, float sizeDp, float strokeDp, int done, int total) {
        float density = context.getResources().getDisplayMetrics().density;
        int px = Math.max(1, Math.round(sizeDp * density));
        float stroke = strokeDp * density;
        Bitmap bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        RectF oval = new RectF(stroke / 2f, stroke / 2f, px - stroke / 2f, px - stroke / 2f);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(stroke);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(context.getColor(R.color.sm_ring_track));
        canvas.drawArc(oval, 0f, 360f, false, paint);
        float fraction = total > 0 ? Math.max(0f, Math.min(1f, done / (float) total)) : 0f;
        if (fraction > 0f) {
            paint.setColor(context.getColor(R.color.sm_accent));
            canvas.drawArc(oval, -90f, 360f * fraction, false, paint);
        }
        return bitmap;
    }

    /**
     * One update a few seconds after local midnight, so "6 days" becomes "5 days" (and the Live
     * Update's text rolls) without the app. RTC, not RTC_WAKEUP: a widget no one can see can wait
     * for the screen to come on.
     */
    static void scheduleMidnight(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        PendingIntent pending = StudyMaxReceiver.pending(context, StudyMaxReceiver.ACTION_MIDNIGHT, 100);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        boolean anyWidget = ids(context, manager, DeadlineWidget.class).length > 0
                || ids(context, manager, CredentialWidget.class).length > 0;
        if (!anyWidget && DeadlineWatch.activeId(context) == null) {
            alarms.cancel(pending);
            return;
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, WidgetData.nextMidnight(System.currentTimeMillis()), pending);
    }
}
