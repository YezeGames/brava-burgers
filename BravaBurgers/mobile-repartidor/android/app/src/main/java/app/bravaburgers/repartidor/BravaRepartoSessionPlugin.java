package app.bravaburgers.repartidor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.Location;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

/** GPS → servidor (reportTrack) + última posición para el mapa, sin depender del WebView. */
@CapacitorPlugin(name = "BravaRepartoSession")
public class BravaRepartoSessionPlugin extends Plugin {

    private static final String BG_ACTION =
            "com.equimaps.capacitor_background_geolocation.broadcast";
    private static final long MIN_SEND_MS = 16000L;

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private String apiUrl = "";
    private String repartidorToken = "";
    private String apiKey = "";
    private String activeOrn = "";
    private boolean sessionOn = false;

    private double lastLat = 0;
    private double lastLng = 0;
    private float lastBearing = 0;
    private long lastTimeMs = 0;

    private long lastSentMs = 0;
    private String lastSentOrn = "";

    private BroadcastReceiver locationReceiver;
    private boolean receiverRegistered = false;

    @PluginMethod
    public void startSession(PluginCall call) {
        String url = call.getString("apiUrl", "").trim();
        if (url.isEmpty()) {
            call.reject("missing_apiUrl");
            return;
        }
        apiUrl = url;
        repartidorToken = call.getString("repartidorToken", "").trim();
        apiKey = call.getString("apiKey", "").trim();
        activeOrn = call.getString("orn", "").trim();
        sessionOn = true;
        ensureLocationReceiver();
        call.resolve();
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        sessionOn = false;
        activeOrn = "";
        lastSentOrn = "";
        call.resolve();
    }

    @PluginMethod
    public void setOrn(PluginCall call) {
        activeOrn = call.getString("orn", "").trim();
        lastSentOrn = "";
        call.resolve();
    }

    @PluginMethod
    public void getLastPosition(PluginCall call) {
        JSObject ret = new JSObject();
        if (lastTimeMs > 0) {
            ret.put("ok", true);
            ret.put("latitude", lastLat);
            ret.put("longitude", lastLng);
            ret.put("bearing", (double) lastBearing);
            ret.put("time", lastTimeMs);
        } else {
            ret.put("ok", false);
        }
        call.resolve(ret);
    }

    private void ensureLocationReceiver() {
        if (receiverRegistered || getContext() == null) return;
        locationReceiver =
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (intent == null) return;
                        Location location = readLocation(intent);
                        if (location != null) {
                            handleLocation(location);
                        }
                    }
                };
        LocalBroadcastManager.getInstance(getContext())
                .registerReceiver(locationReceiver, new IntentFilter(BG_ACTION));
        receiverRegistered = true;
    }

    private static Location readLocation(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra("location", Location.class);
        }
        return intent.getParcelableExtra("location");
    }

    private void handleLocation(Location location) {
        lastLat = location.getLatitude();
        lastLng = location.getLongitude();
        lastBearing = location.hasBearing() ? location.getBearing() : 0f;
        lastTimeMs = System.currentTimeMillis();

        JSObject evt = new JSObject();
        evt.put("latitude", lastLat);
        evt.put("longitude", lastLng);
        evt.put("bearing", (double) lastBearing);
        evt.put("time", lastTimeMs);
        notifyListeners("location", evt);

        if (!sessionOn || activeOrn.isEmpty()) return;
        long now = lastTimeMs;
        if (now - lastSentMs < MIN_SEND_MS && activeOrn.equals(lastSentOrn)) return;
        lastSentMs = now;
        lastSentOrn = activeOrn;
        final String orn = activeOrn;
        final double lat = lastLat;
        final double lng = lastLng;
        io.execute(() -> postReportTrack(orn, lat, lng));
    }

    private void postReportTrack(String orn, double lat, double lng) {
        if (apiUrl.isEmpty() || orn.isEmpty()) return;
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("action", "reportTrack");
            body.put("orn", orn);
            body.put("lat", lat);
            body.put("lng", lng);
            if (!repartidorToken.isEmpty()) {
                body.put("repartidorToken", repartidorToken);
            }
            if (apiKey != null && !apiKey.isEmpty()) {
                body.put("key", apiKey);
            }
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(apiUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                readStream(conn.getErrorStream());
            }
        } catch (Exception ignore) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void readStream(java.io.InputStream stream) {
        if (stream == null) return;
        try (BufferedReader br =
                new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            while (br.readLine() != null) {
                /* drain */
            }
        } catch (Exception ignore) {
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (receiverRegistered && locationReceiver != null && getContext() != null) {
            try {
                LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(locationReceiver);
            } catch (Exception ignore) {
            }
            receiverRegistered = false;
        }
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
