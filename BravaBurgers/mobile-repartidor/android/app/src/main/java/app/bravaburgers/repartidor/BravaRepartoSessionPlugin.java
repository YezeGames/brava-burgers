package app.bravaburgers.repartidor;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.Location;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** GPS → servidor (reportTrack) + última posición para el mapa, sin depender del WebView. */
@CapacitorPlugin(name = "BravaRepartoSession")
public class BravaRepartoSessionPlugin extends Plugin {

    private static final String BG_ACTION =
            "com.equimaps.capacitor_background_geolocation.broadcast";
    private static final long MIN_SEND_MS = 16000L;
    private static final long ROUTE_POLL_SEC = 28L;
    private static final int ROUTE_NOTIFY_ID = 88001;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService routePollScheduler = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> routePollFuture;

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

    private final Set<String> knownRouteOrns = new HashSet<>();
    private boolean routePollReady = false;

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
        startRoutePollLoop();
        call.resolve();
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        sessionOn = false;
        activeOrn = "";
        lastSentOrn = "";
        stopRoutePollLoop();
        knownRouteOrns.clear();
        routePollReady = false;
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

    private void startRoutePollLoop() {
        stopRoutePollLoop();
        if (repartidorToken.isEmpty() && (apiKey == null || apiKey.isEmpty())) return;
        routePollFuture =
                routePollScheduler.scheduleAtFixedRate(
                        () -> io.execute(this::pollRouteOnce),
                        4L,
                        ROUTE_POLL_SEC,
                        TimeUnit.SECONDS);
    }

    private void stopRoutePollLoop() {
        if (routePollFuture != null) {
            routePollFuture.cancel(false);
            routePollFuture = null;
        }
    }

    private void pollRouteOnce() {
        if (!sessionOn || apiUrl.isEmpty()) return;
        if (repartidorToken.isEmpty() && (apiKey == null || apiKey.isEmpty())) return;
        String json = postListRuta();
        if (json == null || json.isEmpty()) return;
        try {
            JSONObject root = new JSONObject(json);
            if (!root.optBoolean("ok", false)) return;
            JSONArray pedidos = root.optJSONArray("pedidos");
            Set<String> now = new HashSet<>();
            if (pedidos != null) {
                for (int i = 0; i < pedidos.length(); i++) {
                    JSONObject p = pedidos.optJSONObject(i);
                    if (p == null) continue;
                    String orn = p.optString("orn", "").trim();
                    if (!orn.isEmpty()) now.add(orn);
                }
            }
            if (!routePollReady) {
                knownRouteOrns.clear();
                knownRouteOrns.addAll(now);
                routePollReady = true;
                return;
            }
            int added = 0;
            for (String orn : now) {
                if (!knownRouteOrns.contains(orn)) added++;
            }
            int removed = 0;
            for (String orn : knownRouteOrns) {
                if (!now.contains(orn)) removed++;
            }
            knownRouteOrns.clear();
            knownRouteOrns.addAll(now);
            if (added == 0 && removed == 0) return;
            if (now.isEmpty() && removed > 0) {
                showRouteSystemNotification("Ruta vacía", "Cocina limpió tu ruta en la app.");
                notifyRouteChanged("route_clear");
            } else if (added > 0 && removed > 0) {
                showRouteSystemNotification(
                        "Ruta modificada",
                        "Cocina actualizó tu ruta: "
                                + added
                                + " parada"
                                + (added == 1 ? "" : "s")
                                + ", quitó "
                                + removed
                                + ".");
                notifyRouteChanged("route_modified");
            } else if (removed > 0 && added == 0) {
                showRouteSystemNotification(
                        "Paradas quitadas",
                        "Cocina te sacó "
                                + removed
                                + " parada"
                                + (removed == 1 ? "" : "s")
                                + " de la ruta.");
                notifyRouteChanged("route_removed");
            } else if (added > 0) {
                String title =
                        added == 1
                                ? "Nueva parada en tu ruta"
                                : (added + " paradas nuevas");
                String body =
                        added == 1
                                ? "Tenés 1 entrega asignada. Abrí Brava Repartidor."
                                : "Cocina te asignó entregas. Abrí Brava Repartidor.";
                showRouteSystemNotification(title, body);
                notifyRouteChanged("route_assign");
            }
        } catch (Exception ignore) {
        }
    }

    private String postListRuta() {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("action", "listRuta");
            body.put("includeItems", false);
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
            java.io.InputStream stream = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            return readStreamToString(stream);
        } catch (Exception ignore) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readStreamToString(java.io.InputStream stream) {
        if (stream == null) return null;
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br =
                new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
        } catch (Exception ignore) {
            return null;
        }
        return sb.toString();
    }

    private void notifyRouteChanged(String type) {
        JSObject evt = new JSObject();
        evt.put("type", type);
        notifyListeners("routeChanged", evt);
    }

    private void showRouteSystemNotification(String title, String body) {
        Context ctx = getContext();
        if (ctx == null) return;
        Intent launch = new Intent(ctx, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(ctx, ROUTE_NOTIFY_ID, launch, flags);
        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(ctx, MainActivity.PUSH_CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_notification)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .setColor(0xFFFF6B35);
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(ROUTE_NOTIFY_ID + (int) (System.currentTimeMillis() % 1000), builder.build());
        }
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
        stopRoutePollLoop();
        routePollScheduler.shutdownNow();
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
