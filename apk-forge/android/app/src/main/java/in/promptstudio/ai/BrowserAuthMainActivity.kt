package promptstudio.ai

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
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
    private lateinit var pendingPrefs: SharedPreferences
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingRequestId: String? = null
    private var pendingSessionId: String? = null
    private var pendingContext: String? = null
    private var webViewReady = false
    private var queuedResult: String? = null

    private val appOrigin = BuildConfig.FORGE_WEB_ORIGIN.trimEnd('/')
    private val callbackUri = "$appOrigin/native-auth-callback"
    private val callbackHost = Uri.parse(appOrigin).host.orEmpty()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingPrefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        restorePending()
        webView = WebView(this)
        setContentView(webView)
        configureWebView()
        webView.addJavascriptInterface(NativeGoogleBridge(), "PromptStudioNativeGoogle")

        val callbackIntent = intent
        handleAuthCallback(callbackIntent)
        if (savedInstanceState == null || callbackIntent?.data != null) webView.loadUrl(appOrigin)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        webViewReady = false
        queuedResult = null
        restorePending()
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
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                val normalized = url.trimEnd('/')
                if (normalized == appOrigin || url.startsWith("$appOrigin/")) {
                    webViewReady = true
                    flushQueuedResult()
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
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
                            .getCredential(this@BrowserAuthMainActivity, request)
                        val credential = result.credential
                        if (credential is CustomCredential &&
                            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                        ) {
                            val google = GoogleIdTokenCredential.createFrom(credential.data)
                            clearPending()
                            sendResult(requestId, google.idToken, null)
                        } else {
                            clearPending()
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
        pendingSessionId = null
        savePending()
        lifecycleScope.launch {
            try {
                val auth = withContext(Dispatchers.IO) { createAuthUri(context) }
                pendingSessionId = auth.second
                savePending()
                CustomTabsIntent.Builder().setShowTitle(true).build()
                    .launchUrl(this@BrowserAuthMainActivity, Uri.parse(auth.first))
            } catch (error: Exception) {
                clearPending()
                sendResult(requestId, null, formatError(error))
            }
        }
    }

    private fun createAuthUri(context: String): Pair<String, String> {
        val nativeContinueUri = Uri.parse(callbackUri).buildUpon()
            .appendQueryParameter("nativeAuth", "1")
            .appendQueryParameter("state", context)
            .build()
            .toString()
        val body = JSONObject().apply {
            put("providerId", "google.com")
            put("continueUri", nativeContinueUri)
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
        val isHttpsCallback = uri.scheme == "https" && uri.host == callbackHost && uri.path == "/native-auth-callback"
        val isNativeSchemeCallback = uri.scheme == NATIVE_SCHEME && uri.host == NATIVE_CALLBACK_HOST
        if (!isHttpsCallback && !isNativeSchemeCallback) return

        if (!restorePending()) {
            Log.w(TAG, "Ignoring auth callback without a valid pending session")
            return
        }

        val requestId = pendingRequestId
        val sessionId = pendingSessionId
        val expectedState = pendingContext
        val callbackState = uri.getQueryParameter("state")
        if (requestId.isNullOrBlank() || sessionId.isNullOrBlank() || expectedState.isNullOrBlank()) {
            clearPending()
            Log.w(TAG, "Ignoring auth callback with incomplete pending state")
            return
        }
        if (uri.getQueryParameter("nativeAuth") != "1") {
            clearPending()
            sendResult(requestId, null, "Invalid native sign-in callback.")
            return
        }
        if (callbackState != expectedState) {
            clearPending()
            sendResult(requestId, null, "Google sign-in state did not match the pending request.")
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
                val requestUri = if (isHttpsCallback) uri.toString() else buildHttpsCallbackUri(uri)
                val result = withContext(Dispatchers.IO) { finishAuth(requestUri, sessionId) }
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

    private fun buildHttpsCallbackUri(nativeUri: Uri): String {
        val builder = Uri.parse(callbackUri).buildUpon().clearQuery()
        for (name in nativeUri.queryParameterNames) {
            builder.appendQueryParameter(name, nativeUri.getQueryParameter(name))
        }
        return builder.build().toString()
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
                if (current != null) {
                    append(current!!::class.java.name).append(' ').append(current!!.message.orEmpty()).append(' ')
                    current = current!!.cause
                }
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
        val script = "window.__promptStudioNativeGoogleResult(${JSONObject.quote(payload.toString())})"
        runOnUiThread {
            if (!webViewReady) {
                queuedResult = script
                return@runOnUiThread
            }
            webView.evaluateJavascript(script, null)
        }
    }

    private fun flushQueuedResult() {
        val script = queuedResult ?: return
        queuedResult = null
        webView.evaluateJavascript(script, null)
    }

    private fun savePending() {
        val requestId = pendingRequestId ?: return
        val context = pendingContext ?: return
        pendingPrefs.edit()
            .putString(KEY_REQUEST_ID, requestId)
            .putString(KEY_SESSION_ID, pendingSessionId)
            .putString(KEY_STATE, context)
            .putLong(KEY_CREATED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun restorePending(): Boolean {
        val requestId = pendingPrefs.getString(KEY_REQUEST_ID, null)
        val sessionId = pendingPrefs.getString(KEY_SESSION_ID, null)
        val state = pendingPrefs.getString(KEY_STATE, null)
        val createdAt = pendingPrefs.getLong(KEY_CREATED_AT, 0L)
        if (requestId.isNullOrBlank() || sessionId.isNullOrBlank() || state.isNullOrBlank()) {
            pendingRequestId = null
            pendingSessionId = null
            pendingContext = null
            return false
        }
        if (createdAt <= 0L || System.currentTimeMillis() - createdAt > PENDING_TTL_MS) {
            clearPending()
            return false
        }
        pendingRequestId = requestId
        pendingSessionId = sessionId
        pendingContext = state
        return true
    }

    private fun clearPending() {
        pendingRequestId = null
        pendingSessionId = null
        pendingContext = null
        pendingPrefs.edit().remove(KEY_REQUEST_ID).remove(KEY_SESSION_ID).remove(KEY_STATE).remove(KEY_CREATED_AT).apply()
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
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.removeJavascriptInterface("PromptStudioNativeGoogle")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 4101
        private const val TAG = "PromptStudioGoogle"
        private const val FIREBASE_WEB_API_KEY = "AIzaSyB34-r9vGA1G-12YiHqt99PZ7AA8Ghzlmg"
        private const val NATIVE_SCHEME = "promptstudio"
        private const val NATIVE_CALLBACK_HOST = "native-auth-callback"
        private const val PREFS_NAME = "promptstudio_native_auth"
        private const val KEY_REQUEST_ID = "requestId"
        private const val KEY_SESSION_ID = "sessionId"
        private const val KEY_STATE = "state"
        private const val KEY_CREATED_AT = "createdAt"
        private const val PENDING_TTL_MS = 10 * 60 * 1000L
    }
}
