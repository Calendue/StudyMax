package ai.calendue.studymax.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import ai.calendue.studymax.R;

/** "6 days left": the next award deadline the student is close to. Opens studymax://awards. */
public class DeadlineWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        update(context, manager, widgetIds);
        Widgets.scheduleMidnight(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int widgetId, Bundle newOptions) {
        update(context, manager, new int[] {widgetId});
    }

    @Override
    public void onDisabled(Context context) {
        Widgets.scheduleMidnight(context);
    }

    static void update(Context context, AppWidgetManager manager, int[] widgetIds) {
        if (widgetIds.length == 0) return;
        WidgetData data = WidgetData.load(context);
        long now = System.currentTimeMillis();
        for (int id : widgetIds) {
            RemoteViews small = build(context, data, now, false);
            RemoteViews medium = build(context, data, now, true);
            manager.updateAppWidget(id, Widgets.responsive(manager, id, small, medium));
        }
    }

    private static RemoteViews build(Context context, WidgetData data, long now, boolean medium) {
        RemoteViews views = new RemoteViews(context.getPackageName(),
                medium ? R.layout.widget_deadline_medium : R.layout.widget_deadline_small);
        views.setOnClickPendingIntent(android.R.id.background, Widgets.openLink(context, Widgets.LINK_AWARDS, 11));

        WidgetData.Deadline deadline = data.deadline;
        int days = deadline == null ? Integer.MIN_VALUE : WidgetData.daysLeft(deadline.dueDate, now);
        if (deadline == null || days < 0) {
            views.setViewVisibility(R.id.content, View.GONE);
            views.setViewVisibility(R.id.empty, View.VISIBLE);
            views.setContentDescription(android.R.id.background, context.getString(R.string.sm_widget_empty));
            return views;
        }
        views.setViewVisibility(R.id.content, View.VISIBLE);
        views.setViewVisibility(R.id.empty, View.GONE);

        boolean urgent = WidgetData.isUrgent(days);
        views.setTextViewText(R.id.chip, context.getString(urgent ? R.string.sm_chip_urgent : R.string.sm_chip_calm));
        views.setInt(R.id.chip, "setBackgroundResource", urgent ? R.drawable.widget_chip_urgent : R.drawable.widget_capsule);
        views.setTextColor(R.id.chip, context.getColor(urgent ? R.color.sm_old_lace : R.color.sm_accent));

        String[] parts = WidgetData.countdownParts(days);
        views.setTextViewText(R.id.big, parts[0]);
        // "Today" plus "closes tonight" is wider than a 2x2 column, so the unit drops a line.
        boolean today = days <= 0;
        views.setViewVisibility(R.id.unit, today ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.unit_below, today ? View.VISIBLE : View.GONE);
        views.setTextViewText(today ? R.id.unit_below : R.id.unit, parts[1]);
        views.setTextViewText(R.id.name, deadline.name);

        String date = WidgetData.shortDate(deadline.dueDate);
        if (medium) {
            boolean hasValue = deadline.value != null;
            views.setViewVisibility(R.id.value_label, hasValue ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.value, hasValue ? View.VISIBLE : View.GONE);
            if (hasValue) views.setTextViewText(R.id.value, deadline.value);
        }
        // Same line on both sizes, and on iOS: the app's own "Closes …" wording.
        views.setTextViewText(R.id.date, "Closes " + date);

        StringBuilder spoken = new StringBuilder(deadline.name).append(", ")
                .append(parts[0]).append(' ').append(parts[1]);
        if (deadline.value != null) spoken.append(", ").append(deadline.value);
        spoken.append(", closes ").append(date);
        views.setContentDescription(android.R.id.background, spoken.toString());
        return views;
    }
}
