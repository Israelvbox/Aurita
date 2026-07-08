package com.aurita.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String KEY_WEBVIEW_URL = "aurita_webview_url";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuritaPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        try {
            if (bridge != null && bridge.getWebView() != null) {
                String url = bridge.getWebView().getUrl();
                if (url != null) {
                    outState.putString(KEY_WEBVIEW_URL, url);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (bridge != null) {
                bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('app:resumed'))",
                    null
                );
            }
        } catch (Exception ignored) {}
    }
}
