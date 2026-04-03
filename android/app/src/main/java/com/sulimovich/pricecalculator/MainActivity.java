package com.sulimovich.pricecalculator;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Allow content to extend under the system bars (edge-to-edge)
        // Required for Android 15+ (targetSdk 35)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
