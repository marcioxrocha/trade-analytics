// This file provides type declarations for Firebase modules imported via CDN URLs.
// This resolves TypeScript error TS2307: "Cannot find module..."

declare module 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js' {
    // Define a placeholder type for the Firebase App instance
    type FirebaseApp = unknown;

    export function initializeApp(firebaseConfig: object): FirebaseApp;
}

declare module 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js' {
    // Define placeholder types for Auth-related objects
    type Auth = unknown;
    type AuthProvider = unknown;
    type UserCredential = unknown;
    type FirebaseApp = unknown;

    /**
     * The User interface, representing a user account.
     */
    export interface User {
        displayName: string | null;
        photoURL: string | null;
        // FIX: Add email property to User interface to match Firebase Auth User object.
        email: string | null;
    }

    /**
     * Returns the Auth instance associated with the provided FirebaseApp.
     */
    export function getAuth(app?: FirebaseApp): Auth;

    /**
     * Adds an observer for changes to the user's sign-in state.
     */
    export function onAuthStateChanged(auth: Auth, callback: (user: User | null) => void): () => void;

    /**
     * Signs out the current user.
     */
    export function signOut(auth: Auth): Promise<void>;

    /**
     * The Google Auth provider class.
     */
    export class GoogleAuthProvider { constructor(); }

    /**
     * Authenticates a Firebase client using a popup-based OAuth flow.
     */
    export function signInWithPopup(auth: Auth, provider: AuthProvider): Promise<UserCredential>;
}

declare module 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app-check.js' {
    type FirebaseApp = unknown;
    type AppCheckProvider = unknown;

    /**
     * The reCAPTCHA V3 provider class.
     */
    export class ReCaptchaV3Provider { constructor(siteKey: string); }

    /**
     * Initializes App Check for the given app.
     */
    export function initializeAppCheck(app: FirebaseApp, config: { provider: AppCheckProvider, isTokenAutoRefreshEnabled?: boolean }): unknown;
}