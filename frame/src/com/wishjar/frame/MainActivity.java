package com.wishjar.frame;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
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
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
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
 * - Photos sent to the frame with the Frameo phone app are served under /frameo/ for the page's
 *   photo picker (serveFrameo). The page uses them when /frame/config.js says so, which
 *   build.sh writes: on, unless built with FRAMEO_PHOTOS=0.
 * - Remote debugging is off unless launched with the debug extra:
 *     adb shell am start -n com.wishjar.frame/.MainActivity --ez debug true
 */
public class MainActivity extends Activity {
  static final String TAG = "WishJarFrame";
  static final String HOST = "appassets.androidplatform.net";
  static final String START_URL = "https://" + HOST + "/";
  static final String FRAMEO = "net.frameo.frame";
  static final int PICK_FILE = 1;
  static final int READ_PHOTOS = 2;
  static final long CONTROLS_HOLD_MS = 1500;
  static final float CONTROLS_SLOP_PX = 60;
  // Where Frameo keeps the photos it receives. A .nomedia file hides them from the media index.
  static final File FRAMEO_PHOTOS = new File(Environment.getExternalStorageDirectory(), "frameo_files/media");
  static final int MAX_PHOTOS = 60;

  private WebView web;
  private FrameLayout root;
  private final Rect visible = new Rect();
  private ValueCallback<Uri[]> pendingFiles;
  private volatile boolean askingForPhotos;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] holdIds = new int[2];
  private final float[] holdX = new float[2];
  private final float[] holdY = new float[2];
  private boolean holdArmed;

  private final Runnable showControls = new Runnable() {
    @Override
    public void run() {
      holdArmed = false;
      new AlertDialog.Builder(MainActivity.this)
          .setTitle("Wish Jar")
          .setItems(new String[] {"Open Frameo", "Android settings", "Reload Wish Jar"}, (dialog, which) -> {
            if (which == 0) openFrameo();
            else if (which == 1) startActivity(new Intent(Settings.ACTION_SETTINGS));
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

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) return null;
        List<String> segments = url.getPathSegments();
        if (!segments.isEmpty() && "frameo".equals(segments.get(0))) return serveFrameo(url);
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

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
    // The page's photo picker refreshes every few seconds, so it picks the answer up by itself.
    if (requestCode == READ_PHOTOS) askingForPhotos = false;
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
   * The photos sent to the frame with the Frameo phone app, for the page's photo picker
   * (src/photos/frameo.ts):
   *   /frameo/photos               the newest ones first, as [{"name": "…", "time": <ms>}]
   *   /frameo/photos/<name>?size=N  one of them upright, cropped square and N px wide, as JPEG
   * Both answer 403 until Wish Jar may read shared storage. /frameo/photos?ask=1 also asks for
   * that permission; the picker passes it when it opens, so a "Deny" isn't asked again on every
   * refresh.
   */
  private WebResourceResponse serveFrameo(Uri url) {
    List<String> segments = url.getPathSegments();
    boolean list = segments.size() == 2 && "photos".equals(segments.get(1));
    boolean photo = segments.size() == 3 && "photos".equals(segments.get(1));
    if (!list && !photo) return json(404, "Not Found", "{\"error\":\"not found\"}");

    if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
      if (list && "1".equals(url.getQueryParameter("ask")) && !askingForPhotos) {
        askingForPhotos = true;
        runOnUiThread(() -> requestPermissions(
            new String[] {Manifest.permission.READ_EXTERNAL_STORAGE}, READ_PHOTOS));
      }
      return json(403, "Forbidden", "{\"error\":\"permission\"}");
    }
    if (list) return json(200, "OK", listPhotos());

    String name = segments.get(2);
    int size = 512;
    try {
      size = Math.max(64, Math.min(1024, Integer.parseInt(url.getQueryParameter("size"))));
    } catch (NumberFormatException e) {
      // No size or a bad one: keep the default.
    }
    // A name is one file straight in Frameo's folder, never a path out of it.
    byte[] jpeg = name.contains("/") || name.startsWith(".")
        ? null : squarePhoto(new File(FRAMEO_PHOTOS, name), size);
    if (jpeg == null) return json(404, "Not Found", "{\"error\":\"not found\"}");
    return new WebResourceResponse("image/jpeg", null, 200, "OK", headers(), new ByteArrayInputStream(jpeg));
  }

  /** Frameo's photos, newest first, skipping videos and anything else that isn't an image. */
  private static String listPhotos() {
    File[] files = FRAMEO_PHOTOS.listFiles();
    if (files == null) files = new File[0];
    Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
    StringBuilder out = new StringBuilder("[");
    int count = 0;
    for (File file : files) {
      if (count == MAX_PHOTOS) break;
      if (!file.isFile() || file.getName().startsWith(".")) continue;
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(file.getPath(), bounds);
      if (bounds.outWidth <= 0) continue;
      if (count++ > 0) out.append(',');
      out.append("{\"name\":").append(JSONObject.quote(file.getName()))
          .append(",\"time\":").append(file.lastModified()).append('}');
    }
    return out.append(']').toString();
  }

  /**
   * The photo turned upright, centre-cropped to a square and scaled down to size px, as JPEG:
   * what the app keeps for a kid or an icon. Decoded at the smallest power-of-two sample that is
   * still big enough, so a large photo never has to fit in memory whole.
   */
  private static byte[] squarePhoto(File file, int size) {
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(file.getPath(), options);
    if (options.outWidth <= 0) return null;
    int side = Math.min(options.outWidth, options.outHeight);
    options.inJustDecodeBounds = false;
    options.inSampleSize = 1;
    while (side / (options.inSampleSize * 2) >= size) options.inSampleSize *= 2;
    Bitmap decoded = BitmapFactory.decodeFile(file.getPath(), options);
    if (decoded == null) return null;

    int crop = Math.min(decoded.getWidth(), decoded.getHeight());
    float scale = Math.min(1f, (float) size / crop);
    Matrix matrix = new Matrix();
    matrix.postScale(scale, scale);
    matrix.postRotate(exifRotation(file));
    Bitmap square = Bitmap.createBitmap(decoded, (decoded.getWidth() - crop) / 2,
        (decoded.getHeight() - crop) / 2, crop, crop, matrix, true);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    square.compress(Bitmap.CompressFormat.JPEG, 85, out);
    if (square != decoded) square.recycle();
    decoded.recycle();
    return out.toByteArray();
  }

  private static int exifRotation(File file) {
    try {
      switch (new ExifInterface(file.getPath()).getAttributeInt(
          ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        case ExifInterface.ORIENTATION_ROTATE_90: return 90;
        case ExifInterface.ORIENTATION_ROTATE_180: return 180;
        case ExifInterface.ORIENTATION_ROTATE_270: return 270;
        default: return 0;
      }
    } catch (IOException e) {
      return 0;
    }
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
      default: return "application/octet-stream";
    }
  }

  private void openFrameo() {
    Intent frameo = getPackageManager().getLaunchIntentForPackage(FRAMEO);
    startActivity(frameo != null ? frameo : new Intent(Settings.ACTION_SETTINGS));
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
  protected void onPause() {
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
    web.destroy();
    super.onDestroy();
  }
}
