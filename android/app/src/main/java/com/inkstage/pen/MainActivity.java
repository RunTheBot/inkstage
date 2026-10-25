package com.inkstage.pen;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Choreographer;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;

public class MainActivity extends Activity {
    private FrameLayout root;
    private PenWebView web;
    private String currentUrl = "", script = "", lastSignal = "Touch the screen with the S Pen and hold/release its side button.";
    private TextView diagnostic;
    private TextView nativeBadge;
    private boolean ready = false;
    private boolean buttonIndicator = false;
    private int lastPressedButtons = 0;
    private boolean keyboardVisible = false;
    private final JSONArray queue = new JSONArray();
    private boolean scheduled = false;
    private final Choreographer.FrameCallback frame = time -> flush();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 246, 240));
        // Reserve camera-cutout and keyboard space only. Hidden system bars
        // must not leave status/task/navigation-bar-sized gaps around the page.
        if (android.os.Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets cutout = insets.getInsets(WindowInsets.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(cutout.left, cutout.top, cutout.right, Math.max(cutout.bottom, keyboard.bottom));
            boolean visible = insets.isVisible(WindowInsets.Type.ime());
            if (keyboardVisible && !visible) view.post(this::enterImmersiveMode);
            keyboardVisible = visible;
            return insets;
        });
        setContentView(root);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams layout = getWindow().getAttributes();
            layout.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(layout);
        }
        enterImmersiveMode();
        root.post(this::enterImmersiveMode);
        if (android.os.Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::options);
        try (var input = getAssets().open("native-input.js"); var bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            script = bytes.toString(StandardCharsets.UTF_8.name());
        }
        catch (Exception error) { Toast.makeText(this, "Native input could not load", Toast.LENGTH_LONG).show(); }
        if (openLaunchIntent(getIntent())) return;
        String shared = sharedUrl(getIntent());
        String saved = getPreferences(MODE_PRIVATE).getString("penUrl", "");
        if (!shared.isEmpty()) setup(shared);
        else if (!saved.isEmpty()) connect(saved);
        else setup("");
    }

    @SuppressWarnings("deprecation")
    private void enterImmersiveMode() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        } else {
            // Android 8–10 equivalent: bars can be revealed by an edge swipe
            // and hide again automatically without shifting slide coordinates.
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }
    @Override protected void onResume() { super.onResume(); if (root != null) root.post(this::enterImmersiveMode); }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        root.requestApplyInsets(); root.post(this::enterImmersiveMode);
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); if (!openLaunchIntent(intent)) setup(sharedUrl(intent)); }
    private boolean openLaunchIntent(Intent intent) {
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return false;
        String target = PenLinks.launchTarget(intent.getDataString() == null ? "" : intent.getDataString());
        if (!target.isEmpty()) connect(target);
        else { setup(""); Toast.makeText(this, "This pen link is incomplete. Scan a new QR from your laptop.", Toast.LENGTH_LONG).show(); }
        return true;
    }
    private String sharedUrl(Intent intent) { CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT); return text == null ? "" : text.toString().trim(); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) { TextView label = new TextView(this); label.setText(value); label.setTextSize(size); label.setTextColor(Color.rgb(23, 62, 51)); return label; }
    private EditText address(String value) {
        EditText field = new EditText(this); field.setText(value); field.setHint("Paste the Tablet pen view link");
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        field.setMinLines(2); field.setMaxLines(4); field.setTextSize(14); return field;
    }
    private void setup(String initial) {
        if (web != null) { web.destroy(); web = null; }
        resetInput(); root.removeAllViews();
        LinearLayout form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(dp(28), dp(28), dp(28), dp(28));
        form.addView(text("Inkstage Pen", 28));
        form.addView(text("Scan the Tablet pen view QR on your laptop to connect automatically. You can also paste or share its pen link here.", 15));
        EditText input = address(initial); form.addView(input);
        Button button = new Button(this); button.setText(R.string.connect); form.addView(button);
        button.setOnClickListener(view -> connect(input.getText().toString().trim()));
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER); root.addView(form, layout);
    }
    private boolean validLink(Uri uri) {
        return PenLinks.valid(uri.toString());
    }
    @SuppressLint("SetJavaScriptEnabled") private void connect(String url) {
        Uri uri = Uri.parse(url);
        if (!validLink(uri)) { Toast.makeText(this, "Paste the complete Tablet pen view link, including its session token.", Toast.LENGTH_LONG).show(); return; }
        currentUrl = url; getPreferences(MODE_PRIVATE).edit().putString("penUrl", url).apply();
        root.removeAllViews(); resetInput();
        if (web != null) web.destroy();
        web = new PenWebView();
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false); settings.setUseWideViewPort(true); settings.setLoadWithOverviewMode(true);
        settings.setUserAgentString(settings.getUserAgentString() + " InkstageNativePen/1.2");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String next, android.graphics.Bitmap icon) { resetInput(); if (nativeBadge != null) nativeBadge.setText("Loading  ⋮"); }
            @Override public void onPageFinished(WebView view, String finished) {
                if (!sameOrigin(currentUrl, finished)) return;
                view.evaluateJavascript(script + ";Boolean(window.InkstageNativePen)", result -> {
                    ready = "true".equals(result);
                    buttonIndicator = false;
                    if (nativeBadge != null) nativeBadge.setText(ready ? "Native pen  ⋮" : "Input error  ⋮");
                });
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame() || sameOrigin(currentUrl, request.getUrl().toString())) return false;
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        TextView menu = text("Native pen  ⋮", 12); menu.setGravity(Gravity.CENTER); menu.setTextColor(Color.WHITE); menu.setBackgroundColor(Color.rgb(23, 62, 51));
        FrameLayout.LayoutParams menuLayout = new FrameLayout.LayoutParams(dp(105), dp(28), Gravity.TOP | Gravity.CENTER_HORIZONTAL); menuLayout.topMargin = dp(2);
        root.addView(menu, menuLayout); menu.setOnClickListener(view -> options());
        nativeBadge = menu;
        web.loadUrl(url);
    }
    private boolean sameOrigin(String first, String second) {
        Uri a = Uri.parse(first), b = Uri.parse(second);
        return a.getHost() != null && a.getScheme().equalsIgnoreCase(b.getScheme() == null ? "" : b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost() == null ? "" : b.getHost()) && a.getPort() == b.getPort();
    }
    private void options() {
        LinearLayout form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(dp(20), dp(8), dp(20), dp(8));
        diagnostic = text(lastSignal, 13); form.addView(diagnostic);
        EditText input = address(currentUrl); form.addView(input);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Native pen input").setView(form)
            .setPositiveButton("Connect", (d, which) -> connect(input.getText().toString().trim()))
            .setNeutralButton("Reload", (d, which) -> { if (web != null) web.reload(); })
            .setNegativeButton("Close", null).create();
        dialog.setOnDismissListener(d -> { diagnostic = null; root.post(this::enterImmersiveMode); }); dialog.show();
    }
    private void flush() {
        scheduled = false;
        if (queue.length() == 0) return;
        String json = queue.toString();
        while (queue.length() > 0) queue.remove(queue.length() - 1);
        if (ready && web != null) web.evaluateJavascript("window.InkstageNativePen&&window.InkstageNativePen.accept(" + json + ")", null);
    }
    private void resetInput() {
        ready = false; scheduled = false; Choreographer.getInstance().removeFrameCallback(frame);
        while (queue.length() > 0) queue.remove(queue.length() - 1);
    }
    private void enqueue(JSONObject packet, boolean immediate) {
        queue.put(packet);
        if (immediate) { Choreographer.getInstance().removeFrameCallback(frame); flush(); }
        else if (!scheduled) { scheduled = true; Choreographer.getInstance().postFrameCallback(frame); }
    }
    private class PenWebView extends WebView {
        private boolean contact = false;
        PenWebView() { super(MainActivity.this); }
        private void pen(MotionEvent event, boolean touch) {
            int index = -1;
            for (int i = 0; i < event.getPointerCount(); i++) if (event.getToolType(i) == MotionEvent.TOOL_TYPE_STYLUS || event.getToolType(i) == MotionEvent.TOOL_TYPE_ERASER) { index = i; break; }
            if (index < 0 || !ready) return;
            int action = event.getActionMasked();
            String phase = touch ? "move" : "hover";
            if (touch && (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) && event.getActionIndex() == index) { phase = "down"; contact = true; }
            if (touch && (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP) && event.getActionIndex() == index) { phase = "up"; contact = false; }
            if (action == MotionEvent.ACTION_CANCEL || action == MotionEvent.ACTION_HOVER_EXIT) { phase = "cancel"; contact = false; }
            if (!touch && contact && phase.equals("hover")) phase = "move";
            int raw = event.getButtonState(), buttons = StylusButtons.canonical(raw, contact, event.getToolType(index) == MotionEvent.TOOL_TYPE_ERASER);
            if (raw != 0) lastPressedButtons = raw;
            boolean pressed = (buttons & 6) != 0;
            if (nativeBadge != null && pressed != buttonIndicator) { buttonIndicator = pressed; nativeBadge.setText(pressed ? "Button held  ⋮" : "Native pen  ⋮"); }
            lastSignal = "Last Android buttons: 0x" + Integer.toHexString(raw) + "\nLast nonzero buttons: 0x" + Integer.toHexString(lastPressedButtons) + "\nMapped buttons: " + buttons + "\nContact: " + contact + "\nNative side button: " + (pressed ? "PRESSED" : "released");
            if (diagnostic != null) diagnostic.setText(lastSignal);
            try {
                JSONArray points = new JSONArray();
                if (phase.equals("move")) for (int h = Math.max(0, event.getHistorySize() - 255); h < event.getHistorySize(); h++) points.put(point(event.getHistoricalX(index, h), event.getHistoricalY(index, h), event.getHistoricalPressure(index, h), event.getHistoricalEventTime(h)));
                points.put(point(event.getX(index), event.getY(index), contact ? event.getPressure(index) : 0, event.getEventTime()));
                JSONObject packet = new JSONObject().put("action", phase).put("id", event.getPointerId(index)).put("contact", contact).put("raw", raw).put("buttons", buttons).put("width", getWidth()).put("height", getHeight()).put("points", points);
                enqueue(packet, !phase.equals("move") && !phase.equals("hover"));
            } catch (Exception ignored) { /* Drop malformed device samples. */ }
        }
        private JSONObject point(float x, float y, float pressure, long time) throws Exception { return new JSONObject().put("x", x).put("y", y).put("pressure", Math.max(0, Math.min(1, pressure))).put("time", time); }
        @Override public boolean dispatchTouchEvent(MotionEvent event) { pen(event, true); return super.dispatchTouchEvent(event); }
        @Override public boolean dispatchGenericMotionEvent(MotionEvent event) { pen(event, false); return super.dispatchGenericMotionEvent(event); }
    }
    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus && root != null) enterImmersiveMode();
        if (!focus && ready && web != null) { flush(); web.evaluateJavascript("window.InkstageNativePen&&window.InkstageNativePen.cancel()", null); }
    }
    @Override protected void onDestroy() { resetInput(); if (web != null) web.destroy(); super.onDestroy(); }
    // Android 13+ uses the registered OnBackInvokedCallback; this is only the
    // fallback callback invoked by Android 8–12.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { options(); }
}
