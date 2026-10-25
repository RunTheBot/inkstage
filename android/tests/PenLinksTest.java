import com.inkstage.pen.PenLinks;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class PenLinksTest {
    private static void equal(String actual, String expected) { if (!actual.equals(expected)) throw new AssertionError(actual + " != " + expected); }
    public static void main(String[] args) throws Exception {
        for (String origin : new String[]{"https://aaron.tail2955c9.ts.net", "http://192.168.1.20:4173", "http://[fd7a:115c:a1e0::1234]:4173"}) {
            String target = origin + "/?session=abc123&view=pen#token_-123";
            equal(PenLinks.launchTarget(origin + "/open-pen?session=abc123&view=pen#token_-123"), target);
            equal(PenLinks.launchTarget("inkstage://pen?url=" + URLEncoder.encode(target, StandardCharsets.UTF_8.name())), target);
        }
        for (String bad : new String[]{
            "https://slides.example.com/open-pen?session=abc123&view=pen",
            "https://slides.example.com/open-pen?session=&view=pen#token",
            "https://slides.example.com/open-pen?session=abc123&view=presenter#token",
            "https://slides.example.com/open-pen?session=abc123&view=audience#token",
            "https://slides.example.com/open-pen?session=abc123&view=pen&view=presenter#token",
            "https://user:password@slides.example.com/open-pen?session=abc123&view=pen#token",
            "https://slides.example.com:99999/open-pen?session=abc123&view=pen#token",
            "inkstage://pen?url=javascript%3Aalert(1)", "inkstage://pen?url=%", "inkstage://other?url=http%3A%2F%2Fexample.com",
            "inkstage://pen?url=http%3A%2F%2Fexample.com&url=http%3A%2F%2Fother.com", "not a URL"
        }) equal(PenLinks.launchTarget(bad), "");
        System.out.println("PASS: QR/app link decoding, custom origins and rejection of malformed or non-pen links.");
    }
}
