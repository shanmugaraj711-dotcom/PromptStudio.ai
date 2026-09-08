package promptstudio.ai

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.SecureRandom

class BrowserAuthMainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingRequestId: String? = null
    private var pendingSessionId: String? = null
    private var pendingContext: String? = null

    private val appOrigin = BuildConfig.FORGE_WEB_ORIGIN.trimEnd('/')

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        configureWebView()
        webView.addJavascriptInterface(NativeGoogleBridge(), "PromptStudioNativeGoogle")
        handleAuthCallback(intent)
        if (savedInstanceState == null && intent?.data == null) webView.loadUrl(appOrigin)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthCallback(intent)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = true
        android.webkit.CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "http" || uri.scheme == "https") return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: ActivityNotFoundException) {
                    true
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }
    }

    inner class NativeGoogleBridge {
        @JavascriptInterface
        fun isAvailable(): Boolean = true

        @JavascriptInterface
        fun signIn(requestId: String) {
            runOnUiThread {
                if (!isAppOrigin()) {
                    sendResult(requestId, null, "Native Google sign-in is unavailable for this origin.")
                    return@runOnUiThread
                }
                if (pendingRequestId != null) {
                    sendResult(requestId, null, "A Google sign-in request is already in progress.")
                    return@runOnUiThread
                }
                pendingRequestId = requestId
                lifecycleScope.launch {
                    try {
                        val option = GetSignInWithGoogleOption.Builder(
                            serverClientId = getString(R.string.google_web_client_id)
                        ).setNonce(secureNonce()).build()
                        val request = GetCredentialRequest.Builder()
                            .addCredentialOption(option)
                            .build()
                        val result = CredentialManager.create(this@BrowserAuthMainActivity)
                            .getCredential(request, this@BrowserAuthMainActivity)
                        val credential = result.credential
                        if (credential is CustomCredential &&
                            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                        ) {
                            val google = GoogleIdTokenCredential.createFrom(credential.data)
                            sendResult(requestId, google.idToken, null)
                        } else {
                            sendResult(requestId, null, "Unexpected Google credential type.")
                        }
                    } catch (error: GetCredentialException) {
                        log("credentialManager", error)
                        if (isReauthFailure(error)) {
                            startBrowserFallback(requestId)
                        } else {
                            clearPending()
                            sendResult(requestId, null, formatError(error))
                        }
                    } catch (error: GoogleIdTokenParsingException) {
                        clearPending()
                        sendResult(requestId, null, formatError(error))
                    } catch (error: Exception) {
                        clearPending()
                        sendResult(requestId, null, formatError(error))
                    }
                }
            }
        }
    }

    private fun startBrowserFallback(requestId: String) {
        val context = secureNonce(24)
        pendingContext = context
        lifecycleScope.launch {
            try {
                val auth = withContext(Dispatchers.IO) { createAuthUri(context) }
                pendingSessionId = auth.second
                CustomTabsIntent.Builder().setShowTitle(true).build()
                    .launchUrl(this@BrowserAuthMainActivity, Uri.parse(auth.first))
            } catch (error: Exception) {
                clearPending()
                sendResult(requestId, null, formatError(error))
            }
        }
    }

    private fun createAuthUri(context: String): Pair<String, String> {
        val body = JSONObject().apply {
            put("providerId", "google.com")
            put("continueUri", CALLBACK_URI)
            put("context", context)
            put("authFlowType", "CODE_FLOW")
            put("oauthScope", "openid email profile")
        }
        val response = postJson(
            "https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=$FIREBASE_WEB_API_KEY",
            body.toString()
        )
        val authUri = response.optString("authUri")
        val sessionId = response.optString("sessionId")
        if (authUri.isBlank() || sessionId.isBlank()) {
            throw IllegalStateException("Firebase did not return a usable Google authorization session.")
        }
        return authUri to sessionId
    }

    private fun handleAuthCallback(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "https" || uri.host != CALLBACK_HOST || uri.path != "/native-auth-callback") return
        val requestId = pendingRequestId
        val sessionId = pendingSessionId
        if (requestId.isNullOrBlank() || sessionId.isNullOrBlank()) {
            Log.w(TAG, "Ignoring auth callback without a pending session")
            return
        }
        if (uri.getQueryParameter("error") != null) {
            val error = uri.getQueryParameter("error") ?: "Google sign-in failed."
            clearPending()
            sendResult(requestId, null, error)
            return
        }
        if (uri.getQueryParameter("code").isNullOrBlank()) {
            clearPending()
            sendResult(requestId, null, "Google sign-in returned no authorization code.")
            return
        }
        lifecycleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { finishAuth(uri.toString(), sessionId) }
                val googleIdToken = result.optString("oauthIdToken")
                if (googleIdToken.isBlank()) {
                    throw IllegalStateException("Google authorization completed but no Google ID token was returned.")
                }
                clearPending()
                sendResult(requestId, googleIdToken, null)
            } catch (error: Exception) {
                clearPending()
                sendResult(requestId, null, formatError(error))
            }
        }
    }

    private fun finishAuth(requestUri: String, sessionId: String): JSONObject {
        val body = JSONObject().apply {
            put("requestUri", requestUri)
            put("sessionId", sessionId)
            put("returnSecureToken", true)
            put("returnIdpCredential", true)
        }
        return postJson(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=$FIREBASE_WEB_API_KEY",
            body.toString()
        )
    }

    private fun postJson(urlString: String, jsonBody: String): JSONObject {
        val connection = (URL(urlString).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 20000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Accept", "application/json")
        }
        return try {
            connection.outputStream.use { it.write(jsonBody.toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.use { BufferedReader(InputStreamReader(it, StandardCharsets.UTF_8)).readText() }.orEmpty()
            if (status !in 200..299) {
                val message = try { JSONObject(text).optJSONObject("error")?.optString("message") } catch (_: Exception) { null }
                throw IllegalStateException("Firebase auth request failed ($status): ${message ?: text.take(300)}")
            }
            JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }

    private fun isReauthFailure(error: Throwable): Boolean {
        val text = buildString {
            var current: Throwable? = error
            repeat(8) {
                if (current == null) return@repeat
                append(current!!::class.java.name).append(' ').append(current!!.message.orEmpty()).append(' ')
                current = current!!.cause
            }
        }
        return text.contains("GetCredentialCancellationException", true) &&
            text.contains("16") && text.contains("reauth", true)
    }

    private fun isAppOrigin(): Boolean {
        val current = webView.url ?: return false
        return current == appOrigin || current.startsWith("$appOrigin/")
    }

    private fun sendResult(requestId: String, idToken: String?, error: String?) {
        val payload = JSONObject().apply {
            put("requestId", requestId)
            put("idToken", idToken)
            put("error", error)
        }
        runOnUiThread {
            webView.evaluateJavascript(
                "window.__promptStudioNativeGoogleResult(${JSONObject.quote(payload.toString())})",
                null
            )
        }
    }

    private fun clearPending() {
        pendingRequestId = null
        pendingSessionId = null
        pendingContext = null
    }

    private fun secureNonce(bytes: Int = 32): String {
        val data = ByteArray(bytes)
        SecureRandom().nextBytes(data)
        return Base64.encodeToString(data, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }

    private fun formatError(error: Throwable): String {
        val message = error.message?.takeIf { it.isNotBlank() }
        return "[${error::class.java.simpleName}] ${message ?: "Google sign-in failed."}"
    }

    private fun log(stage: String, error: Throwable) {
        Log.e(TAG, "Google auth failure stage=$stage", error)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST) {
            fileCallback?.onReceiveValue(
                if (resultCode == RESULT_OK && data?.data != null) arrayOf(data.data!!) else null
            )
            fileCallback = null
        }
    }

    override fun onDestroy() {
        clearPending()
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.removeJavascriptInterface("PromptStudioNativeGoogle")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 4101
        private const val TAG = "PromptStudioGoogle"
        private const val CALLBACK_HOST = "prompt-studio-ai-forge-test.vercel.app"
        private const val CALLBACK_URI = "https://prompt-studio-ai-forge-test.vercel.app/native-auth-callback"
        private const val FIREBASE_WEB_API_KEY = "AIzaSyB34-r9vGA1G-12YiHqt99PZ7AA8Ghzlmg"
    }
}
