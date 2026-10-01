package com.xecute.app.speech

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class SpeechModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pending: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "XecuteSpeech"

    @ReactMethod
    fun startListening(prompt: String?, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available for speech recognition")
            return
        }
        if (pending != null) {
            promise.reject("BUSY", "Speech recognition already in progress")
            return
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(
                RecognizerIntent.EXTRA_PROMPT,
                prompt ?: "Tell XBoss everything you need to do",
            )
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        try {
            pending = promise
            activity.startActivityForResult(intent, REQUEST_SPEECH)
        } catch (e: Exception) {
            pending = null
            promise.reject("SPEECH_UNAVAILABLE", e.message ?: "Speech recognition unavailable", e)
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        if (requestCode != REQUEST_SPEECH) return
        val promise = pending ?: return
        pending = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("CANCELLED", "Speech recognition cancelled")
            return
        }

        val results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        val text = results?.firstOrNull()?.trim().orEmpty()
        if (text.isEmpty()) {
            promise.reject("EMPTY", "No speech detected")
            return
        }
        promise.resolve(text)
    }

    override fun onNewIntent(intent: Intent) = Unit

    companion object {
        private const val REQUEST_SPEECH = 7711
    }
}
