package app.bravaburgers.repartidor.nativeapp.mapbox

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.doOnLayout
import androidx.core.view.updateLayoutParams
import app.bravaburgers.repartidor.nativeapp.BuildConfig
import app.bravaburgers.repartidor.nativeapp.R
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.dropin.NavigationView

class BravaMapboxDeliveryActivity : AppCompatActivity() {
    private lateinit var navigationView: NavigationView
    private lateinit var bottomPanel: View
    private lateinit var maneuverCard: LinearLayout
    private lateinit var mapControls: LinearLayout
    private lateinit var speedOrb: TextView
    private lateinit var bottomExpandSection: View
    private lateinit var btnExpandPanel: ImageButton

    private var bottomPanelExpanded = false

    private val insetHandler = Handler(Looper.getMainLooper())
    private var insetRunnable: Runnable? = null
    private var lastInsetApplyAt = 0L

    /** Reserva fija arriba: la cámara no salta cuando aparece/desaparece la tarjeta de maniobra. */
    private val maneuverTopReserveDp = 118f

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
        MapboxNavigationApp.attach(this)
        BravaMapboxNavigation.resetSession()

        val destLat = intent.getDoubleExtra(EXTRA_DEST_LAT, Double.NaN)
        val destLng = intent.getDoubleExtra(EXTRA_DEST_LNG, Double.NaN)
        val originLat = intent.getDoubleExtra(EXTRA_ORIGIN_LAT, Double.NaN)
        val originLng = intent.getDoubleExtra(EXTRA_ORIGIN_LNG, Double.NaN)
        if (destLat.isNaN() || destLng.isNaN() || originLat.isNaN() || originLng.isNaN()) {
            Toast.makeText(this, "Destino inválido", Toast.LENGTH_SHORT).show()
            MapboxNavigationApp.detach(this)
            setResult(RESULT_CANCELED)
            finish()
            return
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    setResult(RESULT_CANCELED)
                    finish()
                }
            },
        )

        setContentView(R.layout.activity_brava_mapbox_delivery)
        navigationView = findViewById(R.id.bravaNavigationView)
        bottomPanel = findViewById(R.id.bravaBottomPanel)
        maneuverCard = findViewById(R.id.bravaManeuverCard)
        mapControls = findViewById(R.id.bravaMapControls)
        speedOrb = findViewById(R.id.bravaNavSpeed)
        bottomExpandSection = findViewById(R.id.bravaBottomExpandSection)
        btnExpandPanel = findViewById(R.id.bravaBtnExpandPanel)
        btnExpandPanel.setOnClickListener { setBottomPanelExpanded(!bottomPanelExpanded) }

        BravaMapboxDropInUi.applyBravaOptions(navigationView)
        BravaMapboxViewportPadding.register(navigationView)
        BravaMapboxNavigation.bindNavigationView(navigationView)

        BravaMapboxControls.wire(
            navigationView,
            findViewById(R.id.bravaBtnCompass),
            findViewById(R.id.bravaBtnVolume),
            findViewById<ImageButton>(R.id.bravaBtnRecenter),
            refreshCamera = { scheduleMapInsets() },
        )

        wireMapInsets()

        val maneuverDistance = findViewById<TextView>(R.id.bravaManeuverDistance)
        val maneuverStreet = findViewById<TextView>(R.id.bravaManeuverPrimary)
        val maneuverThen = findViewById<TextView>(R.id.bravaManeuverThen)
        val maneuverPrimaryIcon = findViewById<android.widget.ImageView>(R.id.bravaManeuverPrimaryIcon)

        val address = intent.getStringExtra(EXTRA_ADDRESS).orEmpty()
        findViewById<TextView>(R.id.bravaNavAddress).text = address
        findViewById<TextView>(R.id.bravaNavAddress).visibility =
            if (address.isBlank()) View.GONE else View.VISIBLE

        val etaView = findViewById<TextView>(R.id.bravaNavEta)
        val etaClockView = findViewById<TextView>(R.id.bravaNavEtaClock)

        BravaMapboxNavigation.onRouteProgress = { distM, durSec ->
            runOnUiThread {
                if (distM == null || durSec == null) return@runOnUiThread
                val summary = BravaNavTripFormat.format(distM, durSec)
                etaView.text = summary.primaryLine
                val clock = summary.etaClockLine
                if (clock != null) {
                    etaClockView.text = "Llega antes de la(s) $clock"
                    etaClockView.visibility = View.VISIBLE
                }
            }
        }
        BravaMapboxNavigation.onManeuver = { m ->
            runOnUiThread {
                if (m == null) {
                    maneuverCard.visibility = View.GONE
                    return@runOnUiThread
                }
                maneuverCard.visibility = View.VISIBLE
                maneuverPrimaryIcon.setImageResource(m.primaryIconRes)
                maneuverDistance.text = m.distanceLabel
                maneuverStreet.text = m.streetLabel
                if (!m.thenLine.isNullOrBlank()) {
                    maneuverThen.visibility = View.VISIBLE
                    maneuverThen.text = "↑  Luego · ${m.thenLine}"
                } else {
                    maneuverThen.visibility = View.GONE
                }
            }
        }
        BravaMapboxNavigation.onDrivingSpeedKmh = { kmh ->
            runOnUiThread {
                speedOrb.text =
                    if (kmh != null) {
                        "$kmh\nkm/h"
                    } else {
                        "0\nkm/h"
                    }
            }
        }
        BravaMapboxNavigation.onRouteFailure = { msg ->
            runOnUiThread {
                Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            }
        }
        BravaMapboxNavigation.onActiveGuidanceStarted = {
            runOnUiThread {
                BravaMapboxCameraAnchor.invalidatePaddingCache()
                scheduleMapInsets(force = true)
                refreshDidiCamera()
                navigationView.postDelayed({ scheduleMapInsets(force = true); refreshDidiCamera() }, 400)
                navigationView.postDelayed({ scheduleMapInsets(force = true); refreshDidiCamera() }, 1200)
            }
        }
        BravaMapboxNavigation.onRoutesRefreshed = {
            runOnUiThread {
                refreshDidiCamera()
            }
        }

        findViewById<BravaSwipeButton>(R.id.bravaSwipeLlegue).onConfirmed = {
            setResult(RESULT_OK, Intent().putExtra(EXTRA_ORN, intent.getStringExtra(EXTRA_ORN)))
            finish()
        }

        startGuidanceWhenReady(originLat, originLng, destLat, destLng)
    }

    private fun setBottomPanelExpanded(expanded: Boolean) {
        bottomPanelExpanded = expanded
        bottomExpandSection.visibility = if (expanded) View.VISIBLE else View.GONE
        btnExpandPanel.setImageResource(
            if (expanded) {
                R.drawable.ic_brava_panel_chevron_down
            } else {
                R.drawable.ic_brava_panel_chevron_up
            },
        )
        bottomPanel.post { scheduleMapInsets(force = true) }
    }

    private fun wireMapInsets() {
        bottomPanel.doOnLayout { scheduleMapInsets() }
        bottomExpandSection.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            scheduleMapInsets(force = true)
        }
    }

    private fun refreshDidiCamera() {
        BravaMapboxCameraAnchor.retryViewportBinding(navigationView)
        BravaMapboxCameraAnchor.forceCameraRefresh(navigationView)
        navigationView.api.recenterCamera()
    }

    private fun scheduleMapInsets(force: Boolean = false) {
        insetRunnable?.let { insetHandler.removeCallbacks(it) }
        val run =
            Runnable {
                applyMapContentInsets(force)
            }
        insetRunnable = run
        insetHandler.postDelayed(run, if (force) 0 else 80)
    }

    private fun applyMapContentInsets(force: Boolean = false) {
        if (!::navigationView.isInitialized) return
        val now = SystemClock.uptimeMillis()
        if (!force && now - lastInsetApplyAt < 100) return
        lastInsetApplyAt = now

        val density = resources.displayMetrics.density
        val insets = ViewCompat.getRootWindowInsets(navigationView)
        val statusTop = insets?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
        val navBarBottom = insets?.getInsets(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
        val topPad = statusTop + (maneuverTopReserveDp * density).toInt()
        // Panel Brava + barra gestos + margen para que el puck (focal abajo) no quede tapado.
        val bottomPad =
            bottomPanel.height +
                navBarBottom +
                (28 * density).toInt()
        val side = (40 * density).toInt()

        val applied =
            BravaMapboxCameraAnchor.applyBravaOverlayPadding(
                navigationView,
                topPx = topPad.toDouble(),
                bottomPx = bottomPad.toDouble(),
                sidePx = side.toDouble(),
            )
        if (!applied) {
            BravaMapboxViewportPadding.applyContentInsets(topPad, bottomPad, side)
        } else {
            BravaMapboxViewportPadding.applyContentInsets(0, 0, 0)
        }

        val floatAbovePanel = bottomPanel.height + navBarBottom + (12 * density).toInt()
        speedOrb.updateLayoutParams<android.widget.FrameLayout.LayoutParams> {
            bottomMargin = floatAbovePanel
        }
        mapControls.updateLayoutParams<android.widget.FrameLayout.LayoutParams> {
            bottomMargin = floatAbovePanel
        }
    }

    private fun startGuidanceWhenReady(
        originLat: Double,
        originLng: Double,
        destLat: Double,
        destLng: Double,
    ) {
        var attempts = 0
        fun tick() {
            if (isFinishing || isDestroyed) return
            val navReady = MapboxNavigationApp.current() != null
            if (navReady && BravaMapboxNavigation.isMapReady()) {
                BravaMapboxNavigation.requestActiveGuidance(
                    context = this,
                    originLat = originLat,
                    originLng = originLng,
                    destLat = destLat,
                    destLng = destLng,
                )
                return
            }
            if (attempts++ >= 80) {
                Toast.makeText(this, "Mapbox no respondió. Probá de nuevo.", Toast.LENGTH_LONG).show()
                setResult(RESULT_CANCELED)
                finish()
                return
            }
            navigationView.postDelayed({ tick() }, 50)
        }
        navigationView.postDelayed({ tick() }, 350)
    }

    override fun onDestroy() {
        BravaMapboxNavigation.onRouteProgress = null
        BravaMapboxNavigation.onManeuver = null
        BravaMapboxNavigation.onDrivingSpeedKmh = null
        BravaMapboxNavigation.onRouteFailure = null
        BravaMapboxNavigation.onActiveGuidanceStarted = null
        BravaMapboxNavigation.onRoutesRefreshed = null
        insetRunnable?.let { insetHandler.removeCallbacks(it) }
        BravaMapboxCameraAnchor.reset()
        if (::navigationView.isInitialized) {
            try {
                navigationView.api.startFreeDrive()
            } catch (_: Exception) {
            }
            BravaMapboxViewportPadding.unregister(navigationView)
            BravaMapboxNavigation.unbindNavigationView(navigationView)
        }
        BravaMapboxNavigation.stopActiveGuidance()
        MapboxNavigationApp.detach(this)
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
