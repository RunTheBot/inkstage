# Pen input and rendering

## Sources inspected

- [Excalidraw shape generation](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts): uses perfect-freehand and caches generated geometry in a WeakMap. Inkstage similarly retains completed stroke geometry while updating the active stroke.
- [tldraw outline simplification](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/shared/freehand/getStrokeOutlinePoints.ts): bounds geometric deviation and limits its search window. Inkstage's live preview uses an eight-sample window and a screen-space deviation tolerance, retaining pressure transitions.
- [perfect-freehand rendering guidance](https://github.com/steveruizok/perfect-freehand#rendering): describes pressure outlines and quadratic SVG rendering. Inkstage uses measured pressure with pressure simulation and library positional streamlining disabled.
- [perfect-freehand outline implementation](https://github.com/steveruizok/perfect-freehand/blob/main/packages/perfect-freehand/src/getStrokeOutlinePoints.ts): removes the last three coordinate units as noise. Inkstage uses 64 units per slide pixel so this operation cannot discard a several-pixel handwritten corner.

## Pipeline

1. Android captures stylus buttons, pressure, historical positions, and timestamps before WebView normalizes button events. Browser input uses Pointer Events and coalesced samples where available. The dispatch endpoint is retained if the coalesced list omits it.
2. The pen/eraser choice is fixed at contact. A pressure-sensitive pen waits for pressure above its configured deadzone. The accepted pressure range is normalized, with an 8 ms time-aware pressure filter.
3. Smoothed pen applies one adaptive positional filter. Speed is measured in visible pixels, with a preset-specific trailing limit. Regular pen bypasses this positional filter.
4. Local ink is displayed optimistically and published once per animation frame. The network receives actual operations immediately. Remote point bursts are combined before copying growing point arrays; acknowledgement IDs are consumed before merging.
5. SVG pressure geometry uses a short spatial pressure filter before thinning positions. Near-identical positions do not create unstable tiny tangents. Endpoint and reversal disks provide round coverage; reversals are measured over a brush-sized distance rather than adjacent noisy samples. These operations change generated geometry, not saved samples.
6. Browser-predicted positions are temporary overlays for regular pen, cleared on the next input or stroke termination. They are excluded from synchronization and export.
7. Completed SVG geometry is cached. PPTX export uses the same pressure outline and round-join calculations. Before writing editable DrawingML paths, it resolves outline overlaps into simple polygons and holes with polygon-clipping. A recorded example otherwise left white wedges when rendered by PowerPoint. Each stroke remains one editable shape; intentional holes in circular writing are preserved.

SVG outline curves use explicit quadratic controls. Reflected `T` controls
accumulate error when successive midpoint coordinates are rounded for storage;
recorded long strokes exposed visible ripples despite a smooth source polygon.
The vector regression samples a long analytical straight stroke to bound that
error independently of the renderer's implementation.

The export cleanup follows the [polygon flattening approach documented by
perfect-freehand](https://github.com/steveruizok/perfect-freehand#flattening),
using [polygon-clipping](https://github.com/mfogel/polygon-clipping).

## Checks and limits

`npm test` covers jitter reduction, trailing distance at 60/120/240 Hz, high-zoom turns, pressure normalization, width chatter, subpixel backtracking, small corners, batched synchronization, native input, and vector/export behavior.

`npm run test:integration` checks real PowerPoint import, three-view synchronization, editing, reconnect, and reopening an annotated export in PowerPoint. `npm run build` checks the production bundle.

A synthetic burst of 120 updates appended to a 20,000-point stroke took a median 18.459 ms with sequential reconciliation and 0.150 ms with batching on the development laptop. This measures reconciliation only, not painting or end-to-end pen latency.

Recorded tablet handwriting was replayed through the renderer to reproduce split tips and scalloped thin strokes. Device/browser event delivery, display refresh, and network latency still affect the physical writing experience. The smoothing distance limit does not bound those delays.
