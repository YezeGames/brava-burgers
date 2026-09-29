plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.bravaburgers.repartidor.nativeapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.bravaburgers.repartidor.nativeapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "2.0.0-alpha6"
        buildConfigField("String", "API_BASE", "\"https://www.bravaburgers.com.ar/api/pedido\"")
        buildConfigField("String", "MAP_STYLE", "\"https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json\"")
        buildConfigField("String", "OSRM_BASE", "\"https://router.project-osrm.org/route/v1/driving/\"")
        buildConfigField("String", "ROUTE_API", "\"https://www.bravaburgers.com.ar/api/osrm-route\"")
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
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
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

    implementation("org.maplibre.gl:android-sdk:11.7.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}

// FCM: copiá google-services.json desde mobile-repartidor cuando actives push
// plugins { id("com.google.gms.google-services") }
