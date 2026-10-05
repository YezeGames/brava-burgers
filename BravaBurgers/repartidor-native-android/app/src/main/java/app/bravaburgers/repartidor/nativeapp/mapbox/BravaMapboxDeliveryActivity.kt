package app.bravaburgers.repartidor.nativeapp.mapbox



import android.content.Context

import android.content.Intent

import android.os.Bundle

import android.view.View

import android.widget.Button

import android.widget.TextView

import android.widget.Toast

import androidx.appcompat.app.AppCompatActivity

import app.bravaburgers.repartidor.nativeapp.BuildConfig

import app.bravaburgers.repartidor.nativeapp.R

import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp

import com.mapbox.navigation.dropin.NavigationView



/**

 * Mapbox drop-in en Activity nativa (sin Compose/AndroidView).

 */

class BravaMapboxDeliveryActivity : AppCompatActivity() {

    private lateinit var navigationView: NavigationView



    override fun onCreate(savedInstanceState: Bundle?) {

        super.onCreate(savedInstanceState)



        if (BuildConfig.MAPBOX_ACCESS_TOKEN.isBlank()) {

            Toast.makeText(this, "Mapbox no configurado en esta APK", Toast.LENGTH_LONG).show()

            setResult(RESULT_CANCELED)

            finish()

            return

        }

        if (!MapboxNavigationApp.isSetup()) {

            Toast.makeText(this, "Mapbox Navigation no inició", Toast.LENGTH_LONG).show()

            setResult(RESULT_CANCELED)

            finish()

            return

        }



        val destLat = intent.getDoubleExtra(EXTRA_DEST_LAT, Double.NaN)

        val destLng = intent.getDoubleExtra(EXTRA_DEST_LNG, Double.NaN)

        val originLat = intent.getDoubleExtra(EXTRA_ORIGIN_LAT, Double.NaN)

        val originLng = intent.getDoubleExtra(EXTRA_ORIGIN_LNG, Double.NaN)

        if (destLat.isNaN() || destLng.isNaN() || originLat.isNaN() || originLng.isNaN()) {

            Toast.makeText(this, "Destino inválido", Toast.LENGTH_SHORT).show()

            setResult(RESULT_CANCELED)

            finish()

            return

        }



        setContentView(R.layout.activity_brava_mapbox_delivery)

        navigationView = findViewById(R.id.bravaNavigationView)

        BravaMapboxDropInUi.applyBravaOptions(navigationView)

        BravaMapboxNavigation.bindNavigationView(navigationView)



        val bottomPanel = findViewById<View>(R.id.bravaBottomPanel)

        val speedChip = findViewById<TextView>(R.id.bravaNavSpeed)

        BravaMapboxDropInUi.pinMapControlsAboveBravaPanel(

            navigationView = navigationView,

            bravaBottomPanel = bottomPanel,

            speedChip = speedChip,

        )



        val address = intent.getStringExtra(EXTRA_ADDRESS).orEmpty()

        findViewById<TextView>(R.id.bravaNavAddress).text = address



        val etaView = findViewById<TextView>(R.id.bravaNavEta)

        val etaClockView = findViewById<TextView>(R.id.bravaNavEtaClock)

        BravaMapboxNavigation.onRouteProgress = { distM, durSec ->

            runOnUiThread {

                if (distM == null || durSec == null) return@runOnUiThread

                val summary = BravaNavTripFormat.format(distM, durSec)

                etaView.text = summary.primaryLine

                etaClockView.text = "Llegada ~${summary.etaClockLine}"

                etaClockView.visibility = View.VISIBLE

            }

        }

        BravaMapboxNavigation.onDrivingSpeedKmh = { kmh ->

            runOnUiThread {

                speedChip.text =

                    if (kmh != null) {

                        "$kmh\nkm/h"

                    } else {

                        "—\nkm/h"

                    }

            }

        }

        BravaMapboxNavigation.onRouteFailure = { msg ->

            runOnUiThread {

                Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

            }

        }



        navigationView.post {

            BravaMapboxNavigation.requestActiveGuidance(

                context = this,

                originLat = originLat,

                originLng = originLng,

                destLat = destLat,

                destLng = destLng,

            )

            BravaMapboxDropInUi.pinMapControlsAboveBravaPanel(

                navigationView,

                bottomPanel,

                speedChip,

            )

        }



        findViewById<Button>(R.id.bravaNavClose).setOnClickListener {

            setResult(RESULT_CANCELED)

            finish()

        }

        findViewById<Button>(R.id.bravaNavLlegue).setOnClickListener {

            setResult(RESULT_OK, Intent().putExtra(EXTRA_ORN, intent.getStringExtra(EXTRA_ORN)))

            finish()

        }

    }



    override fun onDestroy() {

        BravaMapboxNavigation.onRouteProgress = null

        BravaMapboxNavigation.onDrivingSpeedKmh = null

        BravaMapboxNavigation.onRouteFailure = null

        BravaMapboxNavigation.stopActiveGuidance()

        if (::navigationView.isInitialized) {

            BravaMapboxNavigation.unbindNavigationView(navigationView)

        }

        super.onDestroy()

    }



    companion object {

        const val EXTRA_ORN = "orn"

        const val EXTRA_DEST_LAT = "dest_lat"

        const val EXTRA_DEST_LNG = "dest_lng"

        const val EXTRA_ORIGIN_LAT = "origin_lat"

        const val EXTRA_ORIGIN_LNG = "origin_lng"

        const val EXTRA_ADDRESS = "address"



        fun intent(

            context: Context,

            orn: String,

            originLat: Double,

            originLng: Double,

            destLat: Double,

            destLng: Double,

            addressLine: String,

        ): Intent =

            Intent(context, BravaMapboxDeliveryActivity::class.java).apply {

                putExtra(EXTRA_ORN, orn)

                putExtra(EXTRA_ORIGIN_LAT, originLat)

                putExtra(EXTRA_ORIGIN_LNG, originLng)

                putExtra(EXTRA_DEST_LAT, destLat)

                putExtra(EXTRA_DEST_LNG, destLng)

                putExtra(EXTRA_ADDRESS, addressLine)

            }

    }

}

