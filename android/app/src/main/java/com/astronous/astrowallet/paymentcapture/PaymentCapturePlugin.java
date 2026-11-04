package com.astronous.astrowallet.paymentcapture;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import androidx.core.app.NotificationManagerCompat;
import com.astronous.astrowallet.BuildConfig;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;

/**
 * Ponte entre o app (JavaScript, src/platform/native.js) e o Android:
 *   isSupported   esta versão do app tem a captura? (só a da Play Store)
 *   isGranted     a pessoa já autorizou o acesso a notificações?
 *   openSettings  abre a tela do Android onde se autoriza (direto no Astro Wallet, se possível)
 *   openAppInfo   abre "Informações do app" (para "Permitir configurações restritas")
 *   setEnabled    liga/desliga a captura e define quais apps ler
 *   getPending    entrega os avisos guardados
 *   ack           apaga os avisos já entregues
 */
@CapacitorPlugin(name = "PaymentCapture")
public class PaymentCapturePlugin extends Plugin {

    private ComponentName listenerComponent() {
        return new ComponentName(getContext(), PaymentNotificationListener.class);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", BuildConfig.PAYMENT_CAPTURE);
        call.resolve(result);
    }

    @PluginMethod
    public void isGranted(PluginCall call) {
        boolean granted = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent list = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        Intent direct = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            direct = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
            direct.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listenerComponent().flattenToString());
        }
        try {
            getActivity().startActivity(direct != null ? direct : list);
        } catch (Exception e) {
            try {
                getActivity().startActivity(list);
            } catch (Exception e2) {
                call.reject("Não foi possível abrir as configurações");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível abrir as informações do app");
        }
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = BuildConfig.PAYMENT_CAPTURE && Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Set<String> packages = toSet(call.getArray("packages", new JSArray()));
        PaymentCaptureStore.setEnabled(getContext(), enabled, packages);
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Garante que o serviço esteja conectado depois de autorizado.
            try {
                NotificationListenerService.requestRebind(listenerComponent());
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSONArray queue = PaymentCaptureStore.read(getContext());
        JSArray items = new JSArray();
        for (int i = 0; i < queue.length(); i++) {
            try {
                items.put(JSObject.fromJSONObject(queue.getJSONObject(i)));
            } catch (Exception ignored) {}
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    @PluginMethod
    public void ack(PluginCall call) {
        PaymentCaptureStore.remove(getContext(), toSet(call.getArray("ids", new JSArray())));
        call.resolve();
    }

    private static Set<String> toSet(JSONArray array) {
        Set<String> set = new HashSet<>();
        if (array == null) return set;
        for (int i = 0; i < array.length(); i++) {
            String value = array.optString(i, "");
            if (!value.isEmpty()) set.add(value);
        }
        return set;
    }
}
