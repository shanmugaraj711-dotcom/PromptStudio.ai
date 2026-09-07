package promptstudio.ai

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
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
import androidx.lifecycle.lifecycleScope
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val appOrigin = BuildConfig.FORGE_WEB_ORIGIN.trimEnd('/')
    private val credentialManager by lazy { CredentialManager.create(this) }

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
            lifecycleScope.launch {
                try {
                    if (!isAppOrigin()) {
                        sendGoogleResult(
                            requestId,
                            null,
                            "Native Google sign-in is unavailable for this origin."
                        )
                        return@launch
                    }

                    val credential = try {
                        getGoogleCredential()
                    } catch (error: NoCredentialException) {
                        // Credential Manager's normal Google ID option can return
                        // NoCredentialException when there is no eligible stored
                        // credential. For a user-triggered Google button, Android's
                        // SignInWithGoogleOption is the documented fallback that
                        // launches the explicit Google sign-in flow.
                        getGoogleButtonCredential()
                    }

                    if (credential !is CustomCredential ||
                        credential.type != TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                    ) {
                        throw IllegalStateException("Google ID token credential was not returned.")
                    }

                    val googleIdTokenCredential =
                        GoogleIdTokenCredential.createFrom(credential.data)
                    sendGoogleResult(requestId, googleIdTokenCredential.idToken, null)
                } catch (error: Exception) {
                    val detail = error.message?.takeIf { it.isNotBlank() }
                        ?: error::class.java.simpleName
                        ?: "Native Google sign-in failed."
                    sendGoogleResult(requestId, null, detail)
                }
            }
        }
    }

    private suspend fun getGoogleCredential(): androidx.credentials.GetCredentialResponse {
        val googleIdOption = com.google.android.libraries.identity.googleid.GetGoogleIdOption.Builder()
            .setServerClientId(getString(R.string.google_web_client_id))
            .setFilterByAuthorizedAccounts(false)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        return credentialManager.getCredential(
            context = this@MainActivity,
            request = request
        )
    }

    private suspend fun getGoogleButtonCredential(): androidx.credentials.GetCredentialResponse {
        val signInWithGoogleOption = GetSignInWithGoogleOption.Builder(
            getString(R.string.google_web_client_id)
        ).build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(signInWithGoogleOption)
            .build()

        return credentialManager.getCredential(
            context = this@MainActivity,
            request = request
        )
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

        webView.evaluateJavascript(
            "window.__promptStudioNativeGoogleResult(${JSONObject.quote(payload.toString())})",
            null
        )
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

    @Deprecated("Android framework callback retained for WebView file chooser compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
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
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.removeJavascriptInterface("PromptStudioNativeGoogle")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST = 4101
    }
}
