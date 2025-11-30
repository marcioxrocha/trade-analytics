


import React, { useState, useEffect, useMemo } from 'react';
import DashboardView from './components/DashboardView';
import { useLanguage } from './contexts/LanguageContext';
import { ApiProvider, useApi } from './contexts/ApiContext';
import type { User } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import Icon from './components/Icon';
import ThemeSwitcher from './components/ThemeSwitcher';

// Este componente irá conter o aplicativo principal após a autenticação
interface AuthenticatedAppProps {
  user: User;
}
const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ user }) => {
  const { t } = useLanguage();

  const handleSignOut = async () => {
    try {
      const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js');
      const auth = getAuth();
      await signOut(auth);
    } catch (error) {
      console.error("Sign out error", error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-md p-2 px-4 flex items-center justify-between z-20">
        <div />
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <span className="text-sm">{t('app.welcome')}, {user.displayName}</span>
          {user.photoURL && <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" />}
          <button onClick={handleSignOut} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
            {t('app.signOut')}
          </button>
        </div>
      </header>
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <DashboardView 
            instanceKey="main" 
            department="trader" 
            owner={user?.email} 
            allowDashboardManagement={true}
            allowDataSourceManagement={true}
            showInfoScreen={true}
            />
        </main>
      </div>
    </div>
  );
};

type VerificationStatus = 'idle' | 'pending' | 'verified' | 'denied';

// Este componente lida com todo o fluxo de autenticação
const AuthFlow: React.FC = () => {
  const { apiConfig } = useApi();
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');


  const firebaseConfig = useMemo(() => ({
    apiKey: apiConfig.FIREBASE_API_KEY,
    authDomain: apiConfig.FIREBASE_AUTH_DOMAIN,
    projectId: apiConfig.FIREBASE_PROJECT_ID,
    recaptchaSiteKey: apiConfig.FIREBASE_RECAPTCHA_SITE_KEY,
    verifyEmailUrl: apiConfig.AUTH_VERIFY_EMAIL_URL,
  }), [apiConfig]);

  // Se a configuração estiver faltando, exiba "Acesso Negado" imediatamente.
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.recaptchaSiteKey) {
    return (
      <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md mx-4">
            <Icon name="info" className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400">{t(`app.accessDenied`)}</h2>
            <p className="text-gray-600 dark:text-gray-300 mt-2">{t(`app.accessDeniedDesc`)}</p>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initFirebaseAuth = async () => {
      try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js');
        const { getAuth, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js');
        const { initializeAppCheck, ReCaptchaV3Provider } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-check.js');

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);

        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(firebaseConfig.recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true,
        });

        unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          setError(null);
          if (currentUser) {
            // Se a URL de verificação não estiver definida, conceda acesso imediatamente.
            if (!firebaseConfig.verifyEmailUrl) {
              setUser(currentUser);
              setVerificationStatus('verified');
              setLoading(false);
              return;
            }

            // Se a URL estiver definida, inicie a verificação.
            setVerificationStatus('pending');
            setLoading(false); // Não estamos mais carregando a autenticação, mas sim verificando.
            try {
              let urlToVerify = firebaseConfig.verifyEmailUrl;
              // Atualize para HTTPS se a página atual for segura para evitar erros de conteúdo misto.
              if (window.location.protocol === 'https:' && urlToVerify.startsWith('http://')) {
                urlToVerify = urlToVerify.replace('http://', 'https://');
              }

              const response = await fetch(`${urlToVerify}?email=${encodeURIComponent(currentUser.email!)}&_t=${new Date().getTime()}`);
              if (response.ok) { // Status 200-299
                setUser(currentUser);
                setVerificationStatus('verified');
              } else {
                // Acesso negado
                setVerificationStatus('denied');
                await signOut(auth); // Desconecta automaticamente o usuário.
                setUser(null);
              }
            } catch (e) {
              console.error("A requisição de verificação de e-mail falhou:", e);
              setVerificationStatus('denied');
              await signOut(auth); // Também desconecta em caso de erro de rede, etc.
              setUser(null);
            }
          } else {
            // Nenhum usuário logado
            setUser(null);
            setVerificationStatus('idle');
            setLoading(false);
          }
        });

      } catch (e) {
        console.error("Erro na inicialização do Firebase:", e);
        setError("authError");
        setLoading(false);
      }
    };
    
    initFirebaseAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [firebaseConfig]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js');
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setError(null);
    } catch (e) {
      console.error("Erro ao entrar:", e);
      setError("authError");
    } finally {
      setIsSigningIn(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">{t('app.loadingAuth')}</p>
        </div>
      );
    }

     if (verificationStatus === 'pending') {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">{t('app.verifyingAccess')}</p>
        </div>
      );
    }

    if (verificationStatus === 'denied') {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md mx-4">
                    <Icon name="info" className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-red-700 dark:text-red-400">{t('app.emailAccessDenied')}</h2>
                    <p className="text-gray-600 dark:text-gray-300 mt-2 mb-6">{t('app.emailAccessDeniedDesc')}</p>
                    <button
                        onClick={handleSignIn}
                        disabled={isSigningIn}
                        className="flex items-center justify-center gap-3 px-6 py-3 w-64 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold rounded-lg shadow-md hover:shadow-lg transition-shadow disabled:opacity-75 disabled:cursor-wait mx-auto"
                    >
                        {isSigningIn ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-gray-100"></div>
                        ) : (
                            <svg className="w-6 h-6" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                                <path fill="none" d="M0 0h48v48H0z"></path>
                            </svg>
                        )}
                        {isSigningIn ? t('app.signingIn') : t('app.tryAgain')}
                    </button>
                </div>
            </div>
        );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md mx-4">
            <Icon name="info" className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400">{t(`app.${error}`)}</h2>
            <p className="text-gray-600 dark:text-gray-300 mt-2 mb-6">{t(`app.${error}Desc`)}</p>
            <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="flex items-center justify-center gap-3 px-6 py-3 w-64 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold rounded-lg shadow-md hover:shadow-lg transition-shadow disabled:opacity-75 disabled:cursor-wait mx-auto"
            >
                {isSigningIn ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-gray-100"></div>
                ) : (
                    <svg className="w-6 h-6" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                )}
                {isSigningIn ? t('app.signingIn') : t('app.tryAgain')}
            </button>
          </div>
        </div>
      );
    }

    if (user && verificationStatus === 'verified') {
      return <AuthenticatedApp user={user} />;
    }

    return (
      <div className="flex items-center justify-center h-full">
        <button
          onClick={handleSignIn}
          disabled={isSigningIn}
          className="flex items-center justify-center gap-3 px-6 py-3 w-64 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold rounded-lg shadow-md hover:shadow-lg transition-shadow disabled:opacity-75 disabled:cursor-wait"
        >
          {isSigningIn ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-gray-100"></div>
          ) : (
            <svg className="w-6 h-6" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          )}
          {isSigningIn ? t('app.signingIn') : t('app.signInWithGoogle')}
        </button>
      </div>
    );
  };

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
      {renderContent()}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ApiProvider instanceKey="main">
      <AuthFlow />
    </ApiProvider>
  );
};

export default App;