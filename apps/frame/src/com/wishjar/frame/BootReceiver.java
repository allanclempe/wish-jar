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
 * Opens Wish Jar after the frame restarts. Frameo is the frame's home screen, so it is what comes
 * up, and Frameo's own boot receiver may bring it to the front again a little later. So rather than
 * starting Wish Jar once, this checks at each of CHECKS_MS and starts Wish Jar whenever it isn't in
 * front.
 *
 * The frame's firmware (Allwinner's BackgroundManagerService) only sends BOOT_COMPLETED to the apps
 * on a list built into the system image, so on this frame it never reaches Wish Jar. The storage
 * being mounted and the network connecting do, and both happen on every boot, so any of the three
 * starts the checks: the first one within BOOT_WINDOW_MS of boot, once per boot. The network
 * connecting again later in the day does nothing.
 *
 * Opening Frameo or Android settings from Wish Jar's menu calls cancel, so those stay in front.
 */
public class BootReceiver extends BroadcastReceiver {
  static final long[] CHECKS_MS = {5_000, 30_000, 60_000, 120_000};
  static final long BOOT_WINDOW_MS = 10 * 60_000;
  private static final String CHECK = "com.wishjar.frame.BOOT_CHECK";
  private static final String PREFS = "boot";
  private static final String HANDLED_BOOT = "handledBoot";
  private static final String STARTED_AT = "startedAt";
  private static final String NEXT = "next";

  /** Stops the checks for this boot. */
  static void cancel(Context context) {
    alarms(context).cancel(alarm(context));
    prefs(context).edit().remove(STARTED_AT).remove(NEXT).apply();
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    SharedPreferences prefs = prefs(context);
    if (!CHECK.equals(intent.getAction())) {
      String boot = bootId();
      if (SystemClock.elapsedRealtime() > BOOT_WINDOW_MS || boot.equals(prefs.getString(HANDLED_BOOT, null))) return;
      Log.i(MainActivity.TAG, "Frame booted (" + intent.getAction() + "): opening Wish Jar");
      prefs.edit().putString(HANDLED_BOOT, boot)
          .putLong(STARTED_AT, SystemClock.elapsedRealtime()).putInt(NEXT, 0).apply();
      schedule(context, prefs);
      return;
    }
    if (!prefs.contains(STARTED_AT)) return;
    if (!MainActivity.resumed) {
      Log.i(MainActivity.TAG, "Wish Jar isn't in front after boot: starting it");
      context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
    int next = prefs.getInt(NEXT, 0) + 1;
    if (next >= CHECKS_MS.length) {
      cancel(context);
      return;
    }
    prefs.edit().putInt(NEXT, next).apply();
    schedule(context, prefs);
  }

  /**
   * Tells boots apart: ro.runtime.firstboot is the wall-clock time system_server started, set once
   * per boot. Falls back to the boot's own wall-clock time to the minute.
   */
  /** Tells one boot of the frame from the next. */
  static String bootId() {
    try {
      String id = (String) Class.forName("android.os.SystemProperties")
          .getMethod("get", String.class).invoke(null, "ro.runtime.firstboot");
      if (id != null && !id.isEmpty()) return id;
    } catch (ReflectiveOperationException e) {
      Log.w(MainActivity.TAG, "No ro.runtime.firstboot", e);
    }
    return String.valueOf((System.currentTimeMillis() - SystemClock.elapsedRealtime()) / 60_000);
  }

  private static void schedule(Context context, SharedPreferences prefs) {
    long at = prefs.getLong(STARTED_AT, 0) + CHECKS_MS[prefs.getInt(NEXT, 0)];
    alarms(context).setExact(AlarmManager.ELAPSED_REALTIME, at, alarm(context));
  }

  private static PendingIntent alarm(Context context) {
    return PendingIntent.getBroadcast(context, 0,
        new Intent(context, BootReceiver.class).setAction(CHECK), PendingIntent.FLAG_UPDATE_CURRENT);
  }

  private static AlarmManager alarms(Context context) {
    return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
  }

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
