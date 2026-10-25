package com.inkstage.pen;

/** Translate native Android button flags before WebView discards their meaning. */
public final class StylusButtons {
    private StylusButtons() {}
    public static int canonical(int raw, boolean contact, boolean eraser) {
        int buttons = 0;
        // Android primary/secondary stylus: 32/64; older drivers: 2/4.
        if ((raw & (32 | 2)) != 0) buttons |= 2;
        if ((raw & (64 | 4)) != 0) buttons |= 4;
        if (contact) buttons |= eraser ? 32 : 1;
        return buttons;
    }
}
