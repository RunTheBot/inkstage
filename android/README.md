# Inkstage Pen for Android

A small Android client for the existing Inkstage pen view. The UI, SVG ink,
PDF slide renderer, smoothing, snapping and live sync stay in the web app.
Stylus input is captured natively before WebView maps its buttons.

## Use

1. Install `Inkstage-Pen.apk` on the tablet. Android 8 or newer and a recent
   Android System WebView are required.
2. On the laptop, open **Connect devices → Tablet pen view** and scan its QR.
3. The verified HTTPS app link opens Inkstage Pen and joins the session.
   If your scanner or a custom server address opens a browser, tap **Open
   Inkstage Pen** there. Manual paste/share of the browser pen link still works.
4. Write as before. The side button temporarily erases. The top **Native pen**
   badge changes to **Button held** when Android reports a side-button press.
5. Tap that badge to change the connection, reload, or inspect the latest raw
   Android button flags. **Last nonzero buttons** retains the last press.

Keep Tailscale connected if using a private Tailscale URL. HTTPS and direct
HTTP LAN links are supported. Presenter and audience views stay in their
normal browsers. PPTX import/export remains on the laptop.

Version 1.2 uses Android immersive fullscreen automatically: the clock/status
bar and bottom navigation/task bar are hidden, with no browser fullscreen
button in the native pen view. Fullscreen is reapplied after resume, rotation,
keyboard dismissal and native dialog dismissal. Edge swipes can temporarily
reveal Android's system controls; they hide again automatically. Camera-cutout
and keyboard insets remain respected without reserving empty system-bar space.

The new WebView has its own app storage; Automatic is the initial stylus
binding. Native events also bypass the older Samsung browser heuristic if
that experimental preset is selected.

## QR app links

Version 1.1 adds `ACTION_VIEW` handling for `https://aaron.tail2955c9.ts.net/open-pen`
and `inkstage://pen?url=<encoded browser pen link>`. The HTTPS QR keeps the
session token in the fragment. Android verifies the Tailscale host using
`public/.well-known/assetlinks.json`, served explicitly by the Node server.
Keep Tailscale connected during install/verification and use the same signing
key for APK updates. Another HTTPS host needs a corresponding manifest host
and its own association file for automatic app opening. Custom IP/domain
QRs still support the one-tap native launch page and browser fallback.

App-link verification and camera behavior require a physical device check.
Android may require enabling **Open supported links** in the app's settings
if its defaults were previously disabled. The APK is signed with the local
development certificate; a different signing key requires updating the
association's SHA-256 fingerprint.

## Input implementation

`PenWebView` reads `MotionEvent.getButtonState()` and tool type from touch
and generic-motion events. Android primary/secondary stylus flags (32/64)
and legacy driver flags (2/4) map to standard barrel/alternate buttons.
Contact and eraser-tip state are separate from button presses.

Historical position/pressure/time samples are preserved and delivered in
display-frame batches. The bridge delivers canonical pen events to the
drawing surface and stylus test pad, and suppresses their duplicate WebView
pen events. Finger gestures and ordinary toolbar interactions remain native
WebView input. The app exposes no Android JavaScript interface and never
overrides certificate errors. Main-frame navigation stays on the configured
server origin.

## Build and validate

Use Android SDK 36 and Java 17 or newer supported by Gradle 9.5. Set
`ANDROID_HOME` and `JAVA_HOME`, then run:

```powershell
./gradlew.bat --no-configuration-cache assembleDebug lintDebug
```

The signed development APK is `app/build/outputs/apk/debug/app-debug.apk`.
The web project requires its updated native-event handling code; rebuild
the web app when rebuilding the Android client.

`npm test` in the parent directory tests event replay, pressure history,
button mappings in the app, and duplicate-event suppression. The separate
`tests/NativeButtonsTest.java` tests native Android flag mapping using Java.

The client is a prototype. Build/lint and deterministic input replay checks
do not replace physical S Pen testing on the user's tablet.
