package promptstudio.ai

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
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
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import org.json.JSONObject

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

                // Keep ALL normal web navigation inside the native shell.
                // OAuth/auth redirects, Vercel redirects, payment return pages,
                // and other HTTPS pages must not be handed to Chrome.
                if (uri.scheme == "https" || uri.scheme == "http") {
                    return false
                }

                // Non-web schemes belong to Android's external handlers.
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
            // JavaScript bridge methods are invoked on WebView's private background
            // thread. Do not touch WebView state here; even webView.url must be read
            // on the WebView/UI thread. Otherwise Android surfaces a generic
            // "Java exception was raised during method invocation" to JavaScript.
            runOnUiThread {
                try {
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

                    val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                        .requestIdToken(getString(R.string.google_web_client_id))
                        .requestEmail()
                        .build()

                    val client = GoogleSignIn.getClient(this@MainActivity, options)
                    pendingGoogleRequestId = requestId
                    startActivityForResult(client.signInIntent, GOOGLE_SIGN_IN_REQUEST)
                } catch (error: Exception) {
                    logGoogleFailure("startLegacyGoogleSignIn", error)
                    sendGoogleResult(requestId, null, formatGoogleError(error))
                }
            }
        }
    }

    private fun handleGoogleSignInResult(data: Intent?) {
        val requestId = pendingGoogleRequestId ?: return
        pendingGoogleRequestId = null

        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            val account = task.getResult(ApiException::class.java)
            val idToken = account.idToken
            if (idToken.isNullOrBlank()) {
                throw IllegalStateException("Google sign-in returned no ID token.")
            }
            sendGoogleResult(requestId, idToken, null)
        } catch (error: Exception) {
            logGoogleFailure("legacyGoogleSignInResult", error)
            sendGoogleResult(requestId, null, formatGoogleError(error))
        }
    }

    private fun logGoogleFailure(stage: String, error: Throwable) {
        val apiCode = (error as? ApiException)?.statusCode
        val chain = buildString {
            var current: Throwable? = error
            var depth = 0
            while (current != null && depth < 6) {
                if (depth > 0) append(" <- ")
                append(current::class.java.name)
                val message = current.message?.replace('\n', ' ')?.take(240)
                if (!message.isNullOrBlank()) {
                    append(": ")
                    append(message)
                }
                current = current.cause
                depth++
            }
        }
        Log.e(TAG, "Legacy Google Sign-In failure stage=$stage apiStatus=$apiCode chain=$chain")
    }

    private fun formatGoogleError(error: Throwable): String {
        val apiException = error as? ApiException
        val message = error.message?.takeIf { it.isNotBlank() }
        val className = error::class.java.simpleName.ifBlank { error::class.java.name }
        return if (apiException != null) {
            val detail = message ?: "Google sign-in failed."
            "[$className] status=${apiException.statusCode}: $detail"
        } else if (message != null) {
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

    @Deprecated("Android framework callback retained for WebView file chooser and Google sign-in compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == GOOGLE_SIGN_IN_REQUEST) {
            handleGoogleSignInResult(data)
            return
        }

        if (requestCode != FILE_CHOOSER_REQUEST) return
        val results = if (resultCode == RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        } else null
        fileCallback?.onReceiveValue(results)
        fileCallback = null
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
        private const val GOOGLE_SIGN_IN_REQUEST = 4102
        private const val TAG = "PromptStudioGoogle"
    }
}
