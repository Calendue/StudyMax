package ai.calendue.studymax.widgets;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * The snapshot the app writes (v1, see src/lib/widgetSnapshot.ts) and the date arithmetic every
 * surface shares, so the widgets, the Live Update and the app always agree on "6 days left".
 */
final class WidgetData {

    static final String PREFS = "studymax_widgets";
    static final String KEY_SNAPSHOT = "snapshot";

    private static final long DAY_MS = 86_400_000L;

    private WidgetData() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static final class Deadline {
        String id;
        String name;
        String value;
        String dueDate;
        String url;
    }

    static final class Credential {
        String name;
        String kind;
        int done;
        int total;
        int left;
        String nextCode;
        String nextTitle;
    }

    Deadline deadline;
    Credential credential;

    /** The stored snapshot, or an empty one when there is none or it can't be read. */
    static WidgetData load(Context context) {
        WidgetData data = new WidgetData();
        String json = prefs(context).getString(KEY_SNAPSHOT, null);
        if (json == null) return data;
        try {
            JSONObject root = new JSONObject(json);
            JSONObject d = root.optJSONObject("deadline");
            if (d != null) {
                Deadline deadline = new Deadline();
                deadline.id = optString(d, "id");
                deadline.name = optString(d, "name");
                deadline.value = optString(d, "value");
                deadline.dueDate = optString(d, "dueDate");
                deadline.url = optString(d, "url");
                if (deadline.name != null && parseDate(deadline.dueDate) != null) data.deadline = deadline;
            }
            JSONObject c = root.optJSONObject("credential");
            if (c != null && optString(c, "name") != null) {
                Credential credential = new Credential();
                credential.name = optString(c, "name");
                credential.kind = optString(c, "kind");
                credential.done = c.optInt("done", 0);
                credential.total = c.optInt("total", 0);
                credential.left = c.optInt("left", Math.max(0, credential.total - credential.done));
                JSONObject next = c.optJSONObject("nextCourse");
                if (next != null) {
                    credential.nextCode = optString(next, "code");
                    credential.nextTitle = optString(next, "title");
                }
                data.credential = credential;
            }
        } catch (Exception ignored) {
            // A snapshot we can't read is shown as no snapshot: the calm empty state.
        }
        return data;
    }

    /** A JSON string, with JSON null, a missing key and "" all read as null. */
    static String optString(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) return null;
        String value = object.optString(key, null);
        return value == null || value.trim().isEmpty() ? null : value;
    }

    // ---- Dates ------------------------------------------------------------------------------

    /** {year, month (1-12), day} from "YYYY-MM-DD", or null. */
    static int[] parseDate(String dueDate) {
        if (dueDate == null) return null;
        String[] parts = dueDate.trim().split("-");
        if (parts.length != 3) return null;
        try {
            int y = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            int d = Integer.parseInt(parts[2].length() > 2 ? parts[2].substring(0, 2) : parts[2]);
            if (m < 1 || m > 12 || d < 1 || d > 31) return null;
            return new int[] {y, m, d};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static long epochDay(int y, int m, int d) {
        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        utc.clear();
        utc.set(y, m - 1, d);
        return Math.floorDiv(utc.getTimeInMillis(), DAY_MS);
    }

    /**
     * Calendar days from today (local) to the due date: 0 = closes today, 1 = tomorrow, negative =
     * passed. Integer.MIN_VALUE when the date can't be read.
     */
    static int daysLeft(String dueDate, long nowMs) {
        int[] due = parseDate(dueDate);
        if (due == null) return Integer.MIN_VALUE;
        Calendar now = Calendar.getInstance();
        now.setTimeInMillis(nowMs);
        long today = epochDay(now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
        return (int) (epochDay(due[0], due[1], due[2]) - today);
    }

    /** The deadline moment: the due date at 23:59:59 local time. -1 when the date can't be read. */
    static long deadlineMillis(String dueDate) {
        int[] due = parseDate(dueDate);
        if (due == null) return -1;
        Calendar local = Calendar.getInstance();
        local.clear();
        local.set(due[0], due[1] - 1, due[2], 23, 59, 59);
        return local.getTimeInMillis();
    }

    /** The due date as a calendar reads it: "Thu, Oct 1". */
    static String shortDate(String dueDate) {
        long ms = deadlineMillis(dueDate);
        if (ms < 0) return "";
        return new java.text.SimpleDateFormat("EEE, MMM d", java.util.Locale.getDefault()).format(new java.util.Date(ms));
    }

    /** The next local midnight, a few seconds after, so the date has certainly rolled. */
    static long nextMidnight(long nowMs) {
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(nowMs);
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 5);
        next.set(Calendar.MILLISECOND, 0);
        return next.getTimeInMillis();
    }

    /** The big number and its unit: ("6", "days left"), ("1", "day left"), ("Today", "closes tonight"). */
    static String[] countdownParts(int daysLeft) {
        if (daysLeft <= 0) return new String[] {"Today", "closes tonight"};
        if (daysLeft == 1) return new String[] {"1", "day left"};
        return new String[] {String.valueOf(daysLeft), "days left"};
    }

    static boolean isUrgent(int daysLeft) {
        return daysLeft <= 14;
    }

    static String kindLabel(String kind) {
        if (kind == null) return "Credential";
        switch (kind) {
            case "specialization": return "Specialization";
            case "certificate": return "Certificate";
            case "minor": return "Minor";
            default: return Character.toUpperCase(kind.charAt(0)) + kind.substring(1);
        }
    }
}
