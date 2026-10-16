package com.wishjar.frame;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The frame's timezone. Frameo frames come set to a factory timezone (America/New_York on ours),
 * and Android only detects it from a mobile network, which a frame doesn't have. Wish Jar starts
 * each day by the frame's clock (src/tasks/day.ts), so the kids' ticks would reset mid-day.
 *
 * - Until a timezone has been set, Wish Jar looks it up from the frame's IP address each time it
 *   comes to the front (detect), and sets it.
 * - A grown-up can pick another in Settings, which the page sends as
 *   POST /device/timezone?zone=… (MainActivity.serveDevice). A lookup never overrides it.
 *
 * Setting it needs root: SET_TIME_ZONE is only granted to system apps. The page's clock follows the
 * change straight away, with no reload.
 */
final class FrameTimeZone {
  // Free with no key, commercial use allowed, 1,000 requests a day. Answers {"timezone":{"id":…}}.
  private static final String LOOKUP_URL = "https://ipwho.is/?fields=timezone";
  private static final int TIMEOUT_MS = 10000;
  private static final String PREFS = "timezone";
  private static final String SET = "set";
  private static final AtomicBoolean detecting = new AtomicBoolean();

  private FrameTimeZone() {}

  /** Looks the timezone up and sets it, in the background, unless one has been set already. */
  static void detect(Context context) {
    Context app = context.getApplicationContext();
    if (prefs(app).getBoolean(SET, false) || !detecting.compareAndSet(false, true)) return;
    new Thread(() -> {
      try {
        String zone = lookUp();
        if (zone != null) set(app, zone, true);
      } finally {
        detecting.set(false);
      }
    }, "detect-timezone").start();
  }

  /**
   * Sets the frame's timezone, an IANA id such as "Australia/Brisbane". A detected one is skipped
   * once a timezone has been set, so it can't undo a grown-up's choice made while it was looked up.
   */
  static synchronized boolean set(Context context, String zone, boolean detected) {
    SharedPreferences prefs = prefs(context.getApplicationContext());
    if (detected && prefs.getBoolean(SET, false)) return false;
    if (!Arrays.asList(TimeZone.getAvailableIDs()).contains(zone)) {
      Log.w(MainActivity.TAG, "Unknown timezone " + zone);
      return false;
    }
    try {
      // Transaction 3 of Android 6's IAlarmManager is setTimeZone, which also tells every app.
      Process su = new ProcessBuilder("su", "0", "service", "call", "alarm", "3", "s16", zone)
          .redirectErrorStream(true).start();
      String out = read(su.getInputStream());
      // "Result: Parcel(00000000 …)": the call returned without an exception.
      if (su.waitFor() != 0 || !out.contains("Parcel(00000000")) {
        Log.w(MainActivity.TAG, "Could not set the timezone to " + zone + ": " + out.trim());
        return false;
      }
    } catch (IOException e) {
      Log.w(MainActivity.TAG, "Could not set the timezone to " + zone, e);
      return false;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    }
    prefs.edit().putBoolean(SET, true).apply();
    Log.i(MainActivity.TAG, "Timezone set to " + zone + (detected ? " (detected)" : ""));
    return true;
  }

  /** The timezone of the frame's IP address, or null when offline or the lookup fails. */
  private static String lookUp() {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(LOOKUP_URL).openConnection();
      connection.setConnectTimeout(TIMEOUT_MS);
      connection.setReadTimeout(TIMEOUT_MS);
      if (connection.getResponseCode() != 200) {
        Log.w(MainActivity.TAG, "Timezone lookup: HTTP " + connection.getResponseCode());
        return null;
      }
      JSONObject timezone = new JSONObject(read(connection.getInputStream())).optJSONObject("timezone");
      String zone = timezone == null ? "" : timezone.optString("id");
      return zone.isEmpty() ? null : zone;
    } catch (IOException | JSONException e) {
      Log.w(MainActivity.TAG, "Timezone lookup failed", e);
      return null;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private static String read(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[8192];
    for (int n; (n = in.read(buf)) != -1; ) out.write(buf, 0, n);
    in.close();
    return new String(out.toByteArray(), StandardCharsets.UTF_8);
  }

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
