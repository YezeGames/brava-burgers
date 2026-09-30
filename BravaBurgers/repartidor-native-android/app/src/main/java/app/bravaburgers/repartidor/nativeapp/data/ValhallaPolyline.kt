package app.bravaburgers.repartidor.nativeapp.data

/** Shape Valhalla polyline6 → lista lat/lng. */
object ValhallaPolyline {
    fun decode(encoded: String): List<Pair<Double, Double>> {
        if (encoded.isEmpty()) return emptyList()
        var index = 0
        var lat = 0
        var lng = 0
        val out = ArrayList<Pair<Double, Double>>()
        while (index < encoded.length) {
            var shift = 0
            var result = 0
            var b: Int
            do {
                b = encoded[index++].code - 63
                result = result or (b and 0x1f shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlat = if (result and 1 != 0) (result shr 1).inv() else result shr 1
            lat += dlat
            shift = 0
            result = 0
            do {
                b = encoded[index++].code - 63
                result = result or (b and 0x1f shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlng = if (result and 1 != 0) (result shr 1).inv() else result shr 1
            lng += dlng
            out.add(Pair(lat * 1e-6, lng * 1e-6))
        }
        return out
    }
}
