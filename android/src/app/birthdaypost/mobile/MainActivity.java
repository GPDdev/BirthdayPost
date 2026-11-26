package app.birthdaypost.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String ENTRY = "file:///android_asset/post.html";
    private WebView web;
    private ValueCallback<Uri[]> pendingFiles;
    private boolean ready;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        BirthdayReceiver.channel(this);
        web = new WebView(this);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(250,247,240));
        frame.addView(web, new FrameLayout.LayoutParams(-1,-1));
        web.setBackgroundColor(Color.rgb(250,247,240));
        getWindow().setStatusBarColor(Color.rgb(250,247,240));
        getWindow().setNavigationBarColor(Color.rgb(250,247,240));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 35) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((view,insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets;
            });
        }
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.getSettings().setAllowFileAccessFromFileURLs(false);
        web.getSettings().setBlockNetworkLoads(true);
        web.addJavascriptInterface(new Bridge(),"PostNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
            @Override public void onPageFinished(WebView v,String url) { ready = ENTRY.equals(url); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> result, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = result;
                Intent open = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try { startActivityForResult(open,11); } catch (RuntimeException e) { pendingFiles.onReceiveValue(null); pendingFiles=null; }
                return true;
            }
        });
        setContentView(frame);
        web.loadUrl(ENTRY);
    }
    final class Bridge {
        @JavascriptInterface public String call(String op,String json) {
            JSONObject reply = new JSONObject();
            try {
                Object value = JSONObject.NULL;
                SharedPreferences prefs = BirthdayReceiver.store(MainActivity.this);
                switch(op) {
                    case "load": value=prefs.getString("state",""); break;
                    case "save": {
                        JSONObject payload = new JSONObject(json), state = payload.getJSONObject("state");
                        SharedPreferences.Editor edit = prefs.edit().putString("state",state.toString());
                        boolean updateAlarms = payload.has("plan");
                        if (updateAlarms) {
                            edit.putString("time",state.getString("time")).putBoolean("enabled",state.getBoolean("enabled"))
                                .putString("rules",payload.getJSONArray("plan").toString());
                        }
                        if (!edit.commit()) throw new IllegalStateException("无法将资料写入手机。");
                        if (updateAlarms) BirthdayReceiver.refresh(MainActivity.this);
                        break;
                    }
                    case "copy": {
                        String content = new JSONArray("["+json+"]").getString(0);
                        getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("生日祝福",content));
                        break;
                    }
                    case "status": value=BirthdayReceiver.permission(MainActivity.this); break;
                    case "request":
                        value=BirthdayReceiver.permission(MainActivity.this);
                        if (Build.VERSION.SDK_INT >= 33 && !"granted".equals(value) &&
                            (!prefs.getBoolean("asked",false) || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
                            prefs.edit().putBoolean("asked",true).apply();
                            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},12));
                            value="pending";
                        }
                        break;
                    case "settings": runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()))); break;
                    default: throw new IllegalArgumentException("未知系统操作。");
                }
                reply.put("ok",true).put("value",value);
            } catch (Exception e) {
                try { reply.put("ok",false).put("error",e.getMessage()); } catch (Exception ignored) { }
            }
            return reply.toString();
        }
    }
    @Override public void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if (request==11 && pendingFiles!=null) {
            pendingFiles.onReceiveValue(result==RESULT_OK && data!=null && data.getData()!=null ? new Uri[]{data.getData()} : null);
            pendingFiles=null;
        }
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(request,permissions,results);
        if (request==12 && ready) web.evaluateJavascript("Postal.permissionChanged(" +
            JSONObject.quote(BirthdayReceiver.permission(this)) + ")",null);
    }
    @Override protected void onResume() {
        super.onResume();
        BirthdayReceiver.refresh(this);
        if (ready) web.evaluateJavascript("Postal.resume()",null);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (ready && intent.getBooleanExtra("today",false)) web.evaluateJavascript("Postal.openToday()",null);
    }
    @Override public void onBackPressed() {
        if (!ready) { super.onBackPressed(); return; }
        web.evaluateJavascript("Postal.back()",value -> { if (!"true".equals(value)) finish(); });
    }
    @Override protected void onDestroy() {
        if(pendingFiles!=null) pendingFiles.onReceiveValue(null);
        web.removeJavascriptInterface("PostNative"); web.destroy(); super.onDestroy();
    }
}
