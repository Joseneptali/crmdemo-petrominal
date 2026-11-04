package com.syrtel.crm

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.flow.MutableStateFlow
import com.syrtel.crm.ui.AppNav
import com.syrtel.crm.ui.SyrtelTheme

class MainActivity : ComponentActivity() {
    /** Conversación pedida desde una notificación; AppNav la consume. */
    val pendingConversation = MutableStateFlow<String?>(null)

    private val askNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handle(intent)
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        setContent { SyrtelTheme { AppNav(this) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        intent?.getStringExtra(EXTRA_CONVERSATION)?.let { pendingConversation.value = it }
    }

    companion object {
        const val EXTRA_CONVERSATION = "conversation_id"
    }
}
