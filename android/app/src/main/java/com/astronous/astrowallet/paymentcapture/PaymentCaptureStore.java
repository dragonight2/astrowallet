package com.astronous.astrowallet.paymentcapture;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Fila dos avisos de pagamento capturados, guardada na área privada do app
 * (outros apps não acessam e ela não entra em backups do Android).
 * Fica aqui só até o Astro Wallet abrir e buscar; depois disso é apagada (ack).
 *
 * Limites de segurança: no máximo 60 avisos e por no máximo 30 dias.
 */
public final class PaymentCaptureStore {
    private static final String PREFS = "astro_payment_capture";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_PACKAGES = "packages";
    private static final String KEY_QUEUE = "queue";
    private static final int MAX_ITEMS = 60;
    private static final long MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000;

    private PaymentCaptureStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    public static synchronized Set<String> allowedPackages(Context context) {
        Set<String> set = prefs(context).getStringSet(KEY_PACKAGES, null);
        return set == null ? Collections.emptySet() : new HashSet<>(set);
    }

    /** Ligar/desligar. Ao desligar, apaga tudo o que estava na fila. */
    public static synchronized void setEnabled(Context context, boolean enabled, Set<String> packages) {
        SharedPreferences.Editor editor = prefs(context)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putStringSet(KEY_PACKAGES, enabled ? new HashSet<>(packages) : new HashSet<>());
        if (!enabled) editor.remove(KEY_QUEUE);
        editor.apply();
    }

    public static synchronized void add(Context context, JSONObject item) {
        long now = System.currentTimeMillis();
        JSONArray current = read(context);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject existing = current.optJSONObject(i);
            if (existing == null) continue;
            if (existing.optString("id").equals(item.optString("id"))) return; // já guardado
            if (now - existing.optLong("time") <= MAX_AGE_MS) kept.put(existing);
        }
        kept.put(item);
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, kept.length() - MAX_ITEMS); i < kept.length(); i++) trimmed.put(kept.opt(i));
        prefs(context).edit().putString(KEY_QUEUE, trimmed.toString()).apply();
    }

    public static synchronized JSONArray read(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_QUEUE, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Apaga da fila os avisos que o app já recebeu. */
    public static synchronized void remove(Context context, Set<String> ids) {
        JSONArray current = read(context);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item != null && !ids.contains(item.optString("id"))) kept.put(item);
        }
        prefs(context).edit().putString(KEY_QUEUE, kept.toString()).apply();
    }
}
