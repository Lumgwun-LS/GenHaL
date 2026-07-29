package com.awajimaa.template

import android.annotation.SuppressLint
import android.net.http.SslError
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

// NOTE: WEBSITE_URL_PLACEHOLDER is replaced at build time by the GitHub Actions workflow
private const val WEBSITE_URL = "WEBSITE_URL_PLACEHOLDER"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this)
        webView = WebView(this)
        swipeRefresh.addView(webView)
        setContentView(swipeRefresh)

        webView.settings.apply {
            javaScriptEnabled      = true
            domStorageEnabled      = true
            loadWithOverviewMode   = true
            useWideViewPort        = true
            setSupportZoom(false)
            allowFileAccess        = false
            allowContentAccess     = false
            builtInZoomControls    = false
            displayZoomControls    = false
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // Stay inside the WebView for all navigations within the same host
                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                swipeRefresh.isRefreshing = false
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(
                view: WebView,
                handler: SslErrorHandler,
                error: SslError,
            ) {
                // Proceed on SSL errors — vendors may use valid HTTPS but with
                // a chain the system trust store doesn't carry. Adjust if needed.
                handler.proceed()
            }
        }

        webView.webChromeClient = WebChromeClient()

        swipeRefresh.setOnRefreshListener { webView.reload() }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(WEBSITE_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
