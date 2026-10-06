import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

val localProperties =
    Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) {
            file.inputStream().use { load(it) }
        }
    }

val mapboxAccessToken =
    localProperties.getProperty("MAPBOX_ACCESS_TOKEN")?.trim()
        ?: System.getenv("MAPBOX_ACCESS_TOKEN")?.trim()
        ?: ""

android {
    namespace = "app.bravaburgers.repartidor.nativeapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.bravaburgers.repartidor.nativeapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 76
        versionName = "2.0.0-alpha74"
        buildConfigField("String", "API_BASE", "\"https://www.bravaburgers.com.ar/api/pedido\"")
        buildConfigField("String", "MAPBOX_ACCESS_TOKEN", "\"$mapboxAccessToken\"")
        buildConfigField(
            "String",
            "UPDATE_MANIFEST",
            "\"https://www.bravaburgers.com.ar/repartidor-native-update.json\"",
        )
        buildConfigField(
            "String",
            "UPDATE_MANIFEST_GITHUB",
            "\"https://raw.githubusercontent.com/YezeGames/brava-burgers/main/BravaBurgers/repartidor-native-update.json\"",
        )
        manifestPlaceholders["MAPBOX_ACCESS_TOKEN"] = mapboxAccessToken
        resValue("string", "mapbox_access_token", mapboxAccessToken.ifBlank { "MISSING_MAPBOX_TOKEN" })
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("com.google.android.material:material:1.12.0")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("androidx.datastore:datastore-preferences:1.1.1")

    val mapboxNavVersion = "2.20.4"
    implementation("com.mapbox.navigation:ui-dropin:$mapboxNavVersion")
    implementation("com.mapbox.navigation:ui-maps:$mapboxNavVersion")
    implementation("com.mapbox.navigation:ui-voice:$mapboxNavVersion")
    implementation("com.google.android.gms:play-services-location:21.3.0")

    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    implementation(platform("io.github.jan-tennert.supabase:bom:2.6.1"))
    implementation("io.github.jan-tennert.supabase:supabase-kt")
    implementation("io.github.jan-tennert.supabase:gotrue-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.ktor:ktor-client-android:2.3.12")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
