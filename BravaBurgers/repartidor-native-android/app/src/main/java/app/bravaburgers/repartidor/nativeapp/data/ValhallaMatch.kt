package app.bravaburgers.repartidor.nativeapp.data

import org.json.JSONArray
import org.json.JSONObject

/** Respuestas /locate y /trace_route para posición map-matched. */
object ValhallaMatch {
    fun parseLocate(body: String): Pair<Double, Double>? {
        return try {
            val trimmed = body.trimStart()
            if (trimmed.startsWith("[")) {
                val root = JSONArray(body)
                val first = root.optJSONArray(0)?.optJSONObject(0) ?: return null
                val lat = first.optDouble("lat", Double.NaN)
                val lon = first.optDouble("lon", Double.NaN)
                if (lat.isNaN() || lon.isNaN()) null else Pair(lat, lon)
            } else {
                val root = JSONObject(body)
                val edge = root.optJSONArray("edges")?.optJSONObject(0) ?: return null
                val lat = edge.optDouble("correlated_lat", Double.NaN)
                val lon = edge.optDouble("correlated_lon", Double.NaN)
                if (lat.isNaN() || lon.isNaN()) null else Pair(lat, lon)
            }
        } catch (_: Exception) {
            null
        }
    }

    fun parseTraceLastPoint(body: String): Pair<Double, Double>? {
        return try {
            val root = JSONObject(body)
            if (root.has("error")) return null
            val leg = root.optJSONObject("trip")?.optJSONArray("legs")?.optJSONObject(0) ?: return null
            val coords = ValhallaPolyline.decode(leg.optString("shape", ""))
            coords.lastOrNull()
        } catch (_: Exception) {
            null
        }
    }
}
