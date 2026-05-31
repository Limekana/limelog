package com.limecore.workouttracker;

// v1.4 cross-app SSO consumer (sister-app side).
//
// Queries NCC's SessionContentProvider via ContentResolver to inherit NCC's
// Supabase session without a separate sign-in. The provider is at:
//   content://com.limecore.nexus.session/current
// and is read-protected by the signature-level permission
//   com.limecore.nexus.permission.READ_SESSION
//
// This app declares <uses-permission> + <queries> in its AndroidManifest so
// it can both ask for the permission AND see the provider in Android 11+'s
// restricted query model. Both sides must be signed with the same
// developer cert; otherwise the OS rejects the query at permission check.
//
// Returned data is the JSON bundle NCC published — see ssoPublisher.ts on
// the NCC side for the shape:
//   { access_token, refresh_token, expires_at, user_id, email }
//
// This plugin is purely a one-shot read. The JS side decides what to do
// with the bundle (typically: supabase.auth.setSession to inherit the
// session). On Android < 23 or when NCC isn't installed, query() returns
// null and the JS side falls back to the normal sign-in UI.

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SuiteSso")
public class SuiteSsoPlugin extends Plugin {

    private static final Uri SESSION_URI =
        Uri.parse("content://com.limecore.nexus.session/current");

    private static final String COL_BUNDLE = "session_bundle_json";
    private static final String COL_PUBLISHED_AT = "published_at";

    /**
     * Query NCC's SessionContentProvider.
     *
     * Resolves with:
     *   { available: true,  bundle: {access_token, refresh_token, ...},
     *     publishedAt: number }
     *   when NCC is installed, signature matches, and a session is published.
     *
     *   { available: false, reason: "..." }
     *   when NCC isn't installed, the permission was denied, or no session
     *   has been published yet. `reason` lets the JS-side UI flash a helpful
     *   message ("Install Nexus Command Center" / "Sign in to Nexus first").
     *
     * Never rejects the PluginCall — every failure mode flows through the
     * `available: false` branch so JS doesn't need a try/catch.
     */
    @PluginMethod
    public void getNexusSession(PluginCall call) {
        JSObject result = new JSObject();
        ContentResolver resolver = getContext().getContentResolver();
        Cursor cursor = null;
        try {
            cursor = resolver.query(SESSION_URI, null, null, null, null);
            if (cursor == null) {
                // Null cursor means the provider wasn't reachable — NCC not
                // installed, OR the permission grant failed (different signing
                // cert), OR the provider explicitly rejected the query.
                result.put("available", false);
                result.put("reason", "Nexus Command Center not reachable (not installed, or different signing cert).");
                call.resolve(result);
                return;
            }
            if (!cursor.moveToFirst()) {
                // Provider responded but published no row — NCC is installed
                // but the user hasn't signed in yet (or signed out).
                result.put("available", false);
                result.put("reason", "Sign in to Nexus Command Center first.");
                call.resolve(result);
                return;
            }
            int bundleIdx = cursor.getColumnIndex(COL_BUNDLE);
            int publishedAtIdx = cursor.getColumnIndex(COL_PUBLISHED_AT);
            String bundleJson = bundleIdx >= 0 ? cursor.getString(bundleIdx) : null;
            long publishedAt = publishedAtIdx >= 0 ? cursor.getLong(publishedAtIdx) : 0L;
            if (bundleJson == null || bundleJson.isEmpty()) {
                result.put("available", false);
                result.put("reason", "Nexus has no active session.");
                call.resolve(result);
                return;
            }
            result.put("available", true);
            result.put("bundleJson", bundleJson);
            result.put("publishedAt", publishedAt);
            call.resolve(result);
        } catch (SecurityException se) {
            // Should never reach here — the OS would block the query before
            // returning a cursor — but defensively handle it.
            result.put("available", false);
            result.put("reason", "Permission denied: signing cert mismatch.");
            call.resolve(result);
        } catch (Exception e) {
            result.put("available", false);
            result.put("reason", "Query failed: " + e.getMessage());
            call.resolve(result);
        } finally {
            if (cursor != null) {
                try { cursor.close(); } catch (Exception ignored) { /* */ }
            }
        }
    }
}
