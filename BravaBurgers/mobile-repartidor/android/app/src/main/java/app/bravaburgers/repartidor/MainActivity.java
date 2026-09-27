package app.bravaburgers.repartidor;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

	private static final int BRAVA_PERM_REQUEST = 42001;
	public static final String PUSH_CHANNEL_ID = "brava_entregas";

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		createPushNotificationChannel();
		requestBravaRuntimePermissions();
	}

	private void createPushNotificationChannel() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
		NotificationChannel channel =
				new NotificationChannel(
						PUSH_CHANNEL_ID,
						"Entregas Brava",
						NotificationManager.IMPORTANCE_HIGH);
		channel.setDescription("Avisos cuando cocina te asigna paradas");
		NotificationManager nm = getSystemService(NotificationManager.class);
		if (nm != null) nm.createNotificationChannel(channel);
	}

	private void requestBravaRuntimePermissions() {
		List<String> want = new ArrayList<>();
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
				!= PackageManager.PERMISSION_GRANTED) {
			want.add(Manifest.permission.ACCESS_FINE_LOCATION);
			want.add(Manifest.permission.ACCESS_COARSE_LOCATION);
		}
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
					!= PackageManager.PERMISSION_GRANTED) {
				want.add(Manifest.permission.POST_NOTIFICATIONS);
			}
		}
		if (!want.isEmpty()) {
			ActivityCompat.requestPermissions(this, want.toArray(new String[0]), BRAVA_PERM_REQUEST);
		}
	}
}
