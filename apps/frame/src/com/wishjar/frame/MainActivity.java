package com.wishjar.frame;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
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
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Full-screen Wish Jar for a Frameo photo frame (Android 6, WebView 106).
 *
 * The frame opens the online site, as the Echo Show does, so every deploy reaches it the next time
 * the page loads, with no new APK (WJ-69). ?host=frameo tells the page it runs on the frame
 * (apps/mobile/src/device/host.ts): photos come from a phone through the API, and the family jar's photos
 * show as a slideshow while nobody is using Wish Jar. The family jar is online; this app's WebView
 * storage keeps the frame's place in it, so uninstalling the app means joining again with a code.
 *
 * - Until the page loads (at boot, Wi-Fi comes up after Wish Jar opens), a waiting page shows, and
 *   the load is tried again when the network connects and every RETRY_MS (retryLoad).
 * - The page is shrunk to the space above the keyboard (fitAboveKeyboard), so a focused input
 *   scrolls into view instead of hiding behind it.
 * - Hold two fingers still on the screen for 1.5 s to open the Frameo app, Android settings or reload.
 * - Wish Jar opens by itself after the frame restarts, in front of Frameo (BootReceiver).
 * - Remote debugging is off unless launched with the debug extra:
 *     adb shell am start -n com.wishjar.frame/.MainActivity --ez debug true
 */
public class MainActivity extends Activity {
  static final String TAG = "WishJarFrame";
  static final String HOST = "wish-jar.blastin.dev";
  static final String START_URL = "https://" + HOST + "/?host=frameo";
  static final String FRAMEO = "net.frameo.frame";
  static final int PICK_FILE = 1;
  static final long CONTROLS_HOLD_MS = 1500;
  static final float CONTROLS_SLOP_PX = 60;
  static final long RETRY_MS = 30_000;
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
  // The site couldn't be reached, and the waiting page is up.
  private boolean offline;

  private final Runnable retry = this::load;

  // A network connecting is the moment the site can be reached again.
  private final ConnectivityManager.NetworkCallback networkUp = new ConnectivityManager.NetworkCallback() {
    @Override
    public void onAvailable(Network network) {
      handler.post(() -> {
        if (offline) load();
      });
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
            else load();
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

    connectivity().registerNetworkCallback(new NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkUp);

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
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // Everything stays inside the app: no browser to hand links to on the frame.
        return !HOST.equals(request.getUrl().getHost());
      }

      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) retryLoad("error " + error.getErrorCode() + " " + error.getDescription());
      }

      @Override
      public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        if (request.isForMainFrame() && response.getStatusCode() >= 500) {
          retryLoad("HTTP " + response.getStatusCode());
        }
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
    if (state == null || web.restoreState(state) == null) load();
  }

  private void load() {
    handler.removeCallbacks(retry);
    offline = false;
    web.loadUrl(START_URL);
  }

  /**
   * The site couldn't be reached: at boot, Wi-Fi comes up after Wish Jar opens. Shows a waiting page
   * in place of WebView's error page, and tries again when a network connects or after RETRY_MS.
   */
  private void retryLoad(String why) {
    Log.i(TAG, "Couldn't load Wish Jar (" + why + "): trying again");
    if (!offline) {
      offline = true;
      web.loadDataWithBaseURL(null, WAITING_PAGE, "text/html", "UTF-8", null);
    }
    handler.removeCallbacks(retry);
    handler.postDelayed(retry, RETRY_MS);
  }

  private static final String WAITING_PAGE = "<!doctype html><meta name=viewport content=\"width=device-width\">"
      + "<body style=\"margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
      + "background:#FFF8F0;color:#8A7A7C;font:24px sans-serif\">Wish Jar is waiting for the internet\u2026";

  private ConnectivityManager connectivity() {
    return (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
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
    connectivity().unregisterNetworkCallback(networkUp);
    web.destroy();
    super.onDestroy();
  }
}
