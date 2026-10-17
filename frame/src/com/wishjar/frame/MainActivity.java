package com.wishjar.frame;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
 *   build.sh writes: on, unless built with FRAMEO_PHOTOS=0. The same setting turns on the page's
 *   slideshow of them while nobody is using Wish Jar.
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
  static final int READ_PHOTOS = 2;
  static final long CONTROLS_HOLD_MS = 1500;
  static final float CONTROLS_SLOP_PX = 60;
  // Where Frameo keeps the photos it receives. A .nomedia file hides them from the media index.
  static final File FRAMEO_PHOTOS = new File(Environment.getExternalStorageDirectory(), "frameo_files/media");
  static final int MAX_PHOTOS = 60;
  // Whether Wish Jar is in front, for BootReceiver.
  static volatile boolean resumed;

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
        if (!segments.isEmpty() && "frameo".equals(segments.get(0))) return serveFrameo(url);
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
   *   /frameo/photos/<name>?width=W&height=H  the whole photo upright, fitted inside W x H, as
   *                                 JPEG; with &fit=cover, filling W x H and cropped to it from
   *                                 the middle: for the idle slideshow (src/photos/Slideshow.tsx)
   *   POST /frameo/connect          opens Frameo to add a friend, and comes back (connectPhone)
   * The photo routes answer 403 until Wish Jar may read shared storage. /frameo/photos?ask=1 also
   * asks for that permission; the picker passes it when it opens, so a "Deny" isn't asked again on
   * every refresh.
   */
  private WebResourceResponse serveFrameo(Uri url) {
    List<String> segments = url.getPathSegments();
    if (segments.size() == 2 && "connect".equals(segments.get(1))) {
      runOnUiThread(this::connectPhone);
      return json(200, "OK", "{\"ok\":true}");
    }
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
    // A name is one file straight in Frameo's folder, never a path out of it.
    File file = name.contains("/") || name.startsWith(".") ? null : new File(FRAMEO_PHOTOS, name);
    int width = intParameter(url, "width", 0, 64, 1920);
    int height = intParameter(url, "height", 0, 64, 1920);
    byte[] jpeg = file == null ? null
        : width > 0 && height > 0 ? wholePhoto(file, width, height, "cover".equals(url.getQueryParameter("fit")))
        : squarePhoto(file, intParameter(url, "size", 512, 64, 1024));
    if (jpeg == null) return json(404, "Not Found", "{\"error\":\"not found\"}");
    return new WebResourceResponse("image/jpeg", null, 200, "OK", headers(), new ByteArrayInputStream(jpeg));
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

  /** Up to max of Frameo's photos, newest first, skipping videos and anything else that isn't an image. */
  private static List<File> photos(int max) {
    File[] files = FRAMEO_PHOTOS.listFiles();
    if (files == null) files = new File[0];
    Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
    List<File> photos = new ArrayList<>();
    for (File file : files) {
      if (photos.size() == max) break;
      if (!file.isFile() || file.getName().startsWith(".")) continue;
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(file.getPath(), bounds);
      if (bounds.outWidth > 0) photos.add(file);
    }
    return photos;
  }

  /** When the newest of Frameo's photos arrived, or 0 with none (or no permission to look). */
  static long newestPhotoTime() {
    List<File> newest = photos(1);
    return newest.isEmpty() ? 0 : newest.get(0).lastModified();
  }

  private static String listPhotos() {
    StringBuilder out = new StringBuilder("[");
    for (File file : photos(MAX_PHOTOS)) {
      if (out.length() > 1) out.append(',');
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

  /**
   * The whole photo turned upright and scaled down to fit inside width x height px, as JPEG: a
   * slideshow slide. With cover, scaled down to fill width x height instead and cropped to it
   * from the middle. Decoded at a power-of-two sample like squarePhoto, so it never has to fit in
   * memory at full size.
   */
  private static byte[] wholePhoto(File file, int width, int height, boolean cover) {
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(file.getPath(), options);
    if (options.outWidth <= 0) return null;
    int rotation = exifRotation(file);
    boolean sideways = rotation == 90 || rotation == 270;
    // The box in the photo's own orientation, before it's turned upright.
    int boxWidth = sideways ? height : width;
    int boxHeight = sideways ? width : height;
    float fit = Math.min(1f, pick(cover, (float) boxWidth / options.outWidth, (float) boxHeight / options.outHeight));
    options.inJustDecodeBounds = false;
    options.inSampleSize = 1;
    while (fit * options.inSampleSize * 2 <= 1) options.inSampleSize *= 2;
    Bitmap decoded = BitmapFactory.decodeFile(file.getPath(), options);
    if (decoded == null) return null;

    float scale = Math.min(1f,
        pick(cover, (float) boxWidth / decoded.getWidth(), (float) boxHeight / decoded.getHeight()));
    Matrix matrix = new Matrix();
    matrix.postScale(scale, scale);
    matrix.postRotate(rotation);
    Bitmap slide = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
    if (slide != decoded) decoded.recycle();
    if (cover) {
      // Only what shows on screen: the page centres the slide and covers the screen with it.
      int cropWidth = Math.min(width, slide.getWidth());
      int cropHeight = Math.min(height, slide.getHeight());
      Bitmap cropped = Bitmap.createBitmap(slide, (slide.getWidth() - cropWidth) / 2,
          (slide.getHeight() - cropHeight) / 2, cropWidth, cropHeight);
      if (cropped != slide) slide.recycle();
      slide = cropped;
    }
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    slide.compress(Bitmap.CompressFormat.JPEG, 85, out);
    slide.recycle();
    return out.toByteArray();
  }

  /** The scale that fills the box (cover) or fits inside it, from the scales for each side. */
  private static float pick(boolean cover, float widthScale, float heightScale) {
    return cover ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);
  }

  /** A whole-number query parameter clamped to min..max, or fallback when it's missing or bad. */
  private static int intParameter(Uri url, String name, int fallback, int min, int max) {
    try {
      return Math.max(min, Math.min(max, Integer.parseInt(url.getQueryParameter(name))));
    } catch (NumberFormatException e) {
      return fallback;
    }
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

  /**
   * "Connect a phone" in the photo picker: Frameo's Add friend gives the code the phone app needs.
   * Frameo can't open other apps, so ReturnReceiver brings Wish Jar back once the new friend's
   * first photo arrives, or after a few minutes.
   */
  private void connectPhone() {
    BootReceiver.cancel(this); // ReturnReceiver brings it back instead
    ReturnReceiver.start(this);
    openFrameo();
  }

  /** Opening Frameo from the menu is for staying there, so nothing brings Wish Jar back. */
  private void confirmOpenFrameo() {
    new AlertDialog.Builder(this)
        .setTitle("Open Frameo?")
        .setMessage("Frameo can't open other apps, so the frame stays in Frameo until Wish Jar is "
            + "started again (adb shell am start -n com.wishjar.frame/.MainActivity) or the frame "
            + "restarts. To add a phone, use Connect a phone in Wish Jar's photo picker instead: it "
            + "comes back by itself.")
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
    ReturnReceiver.cancel(this); // back, by the alarm or any other way
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
