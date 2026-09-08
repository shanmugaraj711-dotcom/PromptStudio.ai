package promptstudio.ai

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
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
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.SecureRandom

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingGoogleRequestId: String? = null
    private var pendingBrowserState: String? = null
    private var pendingBrowserSessionId: String? = null

    private val appOrigin = BuildConfig.FORGE_WEB_ORIGIN.trimEnd('/')

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        webView = WebView(this)
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal)
        offlineView = createOfflineView()

        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        root.addView(progressBar, FrameLayout.LayoutParams(-1, 6))
        root.addView(offlineView, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        setupWebView()
        webView.addJavascriptInterface(NativeGoogleBridge(), "PromptStudioNativeGoogle")

        if (savedInstanceState == null) {
            handleNativeAuthCallback(intent)
            loadIfOnline()
        } else {
            webView.restoreState(savedInstanceState)
            handleNativeAuthCallback(intent)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNativeAuthCallback(intent)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }

        val cookies = android.webkit.CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url

                if (uri.scheme == "https" || uri.scheme == "http") {
                    return false
                }

                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: ActivityNotFoundException) {
                    Toast.makeText(this@MainActivity, "Unable to open this link.", Toast.LENGTH_SHORT).show()
                    true
                }
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
                offlineView.visibility = View.GONE
                webView.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                offlineView.visibility = View.GONE
                webView.visibility = View.VISIBLE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) showOfflineState()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                return try {
                    startActivityForResult(
                        fileChooserParams.createIntent().apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                        },
                        FILE_CHOOSER_REQUEST
                    )
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    Toast.makeText(this@MainActivity, "No file picker is available.", Toast.LENGTH_SHORT).show()
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
                    sendGoogleResult(
                        requestId,
                        null,
                        "Native Google sign-in is unavailable for this origin."
                    )
                    return@runOnUiThread
                }

                if (pendingGoogleRequestId != null) {
                    sendGoogleResult(requestId, null, "A Google sign-in request is already in progress.")
                    return@runOnUiThread
                }

                pendingGoogleRequestId = requestId
                lifecycleScope.launch {
                    try {
                        val webClientId = getString(R.string.google_web_client_id)
                        val nonce = generateSecureRandomNonce()

                        val googleOption = GetSignInWithGoogleOption.Builder(
                            serverClientId = webClientId
                        )
                            .setNonce(nonce)
                            .build()

                        val request = GetCredentialRequest.Builder()
                            .addCredentialOption(googleOption)
                            .build()

                        val credentialManager = CredentialManager.create(this@MainActivity)
                        val result = credentialManager.getCredential(
                            request = request,
                            context = this@MainActivity
                        )

                        val credential = result.credential
                        if (credential is CustomCredential &&
                            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                        ) {
                            val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
                            val idToken = googleCredential.idToken
                            if (idToken.isBlank()) {
                                throw IllegalStateException("Google sign-in returned an empty ID token.")
                            }
                            sendGoogleResult(requestId, idToken, null)
                        } else {
                            throw IllegalStateException(
                                "Unexpected credential type: ${credential::class.java.name}"
                            )
                        }
                    } catch (error: GetCredentialException) {
                        logGoogleFailure("credentialManager", error)
                        if (isCredentialReauthFailure(error)) {
                            startBrowserGoogleSignIn(requestId)
                            return@launch
                        }
                        sendGoogleResult(requestId, null, formatGoogleError(error))
                    } catch (error: GoogleIdTokenParsingException) {
                        logGoogleFailure("googleIdTokenParsing", error)
                        sendGoogleResult(requestId, null, formatGoogleError(error))
                    } catch (error: Exception) {
                        logGoogleFailure("credentialManagerUnexpected", error)
                        sendGoogleResult(requestId, null, formatGoogleError(error))
                    } finally {
                        if (pendingBrowserState == null) {
                            pendingGoogleRequestId = null
                        }
                    }
                }
            }
        }
    }

    private fun isCredentialReauthFailure(error: Throwable): Boolean {
        val chain = buildString {
            var current: Throwable? = error
            var depth = 0
            while (current != null && depth < 8) {
                append(current::class.java.name)
                append(' ')
                append(current.message.orEmpty())
                append(' ')
                current = current.cause
                depth++
            }
        }
        return chain.contains("GetCredentialCancellationException", ignoreCase = true) &&
            chain.contains("16") &&
            chain.contains("reauth", ignoreCase = true)
    }

    private fun startBrowserGoogleSignIn(requestId: String) {
        val state = generateSecureRandomNonce(24)
        pendingBrowserState = state
        pendingGoogleRequestId = requestId

        lifecycleScope.launch {
            try {
                val auth = withContext(Dispatchers.IO) {
                    createFirebaseGoogleAuthUri(state)
                }
                pendingBrowserSessionId = auth.sessionId

                CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build()
                    .launchUrl(this@MainActivity, Uri.parse(auth.authUri))
            } catch (error: Exception) {
                logGoogleFailure("browserAuthStart", error)
                clearBrowserAuthState()
                sendGoogleResult(requestId, null, formatGoogleError(error))
            }
        }
    }

    private data class FirebaseAuthUri(
        val authUri: String,
        val sessionId: String?
    )

    private fun createFirebaseGoogleAuthUri(state: String): FirebaseAuthUri {
        val callback = NATIVE_AUTH_CALLBACK_URI
        val body = JSONObject().apply {
            put("providerId", "google.com")
            put("continueUri", callback)
            put("authFlowType", "CODE_FLOW")
            put("oauthScope", "openid email profile")
            put("context", state)
        }

        val response = postJson(
            "https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=$FIREBASE_WEB_API_KEY",
            body.toString()
        )

        val authUri = response.optString("authUri")
        if (authUri.isBlank()) {
            throw IllegalStateException(
                "Firebase did not return a Google authorization URL: ${response.optString("error")}"
            )
        }

        return FirebaseAuthUri(
            authUri = authUri,
            sessionId = response.optString("sessionId").takeIf { it.isNotBlank() }
        )
    }

    private fun handleNativeAuthCallback(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "https" ||
            uri.host != AUTH_CALLBACK_HOST ||
            uri.path != "/native-auth-callback"
        ) {
            return
        }

        val requestId = pendingGoogleRequestId
        val expectedState = pendingBrowserState
        if (requestId.isNullOrBlank() || expectedState.isNullOrBlank()) {
            Log.w(TAG, "Ignoring native auth callback without a matching pending request")
            return
        }

        val returnedState = uri.getQueryParameter("state")
        if (returnedState != expectedState) {
            clearBrowserAuthState()
            sendGoogleResult(requestId, null, "Google sign-in state validation failed.")
            return
        }

        val error = uri.getQueryParameter("error")
        if (!error.isNullOrBlank()) {
            clearBrowserAuthState()
            sendGoogleResult(requestId, null, "Google sign-in failed: $error")
            return
        }

        if (uri.getQueryParameter("code").isNullOrBlank()) {
            clearBrowserAuthState()
            sendGoogleResult(requestId, null, "Google sign-in returned no authorization code.")
            return
        }

        lifecycleScope.launch {
            try {
                val callbackUrl = uri.toString()
                val result = withContext(Dispatchers.IO) {
                    exchangeFirebaseAuthCode(callbackUrl)
                }
                val googleIdToken = result.optString("oauthIdToken")
                if (googleIdToken.isBlank()) {
                    throw IllegalStateException(
                        "Firebase completed the browser flow but returned no Google ID token."
                    )
                }
                clearBrowserAuthState()
                sendGoogleResult(requestId, googleIdToken, null)
            } catch (authError: Exception) {
                logGoogleFailure("browserAuthExchange", authError)
                clearBrowserAuthState()
                sendGoogleResult(requestId, null, formatGoogleError(authError))
            }
        }
    }

    private fun exchangeFirebaseAuthCode(callbackUrl: String): JSONObject {
        val uri = Uri.parse(callbackUrl)
        val query = uri.query.orEmpty()
        val postBody = if (query.contains("providerId=")) {
            query
        } else if (query.isBlank()) {
            "providerId=google.com"
        } else {
            "$query&providerId=google.com"
        }

        val body = JSONObject().apply {
            put("requestUri", callbackUrl)
            put("postBody", postBody)
            put("returnSecureToken", true)
            put("returnIdpCredential", true)
            pendingBrowserSessionId?.let { put("sessionId", it) }
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
            connection.outputStream.use { output ->
                output.write(jsonBody.toByteArray(StandardCharsets.UTF_8))
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.use { input ->
                BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8)).readText()
            }.orEmpty()

            if (status !in 200..299) {
                val errorMessage = try {
                    JSONObject(responseText).optJSONObject("error")?.optString("message")
                } catch (_: Exception) {
                    null
                }
                throw IllegalStateException(
                    "Firebase auth request failed ($status): ${errorMessage ?: responseText.take(300)}"
                )
            }

            JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun clearBrowserAuthState() {
        pendingBrowserState = null
        pendingBrowserSessionId = null
        pendingGoogleRequestId = null
    }

    private fun generateSecureRandomNonce(byteLength: Int = 32): String {
        val randomBytes = ByteArray(byteLength)
        SecureRandom().nextBytes(randomBytes)
        return Base64.encodeToString(
            randomBytes,
            Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING
        )
    }

    private fun logGoogleFailure(stage: String, error: Throwable) {
        val chain = buildString {
            var current: Throwable? = error
            var depth = 0
            while (current != null && depth < 8) {
                if (depth > 0) append(" <- ")
                append(current::class.java.name)
                val message = current.message?.replace('\n', ' ')?.take(300)
                if (!message.isNullOrBlank()) {
                    append(": ")
                    append(message)
                }
                current = current.cause
                depth++
            }
        }
        Log.e(TAG, "Google auth failure stage=$stage chain=$chain")
    }

    private fun formatGoogleError(error: Throwable): String {
        val message = error.message?.takeIf { it.isNotBlank() }
        val className = error::class.java.simpleName.ifBlank { error::class.java.name }
        return if (message != null) {
            "[$className] $message"
        } else {
            "[$className] Google sign-in failed."
        }
    }

    private fun isAppOrigin(): Boolean {
        val current = webView.url ?: return false
        return current == appOrigin || current.startsWith("$appOrigin/")
    }

    private fun sendGoogleResult(requestId: String, idToken: String?, error: String?) {
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

    private fun loadIfOnline() {
        if (isOnline()) {
            progressBar.visibility = View.VISIBLE
            webView.visibility = View.VISIBLE
            offlineView.visibility = View.GONE
            webView.loadUrl(appOrigin)
        } else {
            showOfflineState()
        }
    }

    private fun showOfflineState() {
        progressBar.visibility = View.GONE
        webView.visibility = View.GONE
        offlineView.visibility = View.VISIBLE
    }

    private fun createOfflineView(): View {
        val container = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(48, 48, 48, 48)
            visibility = View.GONE
        }

        val title = TextView(this).apply {
            text = "You're offline"
            textSize = 22f
            gravity = android.view.Gravity.CENTER
        }
        val message = TextView(this).apply {
            text = "Connect to the internet and try again."
            textSize = 16f
            gravity = android.view.Gravity.CENTER
            setPadding(0, 16, 0, 24)
        }
        val retry = android.widget.Button(this).apply {
            text = "Try again"
            setOnClickListener { loadIfOnline() }
        }

        container.addView(title)
        container.addView(message)
        container.addView(retry)
        return container
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        pendingGoogleRequestId = null
        pendingBrowserState = null
        pendingBrowserSessionId = null
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.removeJavascriptInterface("PromptStudioNativeGoogle")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 4101
        private const val TAG = "PromptStudioGoogle"
        private const val AUTH_CALLBACK_HOST = "prompt-studio-ai-forge-test.vercel.app"
        private const val NATIVE_AUTH_CALLBACK_URI =
            "https://prompt-studio-ai-forge-test.vercel.app/native-auth-callback"
        private const val FIREBASE_WEB_API_KEY =
            "AIzaSyB34-r9vGA1G-12YiHqt99PZ7AA8Ghzlmg"
    }
}
