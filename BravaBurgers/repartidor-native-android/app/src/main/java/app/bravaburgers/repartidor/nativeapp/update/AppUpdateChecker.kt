package app.bravaburgers.repartidor.nativeapp.update

import app.bravaburgers.repartidor.nativeapp.BuildConfig
import com.squareup.moshi.Json
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

data class AppUpdateOffer(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val releaseNotes: String,
    /** Sin actualizar no se usa la app (sin botón «Después»). */
    val required: Boolean = true,
)

private data class UpdateManifestDto(
    @Json(name = "version_code") val versionCode: Int = 0,
    @Json(name = "version_name") val versionName: String = "",
    @Json(name = "apk_url") val apkUrl: String = "",
    @Json(name = "release_notes") val releaseNotes: String = "",
    @Json(name = "min_version_code") val minVersionCode: Int = 0,
    @Json(name = "force_update") val forceUpdate: Boolean = true,
)

object AppUpdateChecker {
    private val client =
        OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .build()

    private val moshi =
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
            .adapter(UpdateManifestDto::class.java)

    private fun manifestUrls(): List<String> =
        listOfNotNull(
            BuildConfig.UPDATE_MANIFEST.trim().takeIf { it.isNotEmpty() },
            BuildConfig.UPDATE_MANIFEST_GITHUB.trim().takeIf { it.isNotEmpty() },
        ).distinct()

    /** Compara con [BuildConfig.VERSION_CODE]; null si no hay update o falla la red. */
    fun fetchOfferIfNewer(): AppUpdateOffer? {
        for (url in manifestUrls()) {
            parseManifest(url)?.let { return it }
        }
        return null
    }

    private fun parseManifest(url: String): AppUpdateOffer? {
        return try {
            val req = Request.Builder().url(url).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body?.string().orEmpty()
                if (body.isBlank()) return null
                val manifest = moshi.fromJson(body) ?: return null
                val apk = manifest.apkUrl.trim()
                if (apk.isEmpty()) return null
                val installed = BuildConfig.VERSION_CODE
                val minRequired =
                    maxOf(
                        manifest.minVersionCode,
                        if (manifest.versionCode > installed) manifest.versionCode else 0,
                    )
                if (installed >= minRequired && manifest.versionCode <= installed) {
                    return null
                }
                val targetCode =
                    if (manifest.versionCode > installed) {
                        manifest.versionCode
                    } else {
                        minRequired
                    }
                AppUpdateOffer(
                    versionCode = targetCode,
                    versionName = manifest.versionName.ifBlank { "nueva" },
                    apkUrl = apk,
                    releaseNotes = manifest.releaseNotes.trim(),
                    required = manifest.forceUpdate,
                )
            }
        } catch (_: Exception) {
            null
        }
    }
}
