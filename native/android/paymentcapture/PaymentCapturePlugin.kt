package app.astrowallet.paymentcapture

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Ponte entre o app (JavaScript, src/platform/native.js) e o Android:
 *   isGranted     a pessoa já autorizou o acesso a notificações?
 *   openSettings  abre a tela do Android onde se autoriza (direto no Astro Wallet, se possível)
 *   openAppInfo   abre "Informações do app" (para "Permitir configurações restritas")
 *   setEnabled    liga/desliga a captura e define quais apps ler
 *   getPending    entrega os avisos guardados
 *   ack           apaga os avisos já entregues
 */
@CapacitorPlugin(name = "PaymentCapture")
class PaymentCapturePlugin : Plugin() {

    private val listenerComponent
        get() = ComponentName(context, PaymentNotificationListener::class.java)

    @PluginMethod
    fun isGranted(call: PluginCall) {
        val granted = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        val direct = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listenerComponent.flattenToString())
        } else null
        val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        try {
            activity.startActivity(direct ?: list)
        } catch (e: Exception) {
            try {
                activity.startActivity(list)
            } catch (e2: Exception) {
                return call.reject("Não foi possível abrir as configurações")
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun openAppInfo(call: PluginCall) {
        try {
            activity.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
            )
            call.resolve()
        } catch (e: Exception) {
            call.reject("Não foi possível abrir as informações do app")
        }
    }

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val packages = mutableSetOf<String>()
        call.getArray("packages", JSArray())?.let { array ->
            for (i in 0 until array.length()) array.optString(i)?.takeIf { it.isNotBlank() }?.let(packages::add)
        }
        PaymentCaptureStore.setEnabled(context, enabled, packages)
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Garante que o serviço esteja conectado depois de autorizado.
            try {
                NotificationListenerService.requestRebind(listenerComponent)
            } catch (e: Exception) {
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun getPending(call: PluginCall) {
        val queue = PaymentCaptureStore.read(context)
        val items = JSArray()
        for (i in 0 until queue.length()) items.put(JSObject.fromJSONObject(queue.getJSONObject(i)))
        call.resolve(JSObject().put("items", items))
    }

    @PluginMethod
    fun ack(call: PluginCall) {
        val ids = mutableSetOf<String>()
        call.getArray("ids", JSArray())?.let { array ->
            for (i in 0 until array.length()) array.optString(i)?.let(ids::add)
        }
        PaymentCaptureStore.remove(context, ids)
        call.resolve()
    }
}
