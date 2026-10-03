package app.bravaburgers.repartidor.nativeapp

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import app.bravaburgers.repartidor.nativeapp.update.AppApkInstaller
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import app.bravaburgers.repartidor.nativeapp.push.PushRegistrar
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.bravaburgers.repartidor.nativeapp.ui.screens.AppUpdateGateScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.HandoffScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.LoginScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.NavigationScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.RouteListScreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaTheme
import app.bravaburgers.repartidor.nativeapp.viewmodel.RepartidorViewModel
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.viewmodel.RepartidorViewModelFactory
import app.bravaburgers.repartidor.nativeapp.util.BatteryOptHelper
import app.bravaburgers.repartidor.nativeapp.push.RouteLocalNotifier
import app.bravaburgers.repartidor.nativeapp.session.RouteSyncEvent
import androidx.navigation.NavHostController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalLifecycleOwner

private fun currentRouteOrn(nav: NavHostController): String? {
    val route = nav.currentBackStackEntry?.destination?.route ?: return null
    val m = Regex("^(?:nav|handoff)/(.+)$").find(route) ?: return null
    return m.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() }
}

private fun goToNavForStop(nav: NavHostController, orn: String) {
    nav.navigate("nav/$orn") {
        popUpTo("route") { inclusive = false }
        launchSingleTop = true
        restoreState = false
    }
}

private fun goToActiveStop(vm: RepartidorViewModel, nav: NavHostController) {
    val next = vm.nextStop() ?: return
    vm.setActiveOrn(next.orn)
    goToNavForStop(nav, next.orn)
}

private fun goToRouteHome(nav: NavHostController) {
    nav.navigate("route") {
        popUpTo("route") { inclusive = true }
        launchSingleTop = true
    }
}

private fun afterEntrega(
    vm: RepartidorViewModel,
    nav: NavHostController,
    ctx: android.content.Context,
    next: RouteStop?,
) {
    vm.stopNavigation(ctx)
    if (next != null) {
        vm.setActiveOrn(next.orn)
        goToNavForStop(nav, next.orn)
    } else {
        goToRouteHome(nav)
    }
}

private fun redirectAfterRemovedStop(
    vm: RepartidorViewModel,
    nav: NavHostController,
    ctx: android.content.Context,
    event: RouteSyncEvent,
    screenOrn: String?,
) {
    val hit =
        screenOrn != null &&
            event.removed.any { it.orn == screenOrn }
    if (!hit) return
    vm.stopNavigation(ctx)
    val next = event.nextStop
    if (next != null) {
        vm.setActiveOrn(next.orn)
        goToNavForStop(nav, next.orn)
    } else {
        goToRouteHome(nav)
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as BravaRepartidorApp
        setContent {
            BravaTheme {
                val vm: RepartidorViewModel =
                    viewModel(factory = RepartidorViewModelFactory(app.repository, app.realtime))
                val ui by vm.ui.collectAsState()
                val ctx = LocalContext.current
                val lifecycleOwner = LocalLifecycleOwner.current
                val authKey = ui.session?.token ?: "__logged_out__"
                val gateMode =
                    ui.appUpdateChecking && ui.appUpdate == null ||
                        ui.appUpdate?.required == true

                DisposableEffect(lifecycleOwner) {
                    val observer =
                        LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME) {
                                vm.refreshAppUpdate()
                            }
                        }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                }

                var notificationsReady by remember {
                    mutableStateOf(PushRegistrar.canPostNotifications(ctx))
                }
                val permLauncher =
                    rememberLauncherForActivityResult(
                        ActivityResultContracts.RequestMultiplePermissions(),
                    ) { _ ->
                        notificationsReady = PushRegistrar.canPostNotifications(ctx)
                    }

                LaunchedEffect(Unit) {
                    val want =
                        mutableListOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                        )
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        want.add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                    val missing =
                        want.filter {
                            ContextCompat.checkSelfPermission(ctx, it) != PackageManager.PERMISSION_GRANTED
                        }
                    if (missing.isNotEmpty()) permLauncher.launch(missing.toTypedArray())
                    else notificationsReady = PushRegistrar.canPostNotifications(ctx)
                }

                Box(modifier = Modifier.fillMaxSize()) {
                    if (gateMode) {
                        AppUpdateGateScreen(
                            statusLine =
                                when {
                                    ui.appUpdateChecking && ui.appUpdate == null ->
                                        "Comprobando si hay una versión nueva…"
                                    ui.appUpdate?.required == true ->
                                        "Hay una actualización obligatoria."
                                    else -> "Brava Repartidor"
                                },
                            showSpinner = ui.appUpdateChecking && ui.appUpdate == null,
                        )
                    }

                ui.appUpdate?.let { update ->
                    val needInstallPerm =
                        !AppApkInstaller.canInstallPackages(ctx) && !ui.appUpdateBusy
                    val mandatory = update.required
                    AlertDialog(
                        onDismissRequest = {
                            if (!mandatory) vm.dismissAppUpdate()
                        },
                        title = {
                            Text(
                                if (mandatory) {
                                    "Tenés que actualizar la app"
                                } else {
                                    "Actualización disponible"
                                },
                            )
                        },
                        text = {
                            Column {
                                Text(
                                    buildString {
                                        if (mandatory && !ui.appUpdateBusy) {
                                            append(
                                                "Esta versión ya no sirve para repartir. " +
                                                    "Instalá la ",
                                            )
                                        }
                                        append("Versión ")
                                        append(update.versionName)
                                        append(
                                            if (ui.appUpdateBusy) {
                                                " — descargando…"
                                            } else if (mandatory) {
                                                " para seguir."
                                            } else {
                                                ". Se instala desde la app (un toque)."
                                            },
                                        )
                                        if (update.releaseNotes.isNotBlank() && !ui.appUpdateBusy) {
                                            append("\n\n")
                                            append(update.releaseNotes)
                                        }
                                    },
                                )
                                if (ui.appUpdateBusy) {
                                    if (ui.appUpdateIndeterminate) {
                                        LinearProgressIndicator(
                                            modifier =
                                                Modifier
                                                    .fillMaxWidth()
                                                    .padding(top = 12.dp),
                                        )
                                    } else {
                                        LinearProgressIndicator(
                                            progress = { ui.appUpdateProgress / 100f },
                                            modifier =
                                                Modifier
                                                    .fillMaxWidth()
                                                    .padding(top = 12.dp),
                                        )
                                    }
                                }
                                ui.appUpdateError?.let { err ->
                                    Text(
                                        err,
                                        modifier = Modifier.padding(top = 10.dp),
                                    )
                                }
                                if (needInstallPerm) {
                                    Text(
                                        "Primero permití instalar actualizaciones de Brava Repartidor.",
                                        modifier = Modifier.padding(top = 10.dp),
                                    )
                                }
                            }
                        },
                        confirmButton = {
                            when {
                                needInstallPerm -> {
                                    TextButton(onClick = { vm.requestInstallPermission(ctx) }) {
                                        Text("Permitir instalación")
                                    }
                                }
                                ui.appUpdateBusy -> {
                                    TextButton(onClick = {}, enabled = false) {
                                        Text("Descargando…")
                                    }
                                }
                                else -> {
                                    TextButton(onClick = { vm.installAppUpdate(ctx) }) {
                                        Text("Actualizar ahora")
                                    }
                                }
                            }
                        },
                        dismissButton =
                            if (!ui.appUpdateBusy && !mandatory) {
                                {
                                    TextButton(onClick = { vm.dismissAppUpdate() }) {
                                        Text("Después")
                                    }
                                }
                            } else {
                                null
                            },
                    )
                }

                if (!gateMode) {
                key(authKey) {
                    val nav = rememberNavController()
                    val start = if (ui.session != null) "route" else "login"
                    var routeSyncDialog by remember { mutableStateOf<RouteSyncEvent?>(null) }

                    LaunchedEffect(Unit) {
                        vm.routeSyncEvents.collect { event ->
                            RouteLocalNotifier.show(
                                ctx,
                                event.title,
                                event.body,
                                if (event.routeCleared) "route_clear" else "route_removed",
                            )
                            redirectAfterRemovedStop(vm, nav, ctx, event, currentRouteOrn(nav))
                            routeSyncDialog = event
                        }
                    }

                    routeSyncDialog?.let { event ->
                        AlertDialog(
                            onDismissRequest = { routeSyncDialog = null },
                            title = { Text(event.title) },
                            text = { Text(event.body) },
                            confirmButton = {
                                TextButton(
                                    onClick = {
                                        routeSyncDialog = null
                                        if (event.nextStop != null && currentRouteOrn(nav) == null) {
                                            vm.setActiveOrn(event.nextStop.orn)
                                            goToNavForStop(nav, event.nextStop.orn)
                                        } else if (event.nextStop == null && currentRouteOrn(nav) != null) {
                                            goToRouteHome(nav)
                                        }
                                    },
                                ) {
                                    Text(
                                        when {
                                            event.nextStop != null -> "Siguiente parada"
                                            event.routeCleared -> "Entendido"
                                            else -> "OK"
                                        },
                                    )
                                }
                            },
                            dismissButton =
                                if (event.nextStop != null && currentRouteOrn(nav) != null) {
                                    {
                                        TextButton(onClick = { routeSyncDialog = null }) {
                                            Text("Seguir acá")
                                        }
                                    }
                                } else {
                                    null
                                },
                        )
                    }

                    LaunchedEffect(ui.session?.token) {
                        val token = ui.session?.token ?: return@LaunchedEffect
                        val dest = nav.currentBackStackEntry?.destination?.route
                        if (dest == "login" || dest == null) {
                            nav.navigate("route") {
                                popUpTo("login") { inclusive = true }
                                launchSingleTop = true
                            }
                            if (BatteryOptHelper.shouldPrompt(ctx)) {
                                BatteryOptHelper.openSettings(ctx)
                            }
                        }
                        if (notificationsReady) {
                            PushRegistrar.registerAfterLogin(ctx, app.repository, token)
                        }
                    }

                    NavHost(navController = nav, startDestination = start) {
                    composable("login") {
                        LoginScreen(
                            loading = ui.loading,
                            error = ui.error,
                            onLogin = vm::login,
                        )
                    }
                    composable("route") {
                        val session = ui.session ?: return@composable
                        RouteListScreen(
                            session = session,
                            stops = ui.stops,
                            connected = ui.connected,
                            refreshing = ui.refreshing,
                            tripStarted = ui.tripStarted,
                            loading = ui.loading,
                            onRefresh = { vm.refreshRoute(pull = true) },
                            onLogout = { vm.logout() },
                            onIniciarRecorrido = {
                                vm.iniciarRecorrido { next ->
                                    if (next != null) {
                                        vm.setActiveOrn(next.orn)
                                        goToNavForStop(nav, next.orn)
                                    }
                                }
                            },
                            onContinuar = { goToActiveStop(vm, nav) },
                        )
                    }
                    composable("nav/{orn}") { entry ->
                        val orn = entry.arguments?.getString("orn").orEmpty()
                        val stop = vm.stopFor(orn)
                        if (stop == null) {
                            LaunchedEffect(orn) {
                                vm.stopNavigation(ctx)
                                val next = vm.nextStop()
                                if (next != null) {
                                    vm.setActiveOrn(next.orn)
                                    goToNavForStop(nav, next.orn)
                                } else {
                                    goToRouteHome(nav)
                                }
                            }
                            return@composable
                        }
                        NavigationScreen(
                            stop = stop,
                            navRoute = ui.navRoute,
                            navManeuver = ui.navManeuver,
                            navInstructionPrimary = ui.navInstructionPrimary,
                            navInstructionThen = ui.navInstructionThen,
                            navInstructionThenModifier = ui.navInstructionThenModifier,
                            navManeuverModifier = ui.navManeuverModifier,
                            navSpeedKmh = ui.navSpeedKmh,
                            navEtaMinutes = ui.navEtaMinutes,
                            navRouteKm = ui.navRouteKm,
                            navMeta = ui.navMeta,
                            navLoading = ui.navLoading,
                            navDest = ui.navDest,
                            navDriver = ui.navDriver,
                            navDriverBearing = ui.navDriverBearing,
                            navVoiceOn = ui.navVoiceOn,
                            onToggleVoice = vm::toggleNavVoice,
                            onStartNavigation = { vm.beginNavigation(ctx, orn) },
                            onBack = {
                                vm.stopNavigation(ctx)
                                nav.popBackStack()
                            },
                            onLlegue = {
                                vm.confirmarLlegada(orn) {
                                    nav.navigate("handoff/$orn") {
                                        popUpTo("route")
                                    }
                                }
                            },
                        )
                    }
                    composable("handoff/{orn}") { entry ->
                        val orn = entry.arguments?.getString("orn").orEmpty()
                        LaunchedEffect(orn) {
                            vm.ensureStopDetail(orn)
                        }
                        val stop = vm.stopFor(orn)
                        if (stop == null) {
                            LaunchedEffect(orn) {
                                vm.stopNavigation(ctx)
                                val next = vm.nextStop()
                                if (next != null) {
                                    vm.setActiveOrn(next.orn)
                                    goToNavForStop(nav, next.orn)
                                } else {
                                    goToRouteHome(nav)
                                }
                            }
                            return@composable
                        }
                        HandoffScreen(
                            stop = stop,
                            whatsappSent = !stop.llegadaAt.isNullOrBlank(),
                            onBack = { nav.popBackStack() },
                            onEntregado = {
                                vm.markEntregada(orn) { next ->
                                    afterEntrega(vm, nav, ctx, next)
                                }
                            },
                        )
                    }
                    }
                }
                }
                }
            }
        }
    }
}
