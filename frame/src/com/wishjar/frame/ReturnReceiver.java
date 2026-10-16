package com.wishjar.frame;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.util.Log;

/**
 * Brings Wish Jar back from Frameo after "Connect a phone" (MainActivity.connectPhone). Frameo is
 * the frame's home screen and has no way to open another app, so without this the frame would
 * stay in Frameo. Every CHECK_MS it looks for a new photo, which is what the trip was for, and
 * returns as soon as one arrives, or after GIVE_UP_MS whatever happens.
 *
 * An alarm rather than a timer in the activity: in low-RAM mode Android may stop Wish Jar's
 * process while Frameo is in front, and the alarm still fires. MainActivity.onResume cancels it,
 * however Wish Jar comes back.
 */
public class ReturnReceiver extends BroadcastReceiver {
  static final long CHECK_MS = 15_000;
  static final long GIVE_UP_MS = 5 * 60_000;
  private static final String PREFS = "return";
  private static final String LEFT_AT = "leftAt";
  private static final String NEWEST_PHOTO = "newestPhoto";

  /** Starts watching, just before Wish Jar opens Frameo. */
  static void start(Context context) {
    prefs(context).edit()
        .putLong(LEFT_AT, SystemClock.elapsedRealtime())
        .putLong(NEWEST_PHOTO, MainActivity.newestPhotoTime())
        .apply();
    schedule(context);
  }

  static void cancel(Context context) {
    alarms(context).cancel(alarm(context));
    prefs(context).edit().clear().apply();
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    SharedPreferences prefs = prefs(context);
    if (!prefs.contains(LEFT_AT)) return;
    boolean newPhoto = MainActivity.newestPhotoTime() > prefs.getLong(NEWEST_PHOTO, 0);
    boolean gaveUp = SystemClock.elapsedRealtime() - prefs.getLong(LEFT_AT, 0) >= GIVE_UP_MS;
    if (!newPhoto && !gaveUp) {
      schedule(context);
      return;
    }
    Log.i(MainActivity.TAG, "Back from Frameo: " + (newPhoto ? "a new photo arrived" : "timed out"));
    cancel(context);
    context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  }

  private static void schedule(Context context) {
    alarms(context).setExact(AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + CHECK_MS, alarm(context));
  }

  private static PendingIntent alarm(Context context) {
    return PendingIntent.getBroadcast(context, 0, new Intent(context, ReturnReceiver.class),
        PendingIntent.FLAG_UPDATE_CURRENT);
  }

  private static AlarmManager alarms(Context context) {
    return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
  }

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
