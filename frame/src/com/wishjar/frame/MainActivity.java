package com.wishjar.frame;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Full-screen Wish Jar for a Frameo photo frame (Android 6, WebView 106).
 *
 * The web export is bundled under assets/www and served from the origin Android reserves for app
 * assets. It is HTTPS, so the page is a secure context, and every response carries COOP/COEP so
 * the page is cross-origin isolated: expo-sqlite needs both for OPFS and SharedArrayBuffer. The
 * database lives in this app's WebView storage, so uninstalling the app deletes it.
 *
 * - The page is shrunk to the space above the keyboard (fitAboveKeyboard), so a focused input
 *   scrolls into view instead of hiding behind it.
 * - Hold two fingers still on the screen for 1.5 s to open the Frameo app, Android settings or reload.
 * - Every page gets /frame/config.js, which build.sh writes: window.wishJarFrame tells the page
 *   it runs on the frame (src/device/frame.ts), so photos come from a phone through the relay and
 *   the family jar's photos show as a slideshow while nobody is using Wish Jar.
 * - The frame's timezone is looked up from its IP address until one is set, and grown-ups can
 *   change it in Settings through /device/timezone (FrameTimeZone, serveDevice). It is set again
 *   after Frameo puts back its own at boot.
 * - Wish Jar opens by itself after the frame restarts, in front of Frameo (BootReceiver).
 * - Remote debugging is off unless launched with the debug extra:
 *     adb shell am start -n com.wishjar.frame/.MainActivity --ez debug true
 */
public class MainActivity extends Activity {
  static final String TAG = "WishJarFrame";
  static final String HOST = "appassets.androidplatform.net";
  static final String START_URL = "https://" + HOST + "/";
  static final String FRAMEO = "net.frameo.frame";
  static final int PICK_FILE = 1;
  static final long CONTROLS_HOLD_MS = 1500;
  static final float CONTROLS_SLOP_PX = 60;
  // Whether Wish Jar is in front, for BootReceiver.
  static volatile boolean resumed;

  private WebView web;
  private FrameLayout root;
  private final Rect visible = new Rect();
  private ValueCallback<Uri[]> pendingFiles;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] holdIds = new int[2];
  private final float[] holdX = new float[2];
  private final float[] holdY = new float[2];
  private boolean holdArmed;

  // Frameo sets its own timezone a few seconds after boot, which can be after Wish Jar is open.
  private final BroadcastReceiver timeZoneChanged = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      FrameTimeZone.restore(context);
    }
  };

  private final Runnable showControls = new Runnable() {
    @Override
    public void run() {
      holdArmed = false;
      new AlertDialog.Builder(MainActivity.this)
          .setTitle("Wish Jar")
          .setItems(new String[] {"Open Frameo", "Android settings", "Reload Wish Jar"}, (dialog, which) -> {
            if (which == 0) confirmOpenFrameo();
            else if (which == 1) openSettings();
            else web.reload();
          })
          .setNegativeButton("Back to Wish Jar", null).show();
    }
  };

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    applyDebugFlag(getIntent());
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_FULLSCREEN);

    registerReceiver(timeZoneChanged, new IntentFilter(Intent.ACTION_TIMEZONE_CHANGED));

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    // Cloudflare's Turnstile widget, which starting a family needs (WJ-54),
    // runs in a frame from challenges.cloudflare.com and keeps its cookies
    // there; Android's WebView turns third-party cookies away by default.
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) return null;
        List<String> segments = url.getPathSegments();
        if (!segments.isEmpty() && "device".equals(segments.get(0))) return serveDevice(request);
        return serveAsset(url.getPath());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // Everything stays inside the app: no browser to hand links to on the frame.
        return !HOST.equals(request.getUrl().getHost());
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (pendingFiles != null) pendingFiles.onReceiveValue(null);
        pendingFiles = callback;
        try {
          startActivityForResult(params.createIntent(), PICK_FILE);
          return true;
        } catch (ActivityNotFoundException e) {
          Log.w(TAG, "No app to pick files with", e);
          pendingFiles = null;
          return false;
        }
      }
    });
    root = new FrameLayout(this);
    root.addView(web);
    root.getViewTreeObserver().addOnGlobalLayoutListener(this::fitAboveKeyboard);
    setContentView(root);
    if (state == null) web.loadUrl(START_URL);
    else web.restoreState(state);
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    super.onSaveInstanceState(state);
    web.saveState(state);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    applyDebugFlag(intent);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode != PICK_FILE || pendingFiles == null) return;
    pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
    pendingFiles = null;
  }

  /**
   * A full-screen window is never resized for the keyboard (adjustResize is ignored with
   * FLAG_FULLSCREEN), so the keyboard would cover the bottom of the page. Size the WebView to the
   * part of the window the keyboard leaves visible; WebView then scrolls the focused input into it.
   */
  private void fitAboveKeyboard() {
    root.getWindowVisibleDisplayFrame(visible);
    int[] origin = new int[2];
    root.getLocationOnScreen(origin);
    int available = visible.bottom - origin[1];
    int height = available < root.getHeight() ? available : ViewGroup.LayoutParams.MATCH_PARENT;
    ViewGroup.LayoutParams params = web.getLayoutParams();
    if (params.height != height) {
      Log.i(TAG, "Page height " + height + " (visible bottom " + visible.bottom + ", top " + origin[1]
          + ", window " + root.getHeight() + ")");
      params.height = height;
      web.setLayoutParams(params);
    }
  }

  /**
   * Maps a request path onto the static export the way a web host would: /kids is kids.html,
   * /(tabs)/ is (tabs)/index.html, and an unknown page is +not-found.html with a 404.
   */
  private WebResourceResponse serveAsset(String path) {
    if (path == null || path.isEmpty()) path = "/";
    if (path.contains("..")) return response("+not-found.html", 404, "Not Found");
    String file = path.substring(1);
    String[] candidates = path.endsWith("/")
        ? new String[] {file + "index.html"}
        : new String[] {file, file + ".html", file + "/index.html"};
    for (String candidate : candidates) {
      WebResourceResponse found = response(candidate, 200, "OK");
      if (found != null) return found;
    }
    return response("+not-found.html", 404, "Not Found");
  }

  private WebResourceResponse response(String file, int status, String reason) {
    InputStream in;
    try {
      in = getAssets().open("www/" + file);
    } catch (IOException e) {
      return null;
    }
    String mime = mimeType(file);
    if ("text/html".equals(mime)) {
      try {
        in = withFrameAssets(in);
      } catch (IOException e) {
        Log.w(TAG, "Could not read " + file, e);
        return null;
      }
    }
    return new WebResourceResponse(mime, null, status, reason, headers(), in);
  }

  private static Map<String, String> headers() {
    Map<String, String> headers = new HashMap<>();
    headers.put("Cross-Origin-Opener-Policy", "same-origin");
    headers.put("Cross-Origin-Embedder-Policy", "credentialless");
    headers.put("Cross-Origin-Resource-Policy", "same-origin");
    headers.put("Cache-Control", "no-cache");
    return headers;
  }

  /**
   * The frame's own settings, for the page's Settings (src/device/frame.ts):
   *   POST /device/timezone?zone=<IANA id>  sets the frame's timezone (FrameTimeZone.set)
   * The page reads the current timezone itself, from Intl.
   */
  private WebResourceResponse serveDevice(WebResourceRequest request) {
    Uri url = request.getUrl();
    List<String> segments = url.getPathSegments();
    if (segments.size() != 2 || !"timezone".equals(segments.get(1))) {
      return json(404, "Not Found", "{\"error\":\"not found\"}");
    }
    if (!"POST".equals(request.getMethod())) return json(405, "Method Not Allowed", "{\"error\":\"POST only\"}");
    String zone = url.getQueryParameter("zone");
    if (zone == null || !FrameTimeZone.set(this, zone, false)) {
      return json(400, "Bad Request", "{\"error\":\"could not set the timezone\"}");
    }
    return json(200, "OK", "{\"zone\":" + JSONObject.quote(zone) + "}");
  }

  private static WebResourceResponse json(int status, String reason, String body) {
    return new WebResourceResponse("application/json", "UTF-8", status, reason, headers(),
        new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
  }

  /**
   * Adds the frame's own stylesheet (Twemoji, no text selection; see web/frame.css) and settings
   * (config.js, written by build.sh) to a page. The settings run before the app's deferred bundle.
   */
  private static InputStream withFrameAssets(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[8192];
    for (int n; (n = in.read(buf)) != -1; ) out.write(buf, 0, n);
    in.close();
    String html = out.toString("UTF-8").replaceFirst("</head>",
        "<link rel=\"stylesheet\" href=\"/frame/frame.css\">"
            + "<script src=\"/frame/config.js\"></script></head>");
    return new ByteArrayInputStream(html.getBytes("UTF-8"));
  }

  private static String mimeType(String file) {
    String ext = file.substring(file.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
      case "html": return "text/html";
      case "js": return "text/javascript";
      case "json": return "application/json";
      case "wasm": return "application/wasm";
      case "css": return "text/css";
      case "png": return "image/png";
      case "jpg": case "jpeg": return "image/jpeg";
      case "svg": return "image/svg+xml";
      case "ico": return "image/x-icon";
      case "ttf": return "font/ttf";
      case "woff2": return "font/woff2";
      case "ogg": return "audio/ogg";
      case "mp3": return "audio/mpeg";
      case "wav": return "audio/wav";
      case "m4a": return "audio/mp4";
      default: return "application/octet-stream";
    }
  }

  private void openFrameo() {
    Intent frameo = getPackageManager().getLaunchIntentForPackage(FRAMEO);
    startActivity(frameo != null ? frameo : new Intent(Settings.ACTION_SETTINGS));
  }

  /** Opening Frameo from the menu is for staying there, so nothing brings Wish Jar back. */
  private void confirmOpenFrameo() {
    new AlertDialog.Builder(this)
        .setTitle("Open Frameo?")
        .setMessage("Frameo can't open other apps, so the frame stays in Frameo until Wish Jar is "
            + "started again (adb shell am start -n com.wishjar.frame/.MainActivity) or the frame "
            + "restarts.")
        .setPositiveButton("Open Frameo", (dialog, which) -> {
          BootReceiver.cancel(this);
          openFrameo();
        })
        .setNegativeButton("Back to Wish Jar", null).show();
  }

  /** Android settings from the menu, which BootReceiver mustn't cover just after a restart. */
  private void openSettings() {
    BootReceiver.cancel(this);
    startActivity(new Intent(Settings.ACTION_SETTINGS));
  }

  /** Remote debugging only when explicitly requested; any normal launch turns it back off. */
  private void applyDebugFlag(Intent intent) {
    boolean debug = intent != null && intent.getBooleanExtra("debug", false);
    WebView.setWebContentsDebuggingEnabled(debug);
    Log.i(TAG, "WebView remote debugging " + (debug ? "ON" : "off"));
  }

  /** Watches for the two-finger controls hold; all touches still go to the page. */
  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_POINTER_DOWN:
        if (e.getPointerCount() == 2) {
          for (int i = 0; i < 2; i++) {
            holdIds[i] = e.getPointerId(i);
            holdX[i] = e.getX(i);
            holdY[i] = e.getY(i);
          }
          holdArmed = true;
          handler.removeCallbacks(showControls);
          handler.postDelayed(showControls, CONTROLS_HOLD_MS);
        } else {
          cancelHold();
        }
        break;
      case MotionEvent.ACTION_MOVE:
        if (holdArmed) {
          for (int i = 0; i < 2; i++) {
            int idx = e.findPointerIndex(holdIds[i]);
            if (idx < 0 || Math.hypot(e.getX(idx) - holdX[i], e.getY(idx) - holdY[i]) > CONTROLS_SLOP_PX) {
              cancelHold();
              break;
            }
          }
        }
        break;
      case MotionEvent.ACTION_POINTER_UP:
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        cancelHold();
        break;
      default:
        break;
    }
    return super.dispatchTouchEvent(e);
  }

  private void cancelHold() {
    if (!holdArmed) return;
    holdArmed = false;
    handler.removeCallbacks(showControls);
  }

  @Override
  protected void onResume() {
    super.onResume();
    resumed = true;
    FrameTimeZone.detect(this); // until one is set: a new frame may only now be online
    FrameTimeZone.restore(this); // after Frameo set its own at boot
  }

  @Override
  protected void onPause() {
    resumed = false;
    cancelHold();
    super.onPause();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUi();
  }

  private void hideSystemUi() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
  }

  @Override
  protected void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    unregisterReceiver(timeZoneChanged);
    web.destroy();
    super.onDestroy();
  }
}
