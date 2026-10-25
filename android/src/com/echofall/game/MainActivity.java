package com.echofall.game;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the Echofall game (assets/www) in a full-screen WebView. */
public class MainActivity extends Activity {
    private static final int BG = Color.parseColor("#150a2b");
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true; // the game never navigates away
            }
        });
        web.addJavascriptInterface(new Bridge(), "EchoNative");
        web.loadUrl("file:///android_asset/www/index.html");
        setContentView(web);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.efBack && window.efBack()) ? '1' : '0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("1")) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.efPause && window.efPause()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    /** Exposed to the page as window.EchoNative. */
    private class Bridge {
        private Vibrator vibrator() {
            return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }

        @JavascriptInterface
        public void vibrate(long ms) {
            try {
                Vibrator v = vibrator();
                if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void vibratePattern(String csv) {
            try {
                String[] parts = csv.split(",");
                long[] timings = new long[parts.length];
                for (int i = 0; i < parts.length; i++) timings[i] = Long.parseLong(parts[i].trim());
                Vibrator v = vibrator();
                if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(timings, -1));
            } catch (Exception ignored) { }
        }
    }
}
