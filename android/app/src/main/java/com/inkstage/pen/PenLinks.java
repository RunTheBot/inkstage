package com.inkstage.pen;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** Parse external launch links without treating their data as executable URLs. */
public final class PenLinks {
    private PenLinks() {}
    private static String parameter(URI uri, String key) {
        if (uri.getRawQuery() == null) return "";
        String result = ""; boolean found = false;
        for (String part : uri.getRawQuery().split("&")) {
            String[] pair = part.split("=", 2);
            if (decode(pair[0]).equals(key)) {
                if (found) throw new IllegalArgumentException("Duplicate parameter");
                result = pair.length > 1 ? decode(pair[1]) : ""; found = true;
            }
        }
        return result;
    }
    private static String decode(String value) {
        try { return URLDecoder.decode(value, StandardCharsets.UTF_8.name()); }
        catch (Exception error) { throw new IllegalArgumentException(error); }
    }
    public static boolean valid(String value) {
        try {
            URI uri = URI.create(value);
            return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) && uri.getHost() != null && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || (uri.getPort() > 0 && uri.getPort() <= 65535))
                && ("/".equals(uri.getRawPath()) || uri.getRawPath().isEmpty())
                && "pen".equals(parameter(uri, "view")) && !parameter(uri, "session").isEmpty() && uri.getRawFragment() != null && !uri.getRawFragment().isEmpty();
        } catch (Exception error) { return false; }
    }
    public static String launchTarget(String value) {
        try {
            URI uri = URI.create(value);
            if ("inkstage".equals(uri.getScheme()) && "pen".equals(uri.getHost()) && uri.getRawUserInfo() == null && uri.getPort() == -1 && (uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath()))) {
                String target = parameter(uri, "url"); return valid(target) ? target : "";
            }
            if (("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && "/open-pen".equals(uri.getRawPath())) {
                String target = uri.getScheme() + "://" + uri.getRawAuthority() + "/?" + uri.getRawQuery() + "#" + (uri.getRawFragment() == null ? "" : uri.getRawFragment());
                return valid(target) ? target : "";
            }
        } catch (Exception ignored) { /* Reject malformed launch data. */ }
        return "";
    }
}
