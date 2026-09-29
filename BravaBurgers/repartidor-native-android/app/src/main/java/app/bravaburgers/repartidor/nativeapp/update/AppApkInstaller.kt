package app.bravaburgers.repartidor.nativeapp.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

object AppApkInstaller {
    private val client =
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build()

    fun canInstallPackages(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return context.packageManager.canRequestPackageInstalls()
    }

    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent =
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        context.startActivity(intent)
    }

    suspend fun downloadApk(
        context: Context,
        url: String,
        versionCode: Int,
        onProgress: (Int) -> Unit,
    ): File {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val outFile = File(dir, "brava-repartidor-$versionCode.apk")
        val req = Request.Builder().url(url).get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw IllegalStateException("download_failed_${resp.code}")
            }
            val body = resp.body ?: throw IllegalStateException("empty_body")
            val total = body.contentLength()
            body.byteStream().use { input ->
                outFile.outputStream().use { output ->
                    val buf = ByteArray(8192)
                    var read: Int
                    var done = 0L
                    while (input.read(buf).also { read = it } != -1) {
                        output.write(buf, 0, read)
                        done += read
                        if (total > 0L) {
                            onProgress(((done * 100) / total).toInt().coerceIn(0, 100))
                        } else {
                            onProgress(-1)
                        }
                    }
                }
            }
        }
        onProgress(100)
        return outFile
    }

    fun launchInstall(context: Context, apk: File) {
        if (!apk.isFile) throw IllegalStateException("apk_missing")
        val uri =
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apk,
            )
        val intent =
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        context.startActivity(intent)
    }
}
