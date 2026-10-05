import java.util.Properties
import org.gradle.authentication.http.BasicAuthentication

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

val localProperties =
    Properties().apply {
        val file = File(rootDir, "local.properties")
        if (file.exists()) {
            file.inputStream().use { load(it) }
        }
    }

val mapboxDownloadsToken =
    localProperties.getProperty("MAPBOX_DOWNLOADS_TOKEN")?.trim().orEmpty()
        .ifEmpty { providers.gradleProperty("MAPBOX_DOWNLOADS_TOKEN").orNull?.trim().orEmpty() }

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("https://api.mapbox.com/downloads/v2/releases/maven")
            credentials {
                username = "mapbox"
                password = mapboxDownloadsToken
            }
            authentication {
                create<BasicAuthentication>("basic")
            }
        }
    }
}

rootProject.name = "BravaRepartidorNative"
include(":app")
