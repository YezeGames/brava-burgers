package app.bravaburgers.repartidor.nativeapp.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("brava_repartidor_session")

data class Session(
    val token: String,
    val login: String,
    val nombre: String,
    val telefono: String,
)

class SessionStore(private val context: Context) {
    private val keyToken = stringPreferencesKey("token")
    private val keyLogin = stringPreferencesKey("login")
    private val keyNombre = stringPreferencesKey("nombre")
    private val keyTelefono = stringPreferencesKey("telefono")

    val sessionFlow: Flow<Session?> =
        context.dataStore.data.map { prefs ->
            val token = prefs[keyToken]?.trim().orEmpty()
            if (token.isEmpty()) return@map null
            Session(
                token = token,
                login = prefs[keyLogin].orEmpty(),
                nombre = prefs[keyNombre].orEmpty(),
                telefono = prefs[keyTelefono].orEmpty(),
            )
        }

    suspend fun save(session: Session) {
        context.dataStore.edit { prefs ->
            prefs[keyToken] = session.token
            prefs[keyLogin] = session.login
            prefs[keyNombre] = session.nombre
            prefs[keyTelefono] = session.telefono
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
