package com.astronous.astrowallet;

import android.os.Bundle;
import android.view.WindowManager;
import com.astronous.astrowallet.paymentcapture.PaymentCapturePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio: captura de pagamentos pelas notificações.
        registerPlugin(PaymentCapturePlugin.class);
        super.onCreate(savedInstanceState);

        // Privacidade: esconde o conteúdo do app na tela de apps recentes e
        // impede capturas/gravações de tela com valores financeiros.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
