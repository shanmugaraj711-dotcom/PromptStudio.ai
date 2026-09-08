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
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.security.SecureRandom

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingGoogleRequestId: String? = null

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
            loadIfOnline()
        } else {
            webView.restoreState(savedInstanceState)
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
            // WebView JavaScript bridge calls run on a private WebView thread.
            // Move all Activity/WebView/Credential Manager work onto the UI lifecycle.
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

                        // Current Google guidance uses Credential Manager. The explicit
                        // Sign in with Google option is intended for a user-initiated
                        // Google button and also covers accounts requiring re-authentication.
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
                        sendGoogleResult(requestId, null, formatGoogleError(error))
                    } catch (error: GoogleIdTokenParsingException) {
                        logGoogleFailure("googleIdTokenParsing", error)
                        sendGoogleResult(requestId, null, formatGoogleError(error))
                    } catch (error: Exception) {
                        logGoogleFailure("credentialManagerUnexpected", error)
                        sendGoogleResult(requestId, null, formatGoogleError(error))
                    } finally {
                        pendingGoogleRequestId = null
                    }
                }
            }
        }
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
        Log.e(TAG, "Credential Manager Google failure stage=$stage chain=$chain")
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
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.removeJavascriptInterface("PromptStudioNativeGoogle")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 4101
        private const val TAG = "PromptStudioGoogle"
    }
}
