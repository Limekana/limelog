package com.limecore.workouttracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v1.4 — register the SuiteSso plugin so the JS layer can query
        // NCC's SessionContentProvider for shared sign-in. Must register
        // BEFORE super.onCreate so the Capacitor bridge picks it up
        // during initial setup.
        registerPlugin(SuiteSsoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
