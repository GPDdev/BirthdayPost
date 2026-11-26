package app.birthdaypost.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class BirthdayReceiver extends BroadcastReceiver {
    static final String CHANNEL = "birthdays";
    static final String ACTION = "app.birthdaypost.mobile.CHECK";
    static SharedPreferences store(Context context) {
        return context.getSharedPreferences("postal", Context.MODE_PRIVATE);
    }
    static void channel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "好友生日", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("在好友生日当天提醒");
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    static String permission(Context context) {
        channel(context);
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            return store(context).getBoolean("asked", false) ? "denied" : "prompt";
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE ? "granted" : "denied";
    }
    private static PendingIntent tick(Context context) {
        return PendingIntent.getBroadcast(context, 3, new Intent(context, BirthdayReceiver.class).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static ArrayList<String> due(JSONArray rules, String date) throws JSONException {
        ArrayList<String> names = new ArrayList<>();
        for (int i=0; i<rules.length(); i++) {
            JSONObject rule = rules.getJSONObject(i);
            boolean match = date.substring(5).equals(rule.optString("md"));
            JSONArray dates = rule.optJSONArray("dates");
            for (int j=0; !match && dates != null && j<dates.length(); j++) match = date.equals(dates.optString(j));
            if (match) {
                JSONArray group = rule.getJSONArray("names");
                for (int j=0; j<group.length(); j++) names.add(group.getString(j));
            }
        }
        return names;
    }
    static synchronized void refresh(Context context) {
        SharedPreferences prefs = store(context);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent tick = tick(context);
        if (!prefs.getBoolean("enabled", false)) { alarms.cancel(tick); return; }
        ZoneId zone = ZoneId.systemDefault();
        ZonedDateTime now = ZonedDateTime.now(zone);
        LocalDate day = now.toLocalDate();
        LocalTime time = LocalTime.parse(prefs.getString("time","09:00"));
        ZonedDateTime when = day.atTime(time).atZone(zone);
        if (!when.isAfter(now)) {
            when = day.plusDays(1).atTime(time).atZone(zone);
            if ("granted".equals(permission(context))) {
                try {
                    ArrayList<String> names = due(new JSONArray(prefs.getString("rules","[]")), day.toString());
                    String key = day + "|" + names.toString();
                    if (!names.isEmpty() && !key.equals(prefs.getString("last",""))) {
                        Intent intent = new Intent(context, MainActivity.class).putExtra("today",true)
                            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        PendingIntent open = PendingIntent.getActivity(context, 4, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                        String body = String.join("、", names);
                        if (body.length() > 250) body = body.substring(0,247) + "…";
                        Notification notice = new Notification.Builder(context, CHANNEL)
                            .setSmallIcon(R.drawable.notification).setColor(0xff963b37)
                            .setContentTitle("今天有 " + names.size() + " 位好友过生日")
                            .setContentText(body + "，点此写祝福").setContentIntent(open).setAutoCancel(true).build();
                        context.getSystemService(NotificationManager.class).notify(21, notice);
                        prefs.edit().putString("last",key).apply();
                    }
                } catch (JSONException e) { Log.e("BirthdayPost","Invalid saved reminder data",e); }
            }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when.toInstant().toEpochMilli(), tick);
    }
    @Override public void onReceive(Context context, Intent intent) { refresh(context); }
}
