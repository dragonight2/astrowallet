# Código nativo Android

Partes do app que precisam de código Android próprio (Kotlin). Entram no
projeto Android do Capacitor (pasta `android/`, criada na fase do APK).

## Captura automática de pagamentos (`paymentcapture/`)

| Arquivo | Função |
|---|---|
| `PaymentNotificationListener.kt` | Serviço que recebe as notificações (só depois que a pessoa autoriza) e guarda as de bancos/carteiras com "R$" |
| `PaymentCaptureStore.kt` | Fila privada desses avisos (máx. 60, até 30 dias; apagada ao desligar) |
| `PaymentCapturePlugin.kt` | Ponte com o app: permissão, abrir configurações, ligar/desligar, buscar e apagar avisos |

### Como ligar no projeto Android

1. Copiar `paymentcapture/` para `android/app/src/main/java/app/astrowallet/paymentcapture/`.
2. Registrar o plugin em `MainActivity`:
   ```kotlin
   class MainActivity : BridgeActivity() {
       override fun onCreate(savedInstanceState: Bundle?) {
           registerPlugin(PaymentCapturePlugin::class.java)
           super.onCreate(savedInstanceState)
       }
   }
   ```
3. Declarar o serviço em `android/app/src/main/AndroidManifest.xml`, dentro de `<application>`:
   ```xml
   <service
       android:name="app.astrowallet.paymentcapture.PaymentNotificationListener"
       android:label="Astro Wallet: pagamentos"
       android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
       android:exported="true">
       <intent-filter>
           <action android:name="android.service.notification.NotificationListenerService" />
       </intent-filter>
   </service>
   ```

### Regras da Play Store
O acesso a notificações é permissão sensível: precisa ser função principal
anunciada, desligada por padrão, com explicação antes de pedir, e citada na
política de privacidade. O app já cumpre isso (Ajustes → Captura automática).
Apps instalados fora da loja (APK de teste) podem mostrar "Configuração restrita"
no Android 13+; o app explica como liberar.
