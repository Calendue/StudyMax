package ai.calendue.studymax.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import ai.calendue.studymax.R;

/** The credential the student is closest to: a ring, what's left, and the next course. Opens studymax://plan. */
public class CredentialWidget extends AppWidgetProvider {

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
        for (int id : widgetIds) {
            RemoteViews small = build(context, data, false);
            RemoteViews medium = build(context, data, true);
            manager.updateAppWidget(id, Widgets.responsive(manager, id, small, medium));
        }
    }

    private static RemoteViews build(Context context, WidgetData data, boolean medium) {
        RemoteViews views = new RemoteViews(context.getPackageName(),
                medium ? R.layout.widget_credential_medium : R.layout.widget_credential_small);
        views.setOnClickPendingIntent(android.R.id.background, Widgets.openLink(context, Widgets.LINK_PLAN, 12));

        WidgetData.Credential credential = data.credential;
        if (credential == null) {
            views.setViewVisibility(R.id.content, View.GONE);
            views.setViewVisibility(R.id.empty, View.VISIBLE);
            views.setContentDescription(android.R.id.background, context.getString(R.string.sm_widget_empty));
            return views;
        }
        views.setViewVisibility(R.id.content, View.VISIBLE);
        views.setViewVisibility(R.id.empty, View.GONE);

        views.setImageViewBitmap(R.id.ring, Widgets.ring(context, medium ? 80f : 46f, medium ? 7f : 4.5f,
                credential.done, credential.total));
        views.setTextViewText(R.id.ring_label, credential.done + "/" + credential.total);
        views.setTextViewText(R.id.name, credential.name);
        String kind = WidgetData.kindLabel(credential.kind);
        views.setTextViewText(R.id.kind, kind);

        boolean done = credential.left <= 0;
        String leftPhrase = done ? "All courses done"
                : credential.left + (credential.left == 1 ? " course left" : " courses left");
        if (medium) {
            views.setTextViewText(R.id.unit, leftPhrase);
            boolean hasNext = credential.nextCode != null || credential.nextTitle != null;
            views.setViewVisibility(R.id.hairline, hasNext ? View.VISIBLE : View.INVISIBLE);
            views.setViewVisibility(R.id.next, hasNext ? View.VISIBLE : View.INVISIBLE);
            if (hasNext) views.setTextViewText(R.id.next, nextLine(credential));
        } else {
            views.setTextViewText(R.id.big, done ? "Done" : String.valueOf(credential.left));
            views.setTextViewTextSize(R.id.big, TypedValue.COMPLEX_UNIT_SP, done ? 28f : 36f);
            views.setTextViewText(R.id.unit, done ? "" : "left");
        }

        StringBuilder spoken = new StringBuilder(credential.name).append(' ').append(kind.toLowerCase())
                .append(", ").append(credential.done).append(" of ").append(credential.total)
                .append(" courses done, ").append(leftPhrase.toLowerCase());
        if (credential.nextCode != null || credential.nextTitle != null) spoken.append(". ").append(nextLine(credential));
        views.setContentDescription(android.R.id.background, spoken.toString());
        return views;
    }

    private static String nextLine(WidgetData.Credential credential) {
        if (credential.nextCode != null && credential.nextTitle != null) {
            return "Next: " + credential.nextCode + " · " + credential.nextTitle;
        }
        return "Next: " + (credential.nextCode != null ? credential.nextCode : credential.nextTitle);
    }
}
