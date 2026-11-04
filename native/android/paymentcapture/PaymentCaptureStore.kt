package app.astrowallet.paymentcapture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Fila dos avisos de pagamento capturados, guardada na área privada do app
 * (outros apps não acessam). Fica aqui só até o Astro Wallet abrir e buscar;
 * depois de buscados, os avisos são apagados (ack).
 *
 * Limites de segurança: no máximo 60 avisos e por no máximo 30 dias.
 */
object PaymentCaptureStore {
    private const val PREFS = "astro_payment_capture"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_PACKAGES = "packages"
    private const val KEY_QUEUE = "queue"
    private const val MAX_ITEMS = 60
    private const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    @Synchronized
    fun allowedPackages(context: Context): Set<String> =
        prefs(context).getStringSet(KEY_PACKAGES, emptySet()) ?: emptySet()

    /** Ligar/desligar. Ao desligar, apaga tudo o que estava na fila. */
    @Synchronized
    fun setEnabled(context: Context, enabled: Boolean, packages: Set<String>) {
        val editor = prefs(context).edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putStringSet(KEY_PACKAGES, if (enabled) packages else emptySet())
        if (!enabled) editor.remove(KEY_QUEUE)
        editor.apply()
    }

    @Synchronized
    fun add(context: Context, item: JSONObject) {
        val now = System.currentTimeMillis()
        val kept = JSONArray()
        val current = read(context)
        for (i in 0 until current.length()) {
            val existing = current.getJSONObject(i)
            if (existing.optString("id") == item.optString("id")) return // já guardado
            if (now - existing.optLong("time") <= MAX_AGE_MS) kept.put(existing)
        }
        kept.put(item)
        val trimmed = JSONArray()
        val start = maxOf(0, kept.length() - MAX_ITEMS)
        for (i in start until kept.length()) trimmed.put(kept.get(i))
        prefs(context).edit().putString(KEY_QUEUE, trimmed.toString()).apply()
    }

    @Synchronized
    fun read(context: Context): JSONArray =
        try {
            JSONArray(prefs(context).getString(KEY_QUEUE, "[]"))
        } catch (e: Exception) {
            JSONArray()
        }

    /** Apaga da fila os avisos que o app já recebeu. */
    @Synchronized
    fun remove(context: Context, ids: Set<String>) {
        val current = read(context)
        val kept = JSONArray()
        for (i in 0 until current.length()) {
            val item = current.getJSONObject(i)
            if (item.optString("id") !in ids) kept.put(item)
        }
        prefs(context).edit().putString(KEY_QUEUE, kept.toString()).apply()
    }
}
