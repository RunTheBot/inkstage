# Inkstage

A Vite + React + TypeScript web app for presenting a PowerPoint deck and writing on it from a separate Android tablet. The laptop runs a Node.js server that renders slides using desktop PowerPoint and relays ink to all connected views over WebSockets. Files stay on the laptop. Once dependencies are installed, the app needs no internet connection.

## Run

Requires Windows, activated desktop Microsoft PowerPoint, and Node.js 22.13+ (24 LTS recommended). PowerPoint is used for import only; the browser handles the presentation and ink. Other operating systems can run the web server but cannot currently import PPTX files.

From this folder:

```powershell
npm ci
npm run dev
```

Open http://localhost:4173. For a presentation, use the production build:

```powershell
npm run build
npm start
```

Or run `./start.ps1`, which installs dependencies if needed, builds, and starts the production server. Keep that terminal open. Set the `PORT` environment variable to use another port.

For HTTPS through Tailscale, run `tailscale serve --bg http://localhost:4173` and open the HTTPS address printed by Serve, without `:4173`. Keep Tailscale connected on the laptop and tablet. Serve terminates HTTPS locally; Inkstage trusts forwarded protocol headers only from loopback proxy connections. Open the presenter through that HTTPS address too, then **Connect devices** defaults to HTTPS links for the other views.

## Android pen client

For native S Pen input, install or update `Inkstage-Pen.apk` from **Connect devices → Tablet pen view → Download Android pen app** on the tablet. Version 1.1 opens the Tablet pen QR directly in the app through the verified Tailscale HTTPS link and joins its session. Custom addresses and scanners that open a browser get an **Open Inkstage Pen** fallback. Manual paste/share of the browser pen link still works. The client reads Android's native button flags and pressure samples before WebView normalizes them, while retaining the same web UI, SVG ink, PDF slides and live synchronization. The **Native pen** badge changes to **Button held** when Android reports the side button. Presenter and audience views continue in regular browsers. See `android/README.md` for building, app-link verification and diagnostics. The client is a prototype and still needs physical-device verification.

## Present

Android client 1.2 enters immersive fullscreen automatically, hiding the status
and navigation bars and removing the browser fullscreen button inside the app.
An edge swipe can temporarily reveal Android system controls.

1. Import a `.pptx`, or choose **Try a practice deck**. Import supports up to 80 MB and 300 slides. Rendering may take a minute for larger decks.
2. Keep the **presenter view** on your laptop. It has the current slide, slide thumbnails, private speaker notes, next-slide preview, timer, blackout, and export.
3. Choose **Connect devices → Audience view → Open audience view**. Move the new browser window to your audience display. Press **F** or double-click the slide for fullscreen. This view has no pen menus or speaker notes.
4. Choose **Connect devices → Tablet pen view** and scan the QR code with Android, or copy the link. Use a laptop network address reachable by the tablet. All devices need access to the same laptop server. If needed, allow Node.js on your private network in Windows Firewall. If there are several network adapters, choose the address used by your tablet's network.
5. Write on the tablet. The presenter and audience see ink while you write. The tablet can also change slides. Finger drawing starts **off** on the tablet for palm rejection; turn it on to use a finger. A mouse works in either writable view.
6. Choose **Export .pptx** on the presenter view to download the annotated original.

Use **Open pen view** to test the tablet interface in another laptop browser window. An audience link is read-only. Only the presenter link can retrieve connection tokens and export. Speaker notes are excluded from tablet and audience responses. Session links grant access to their specific view, so keep them within your devices.

In **Connect devices**, choose **Custom domain / IP…** under Laptop network address to use a domain, reverse-proxy address, or another IP. Enter a full address such as `https://slides.example.com` or `http://192.168.1.20:4173`; bare domains and IPs with ports also work. The QR code, copy link and Open view button all use the selected address for either device view. Invalid addresses do not produce a QR code. The last valid custom address is remembered in that browser.

## Drawing

### Zoom and move the slide

The pen canvas occupies the whole viewport. Its small view label and unified bottom toolbar overlay the canvas. The same bottom toolbar appears in pen and presenter views: navigation, drawing tools, color controls, undo/redo, settings, pan and zoom. Icon buttons and color touch targets are consistently 48 by 48 pixels. It wraps when space is limited. Presenter-only blackout and notes controls are in the header.

Pinch with two fingers on a touchscreen or trackpad to zoom. Drag with two fingers on a touchscreen, or scroll with two fingers on a trackpad, to move the page when zoomed. With finger drawing turned off, a single finger also pans. Use Ctrl+mouse-wheel to zoom around the cursor. The hand button (or **M**) enables dragging with a mouse, and a middle-button drag also pans. Open the percentage-arrow submenu for **+ / −** controls (50%–600%) and **Fit slide**. Changing slides resets the view to fit.

Zoom and pan belong to each local view; the audience continues to see the whole slide. Pen and eraser coordinates stay attached to the slide while zoomed. A second finger switches a finger-drawing gesture to navigation and cancels its provisional ink. Stylus input stays immediate; finger drawing waits briefly to distinguish it from a navigation gesture.

When zoomed above 100%, pan past any slide edge to bring it toward the middle
of the screen, with blank space around it for comfortable writing. Panning
stops while part of the slide remains visible. **Fit slide** recenters it.

- **Pen:** freehand ink. Pause within about 5 screen pixels for **550 ms** at the end of a stroke to straighten it. Continue dragging to adjust the straight line before lifting the pen.
- **Smoothed pen:** choose the dedicated smoothed-pen button on the main toolbar (or press **S**). Open the adjacent arrow to select **Light**, **Balanced**, **Strong**, or **Maximum** smoothing. Balanced and Strong use two stabilization passes, and Maximum uses three for much stronger filtering. Stronger settings add more pen lag. Adaptive filtering reduces hand jitter while responding faster to quick movements. The filtered points stream to every view and are retained in the exported PPTX. The regular pen remains available for unfiltered input. Both modes support hold-to-straighten.
- **Pressure sensitivity:** the same pen submenu contains a 0–100% slider. Higher values increase how much stylus pressure changes stroke width; 0 gives a uniform stroke. This uses the pressure reported by the pen/browser. Mouse and finger input keep a uniform width. Pressure outlines use the same geometry for local display, other connected views, and editable PPTX export. Smoothing and pressure preferences are remembered in the browser.
- **Line:** drag to draw a straight line directly.
- **Angle snap:** lines within **8°** of horizontal, vertical, or a 45° angle snap to that angle. The calculation respects the slide's aspect ratio. Toggle this in pen settings.
- **Eraser:** tap or sweep across ink to erase entire strokes. Undo restores them. The physical pen button is checked throughout contact, so pressing and releasing it mid-stroke temporarily switches between your selected pen and erasing. A side-button press while hovering does not erase until the tip touches the page.
- **Highlighter:** translucent strokes.
- **Laser:** temporary pointer, excluded from export. Remote pointers disappear after inactivity.
- Pen settings include stroke width, angle snapping, finger drawing, and clearing ink on the current slide. Clear is undoable.

| Key | Action |
| --- | --- |
| Left / Right, Page Up / Page Down, Space | Change slides |
| Home / End | First / last slide |
| P / H / L / E / V | Pen / highlighter / line / eraser / laser |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo ink on current slide |
| B | Black out audience screen (presenter only) |
| F | Fullscreen |


### Rebind a physical stylus button

On the tablet, open **Tool settings** (the sliders icon), then **Stylus button**. The setting is saved in that browser, so configure the tablet directly.

Choose **Learn button**, hold the physical side button, and touch the test area. It captures the extra button bit and whether the browser reports a pen or mouse. The test area never changes your presentation. The live reading helps diagnose what the tablet actually reports.

Presets include Automatic, side/barrel, alternate/middle, back/X1, forward/X2, eraser tip, and Disabled. For a pen that reports another Wacom-style button, try Alternate/middle or use learning. You can choose **Hold to erase** or **Press to toggle eraser**, set the reported device type, or enter a custom button mask under Manual binding. The normal tip-contact bit cannot be assigned to the eraser. Reset restores Automatic.

Automatic handles the standard side-button and eraser-tip signals. A learned mouse middle button takes priority over middle-button panning. The toolbar tool remains selected while the physical button temporarily erases. If no distinct button event reaches the browser, the app cannot infer the physical press; the learning screen reports that instead of claiming to bind normal pen contact.

For Samsung S Pen devices that report **button -1 on normal pointermove events** and **button 0 on side-button pointermove events**, both with **buttons 1**, choose **Samsung S Pen / Android (experimental)** under Tool settings → Stylus button. This is opt-in and saved on that browser. It recognizes only pen movement events: normal tip-down with button 0 never activates erasing. Hold mode follows those movement readings and returns to drawing on -1 or tip-up; toggle mode switches once per reported press. The test pad shows **Pen active** / **Eraser active** without modifying any ink. If 0 appears only on pointerdown, or also appears on normal movement, this preset cannot reliably distinguish the side button; return to Automatic. Normal button learning continues to ignore tip-contact signals.

## Fidelity and persistence

PowerPoint exports slides to a PDF with embedded fonts and vector geometry. The browser renders only the visible PDF region at native device-pixel resolution, in tiles, and rerenders when zoom or display density changes. Ink is an SVG overlay with independent vector paths and pressure outlines; it remains sharp at 4K and high zoom. PNGs remain only as small thumbnails and temporary loading previews. Existing sessions generate their PDF automatically the first time they are opened. Photographs and other raster content retain their original source resolution. This app presents **static slides**: animations, transitions, video, audio, embedded applications and clickable slide hyperlinks do not play. Those existing elements are preserved in the exported PowerPoint package.

Export copies the original PPTX and appends each visible ink stroke as an **editable DrawingML freeform shape** on its original slide, including highlighter transparency. This preserves original text, media, notes, slide order, layouts and relationships. Ink is a regular editable shape rather than PowerPoint's native Ink object. Re-importing an annotated export renders previous ink into the slide preview; that previous ink cannot be erased in Inkstage, but it remains editable in PowerPoint.

Sessions and originals are stored in `.data/`, ignored by Git and excluded from Vite file serving. Incremental changes are saved after a 250 ms idle debounce and when a view disconnects. A server crash or power loss can lose the most recent unsaved changes. The home screen can resume the last session used by that browser; its original presenter URL also restores access. Connected views automatically reconnect to the server's saved snapshot. Drawing pauses while disconnected instead of silently losing unsent ink. Undo history resets after a server restart.

Local SVG ink updates on the display clock without waiting for network acknowledgements. Finished stroke paths are memoized, so drawing a new stroke does not repeatedly rebuild every previous pressure outline. PDF tiles are limited to 2048 pixels per edge without reducing native display resolution; zoom renders a fresh visible region from the PDF rather than enlarging a fixed bitmap. Display-frame batching retains every input sample. Delayed authoritative eraser responses are reconciled with newer local ink rather than replacing it.

Instantaneous display across physical devices is constrained by Wi-Fi and browser scheduling. Points stream during the stroke, and the sync indicator shows a measured round-trip time to the laptop, not local pen latency. HTTPS-only browser features (coalesced events, screen wake lock, clipboard) use fallbacks when running on a plain HTTP LAN address. Sparse pointer events on HTTP can produce more angular curves, particularly during fast writing; missing hardware samples cannot be reconstructed by smoothing. Set the tablet's screen timeout appropriately if wake lock is unavailable.

## Development and checks

```powershell
npm test
npm run build
# With the server running on localhost:4173:
npm run test:integration
```

The integration test uploads a generated PPTX, runs real PowerPoint import, connects presenter/pen/audience WebSockets, checks ink streaming and line replacement, erasing, undo, read-only audience access, notes privacy, slide navigation, blackout, timer and late joins. It exports and reopens the result through PowerPoint to verify it remains readable. Temporary integration files go to the OS temp folder, or `INKSTAGE_TEST_OUTPUT` if set. It creates a practice session in `.data/`.

`src/SlideCanvas.tsx` handles pointer input and hold-to-straighten. `src/ink.ts` contains aspect-correct snapping and segment-aware stroke hit testing. `server/state.mjs` validates shared operations. `server/deck.mjs` inspects PPTX packages and appends vector annotations. `server/render.ps1` invokes PowerPoint with macros disabled, closes only the imported presentation, and leaves other open decks alone.

This is a local network app, not an internet-facing hosting setup. The server listens on all interfaces so the tablet can connect. No external accounts, cloud storage, analytics, or hosted signaling services are used.
