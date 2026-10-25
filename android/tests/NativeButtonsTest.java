import com.inkstage.pen.StylusButtons;

public class NativeButtonsTest {
    private static void check(int actual, int expected) { if (actual != expected) throw new AssertionError(actual + " != " + expected); }
    public static void main(String[] args) {
        check(StylusButtons.canonical(0, true, false), 1);
        check(StylusButtons.canonical(32, true, false), 3);
        check(StylusButtons.canonical(64, true, false), 5);
        check(StylusButtons.canonical(96, true, false), 7);
        check(StylusButtons.canonical(2, true, false), 3);
        check(StylusButtons.canonical(4, true, false), 5);
        check(StylusButtons.canonical(32, false, false), 2);
        check(StylusButtons.canonical(0, true, true), 32);
        check(StylusButtons.canonical(0, false, true), 0);
        System.out.println("PASS: native Android primary/secondary buttons, legacy flags, hover and eraser tip.");
    }
}
