package app.bravaburgers.repartidor.nativeapp.ui

import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Modifier

/** Edge-to-edge: evita que botones queden bajo la barra Home/Back del sistema. */
fun Modifier.bravaSafeScreen(): Modifier =
    this.statusBarsPadding().navigationBarsPadding()

fun Modifier.bravaSafeBottom(): Modifier = navigationBarsPadding()

fun Modifier.bravaSafeTop(): Modifier = statusBarsPadding()
