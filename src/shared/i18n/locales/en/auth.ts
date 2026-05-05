export default {
  // Sign-in screen
  signInTitle: "Sign in to Xcity",
  signInSubtitle: "Connect to enable Recharge, Order History, and cloud models.",
  signInEmail: "Email",
  signInPassword: "Password",
  signInSubmit: "Sign in",
  signInLoading: "Signing in…",
  signInGoogle: "Sign in with Google",
  signInGoogleLoading: "Opening browser…",
  signInForgot: "Forgot password?",
  signInNoAccount: "Don't have an account?",
  signInCreateAccount: "Create one",
  // Sign-up screen
  signUpTitle: "Create your Xcity account",
  signUpSubtitle: "Free to start. No credit card needed.",
  signUpEmail: "Email",
  signUpPassword: "Password (8+ characters)",
  signUpConfirmPassword: "Confirm password",
  signUpSubmit: "Sign up",
  signUpLoading: "Creating…",
  signUpHaveAccount: "Already have an account?",
  signUpSignIn: "Sign in",
  signUpRequiresVerification:
    "Check your inbox — we sent a confirmation link to {{email}}.",
  // Forgot-password screen
  forgotTitle: "Reset password",
  forgotSubtitle:
    "Enter the email tied to your account and we'll send a reset link.",
  forgotEmail: "Email",
  forgotSubmit: "Send reset email",
  forgotLoading: "Sending…",
  forgotSent:
    "If an account exists for {{email}}, a reset link is on its way. Open the link in your browser to set a new password, then sign in here.",
  forgotBack: "Back to sign in",
  // Errors
  errorInvalidCredentials: "Invalid email or password.",
  errorEmailAlreadyRegistered: "An account with this email already exists.",
  errorWeakPassword:
    "Password is too weak. Use at least 8 characters with a mix of letters and numbers.",
  errorRateLimited: "Too many attempts. Try again in a few minutes.",
  errorNetwork: "Couldn't reach the auth service. Check your connection.",
  errorServer: "Auth service is having trouble. Please try again shortly.",
  errorCaptcha: "Please complete the verification challenge in your browser.",
  errorRefreshFailed: "Your session expired. Please sign in again.",
  errorPasswordsMismatch: "Passwords don't match.",
  errorInvalidEmail: "Enter a valid email.",
  errorEmailRequired: "Email is required.",
  errorPasswordRequired: "Password is required.",
  errorOauthStateExpired: "Sign-in took too long. Try again.",
  errorOauthCancelled: "Sign-in was cancelled.",
  errorUnknown: "Something went wrong. Please try again.",
  // Login prompt modal
  promptTitle: "Sign in to Xcity",
  promptBody:
    "Connect your account to access Recharge, Order History, and cloud models. You can keep using local Hermes without an account.",
  promptSignIn: "Sign in",
  promptSignUp: "Create account",
  promptSkip: "Continue without account",
  // User menu
  menuSignOut: "Sign out",
  menuSignedInAs: "Signed in as {{email}}",
  // Balance badge
  balanceCredits: "{{count}} credits",
  balanceLoading: "—",
} as const;
