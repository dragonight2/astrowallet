package app.astrowallet.paymentcapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Serviço que o Android chama a cada notificação nova — SÓ depois que a pessoa
 * autoriza em Configurações → Acesso a notificações.
 *
 * Filtros, nesta ordem (o resto é descartado na hora, sem guardar nada):
 *   1. a captura está ligada no Astro Wallet;
 *   2. a notificação é de um app de banco/carteira da lista;
 *   3. não é uma notificação fixa (ex.: "app rodando") nem resumo de grupo;
 *   4. o texto fala de valor em reais ("R$").
 * A interpretação (valor, loja, tipo) é feita depois, dentro do app, onde a
 * pessoa revisa e confirma.
 */
class PaymentNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val context = applicationContext
        if (!PaymentCaptureStore.isEnabled(context)) return
        if (sbn.packageName !in PaymentCaptureStore.allowedPackages(context)) return

        val notification = sbn.notification ?: return
        if (sbn.isOngoing) return
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val extras = notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        if (!title.contains("R$") && !text.contains("R$")) return

        val item = JSONObject()
            .put("id", "${sbn.key}|${sbn.postTime}".hashCode().toString(16) + "-" + sbn.postTime)
            .put("pkg", sbn.packageName)
            .put("title", title.take(200))
            .put("text", text.take(500))
            .put("time", sbn.postTime)
        PaymentCaptureStore.add(context, item)
    }
}
