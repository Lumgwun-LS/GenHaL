package com.awajimaa.template

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.http.SslError
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

// NOTE: Both placeholders are replaced at build time by the GitHub Actions workflow.
private const val WEBSITE_URL   = "WEBSITE_URL_PLACEHOLDER"
private const val DASHBOARD_URL = "DASHBOARD_URL_PLACEHOLDER"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var ownerBtn: Button
    private var isOwnerMode = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Root frame holds the full-screen web view + floating owner-mode button
        val frame = FrameLayout(this)

        swipeRefresh = SwipeRefreshLayout(this)
        webView = WebView(this)
        swipeRefresh.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        frame.addView(
            swipeRefresh,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        // ── Owner-mode button ──────────────────────────────────────────────────
        // Small, semi-transparent circle at the bottom-right corner.
        // Customers never need it; the vendor uses it to flip into their dashboard.
        ownerBtn = Button(this)
        ownerBtn.text  = "⚙"
        ownerBtn.textSize = 18f
        ownerBtn.setTextColor(Color.WHITE)
        ownerBtn.alpha = 0.65f
        ownerBtn.setPadding(0, 0, 0, 0)

        val btnBg = GradientDrawable()
        btnBg.shape = GradientDrawable.OVAL
        btnBg.setColor(0xCC101828.toInt())   // semi-transparent dark navy
        ownerBtn.background = btnBg

        val btnSize   = dp(48)
        val btnParams = FrameLayout.LayoutParams(btnSize, btnSize, Gravity.BOTTOM or Gravity.END)
        btnParams.bottomMargin = dp(88)
        btnParams.marginEnd    = dp(20)
        frame.addView(ownerBtn, btnParams)

        setContentView(frame)

        // ── WebView settings ───────────────────────────────────────────────────
        webView.settings.apply {
            javaScriptEnabled                = true
            domStorageEnabled                = true
            loadWithOverviewMode             = true
            useWideViewPort                  = true
            setSupportZoom(false)
            allowFileAccess                  = false
            allowContentAccess               = false
            builtInZoomControls              = false
            displayZoomControls              = false
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = false  // keep all navigation inside the WebView

            override fun onPageFinished(view: WebView, url: String) {
                swipeRefresh.isRefreshing = false
                // Slightly dimmer in owner mode so it doesn't obstruct dashboard content
                ownerBtn.alpha = if (isOwnerMode) 0.50f else 0.65f
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(
                view: WebView,
                handler: SslErrorHandler,
                error: SslError,
            ) {
                // Proceed on SSL errors — vendors may run valid HTTPS certs that the
                // system trust store doesn't carry. Adjust if strict pinning is needed.
                handler.proceed()
            }
        }

        webView.webChromeClient = WebChromeClient()
        swipeRefresh.setOnRefreshListener { webView.reload() }

        // ── Owner-mode toggle ──────────────────────────────────────────────────
        ownerBtn.setOnClickListener {
            isOwnerMode = !isOwnerMode
            if (isOwnerMode) {
                // ← arrow indicates "tap to go back to your shop"
                ownerBtn.text = "←"
                webView.loadUrl(DASHBOARD_URL)
            } else {
                ownerBtn.text = "⚙"
                webView.loadUrl(WEBSITE_URL)
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(WEBSITE_URL)
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Convert dp → pixels using the display's density. */
    private fun dp(value: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics,
        ).toInt()

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            when {
                // 1. Navigate back within the current page if history exists
                webView.canGoBack() -> {
                    webView.goBack()
                    return true
                }
                // 2. Back while in owner mode → return to the shop
                isOwnerMode -> {
                    isOwnerMode = false
                    ownerBtn.text = "⚙"
                    webView.loadUrl(WEBSITE_URL)
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
