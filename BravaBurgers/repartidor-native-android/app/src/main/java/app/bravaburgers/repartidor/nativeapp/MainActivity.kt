package app.bravaburgers.repartidor.nativeapp

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
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
import app.bravaburgers.repartidor.nativeapp.ui.screens.HandoffScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.LoginScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.NavigationScreen
import app.bravaburgers.repartidor.nativeapp.ui.screens.RouteListScreen
import app.bravaburgers.repartidor.nativeapp.ui.theme.BravaTheme
import app.bravaburgers.repartidor.nativeapp.viewmodel.RepartidorViewModel
import app.bravaburgers.repartidor.nativeapp.data.RouteStop
import app.bravaburgers.repartidor.nativeapp.viewmodel.RepartidorViewModelFactory
import app.bravaburgers.repartidor.nativeapp.util.BatteryOptHelper
import androidx.navigation.NavHostController

private fun goToNavForStop(nav: NavHostController, orn: String) {
    nav.navigate("nav/$orn") {
        popUpTo("route") { inclusive = false }
        launchSingleTop = true
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
    next: RouteStop?,
) {
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
                val nav = rememberNavController()
                val ctx = LocalContext.current
                val start = if (ui.session != null) "route" else "login"

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

                LaunchedEffect(ui.session?.token, notificationsReady) {
                    val token = ui.session?.token ?: return@LaunchedEffect
                    if (notificationsReady) {
                        PushRegistrar.registerAfterLogin(ctx, app.repository, token)
                    }
                }

                LaunchedEffect(ui.session) {
                    if (ui.session == null) {
                        nav.navigate("login") {
                            popUpTo(nav.graph.id) { inclusive = true }
                            launchSingleTop = true
                        }
                    } else {
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
                        val session = ui.session
                        if (session == null) {
                            nav.navigate("login") { popUpTo(0) }
                            return@composable
                        }
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
                                goToRouteHome(nav)
                            }
                            return@composable
                        }
                        NavigationScreen(
                            stop = stop,
                            navRoute = ui.navRoute,
                            navManeuver = ui.navManeuver,
                            navMeta = ui.navMeta,
                            navLoading = ui.navLoading,
                            navDest = ui.navDest,
                            navDriver = ui.navDriver,
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
                                goToRouteHome(nav)
                            }
                            return@composable
                        }
                        HandoffScreen(
                            stop = stop,
                            whatsappSent = !stop.llegadaAt.isNullOrBlank(),
                            onBack = { nav.popBackStack() },
                            onEntregado = {
                                vm.stopNavigation(ctx)
                                vm.markEntregada(orn) { next ->
                                    afterEntrega(vm, nav, next)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}
