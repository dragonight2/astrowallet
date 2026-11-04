package com.astronous.astrowallet.paymentcapture;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;

/**
 * Serviço que o Android chama a cada notificação nova, SÓ depois que a pessoa
 * autoriza em Configurações > Acesso a notificações.
 *
 * Filtros, nesta ordem (o resto é descartado na hora, sem guardar nada):
 *   1. a captura está ligada no Astro Wallet;
 *   2. a notificação é de um app de banco/carteira da lista;
 *   3. não é notificação fixa (ex.: "app rodando") nem resumo de grupo;
 *   4. o texto fala de valor em reais ("R$").
 * A interpretação (valor, loja, tipo) é feita depois, dentro do app, onde a
 * pessoa revisa e confirma.
 */
public class PaymentNotificationListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        Context context = getApplicationContext();
        if (!PaymentCaptureStore.isEnabled(context)) return;
        if (!PaymentCaptureStore.allowedPackages(context).contains(sbn.getPackageName())) return;

        Notification notification = sbn.getNotification();
        if (notification == null || sbn.isOngoing()) return;
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = notification.extras;
        if (extras == null) return;
        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        String body = text(big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT));
        if (!title.contains("R$") && !body.contains("R$")) return;

        try {
            JSONObject item = new JSONObject()
                .put("id", Integer.toHexString((sbn.getKey() + "|" + sbn.getPostTime()).hashCode()) + "-" + sbn.getPostTime())
                .put("pkg", sbn.getPackageName())
                .put("title", limit(title, 200))
                .put("text", limit(body, 500))
                .put("time", sbn.getPostTime());
            PaymentCaptureStore.add(context, item);
        } catch (Exception ignored) {}
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static String limit(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
