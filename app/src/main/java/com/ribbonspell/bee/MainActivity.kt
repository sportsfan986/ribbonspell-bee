package com.ribbonspell.bee

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var webView: WebView
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speechRecognizer: SpeechRecognizer? = null
    private var isContinuousListening = false
    private var listeningMode: String = "command"
    private var lastPartialText: String = ""
    private var lastPartialMatches: ArrayList<String>? = null

    companion object {
        private const val REQ_RECORD_AUDIO = 1001
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tts = TextToSpeech(this, this)
        webView = WebView(this)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.addJavascriptInterface(AndroidSpeechBridge(), "AndroidSpeechBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    request.grant(request.resources)
                }
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setSpeechRate(0.92f)
            tts?.setPitch(1.04f)
            tts?.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "if (window.onAndroidTTSDone) window.onAndroidTTSDone();",
                            null
                        )
                    }
                }
                override fun onError(utteranceId: String?) {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "if (window.onAndroidTTSDone) window.onAndroidTTSDone();",
                            null
                        )
                    }
                }
            })
            ttsReady = true
        }
    }

    private fun ensureSpeechRecognizer() {
        if (speechRecognizer != null) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "if (window.onAndroidSpeechReady) window.onAndroidSpeechReady();",
                            null
                        )
                    }
                }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}

                override fun onError(error: Int) {
                    // If Android heard a quick single letter in onPartialResults and then timed out with
                    // ERROR_NO_MATCH or ERROR_SPEECH_TIMEOUT, promote that partial to final so it is never lost!
                    if (lastPartialText.isNotBlank()) {
                        val rescuedText = lastPartialText
                        val rescuedMatches = lastPartialMatches
                        lastPartialText = ""
                        lastPartialMatches = null
                        dispatchTranscriptToWeb(rescuedText, true, rescuedMatches)
                    }
                    if (
                        isContinuousListening &&
                        error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS &&
                        error != SpeechRecognizer.ERROR_CLIENT
                    ) {
                        webView.postDelayed({
                            if (isContinuousListening) startRecognizerCycle()
                        }, 450L)
                    }
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val topText = matches?.firstOrNull() ?: lastPartialText
                    lastPartialText = ""
                    lastPartialMatches = null
                    if (topText.isNotBlank()) {
                        dispatchTranscriptToWeb(topText, true, matches)
                    }
                    if (isContinuousListening) {
                        webView.postDelayed({
                            if (isContinuousListening) startRecognizerCycle()
                        }, 150L)
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val topText = matches?.firstOrNull() ?: ""
                    if (topText.isNotBlank()) {
                        lastPartialText = topText
                        lastPartialMatches = matches
                        dispatchTranscriptToWeb(topText, false, matches)
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
    }

    private fun startRecognizerCycle() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQ_RECORD_AUDIO
            )
            return
        }
        ensureSpeechRecognizer()
        lastPartialText = ""
        lastPartialMatches = null
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        }
        try {
            speechRecognizer?.startListening(intent)
        } catch (_: Exception) {
        }
    }

    private fun dispatchTranscriptToWeb(
        transcript: String,
        isFinal: Boolean,
        alternatives: ArrayList<String>?
    ) {
        val escaped = JSONObject.quote(transcript)
        val jsonArray = JSONArray()
        alternatives?.forEach { alt ->
            if (alt.isNotBlank()) {
                jsonArray.put(alt)
            }
        }
        val escapedAlts = JSONObject.quote(jsonArray.toString())
        runOnUiThread {
            webView.evaluateJavascript(
                "if (window.onAndroidSpeechResult) window.onAndroidSpeechResult($escaped, $isFinal, $escapedAlts);",
                null
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_RECORD_AUDIO &&
            grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) {
            if (isContinuousListening) {
                startRecognizerCycle()
            }
        }
    }

    inner class AndroidSpeechBridge {
        @JavascriptInterface
        fun speak(text: String) {
            if (ttsReady) {
                tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ribbonspell_utterance")
            }
        }

        @JavascriptInterface
        fun stopSpeaking() {
            tts?.stop()
        }

        @JavascriptInterface
        fun startListening() {
            startListeningMode("command")
        }

        @JavascriptInterface
        fun startListeningMode(mode: String) {
            runOnUiThread {
                val nextMode = if (mode == "letters") "letters" else "command"
                val modeChanged = listeningMode != nextMode
                listeningMode = nextMode
                isContinuousListening = true
                if (modeChanged) {
                    try {
                        speechRecognizer?.cancel()
                    } catch (_: Exception) {
                    }
                }
                startRecognizerCycle()
            }
        }

        @JavascriptInterface
        fun stopListening() {
            runOnUiThread {
                isContinuousListening = false
                try {
                    speechRecognizer?.stopListening()
                } catch (_: Exception) {
                }
            }
        }
    }

    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        isContinuousListening = false
        try {
            speechRecognizer?.destroy()
        } catch (_: Exception) {
        }
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
