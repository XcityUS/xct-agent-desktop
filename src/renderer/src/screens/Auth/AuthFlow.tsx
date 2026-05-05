import { useState } from "react";
import SignInScreen from "./SignInScreen";
import SignUpScreen from "./SignUpScreen";
import ForgotPasswordScreen from "./ForgotPasswordScreen";

export type AuthMode = "signin" | "signup" | "forgot";

interface AuthFlowProps {
  initialMode?: AuthMode;
  onSignedIn: () => void;
  onCancel?: () => void;
  /** Whether to show the "Continue without account" link on sign-in. */
  cancelable?: boolean;
  googleEnabled?: boolean;
}

export default function AuthFlow({
  initialMode = "signin",
  onSignedIn,
  onCancel,
  cancelable = false,
  googleEnabled = false,
}: AuthFlowProps): React.JSX.Element {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  if (mode === "signup") {
    return (
      <SignUpScreen
        onSignedIn={onSignedIn}
        onGoToSignIn={() => setMode("signin")}
      />
    );
  }
  if (mode === "forgot") {
    return <ForgotPasswordScreen onGoToSignIn={() => setMode("signin")} />;
  }
  return (
    <SignInScreen
      onSignedIn={onSignedIn}
      onGoToSignUp={() => setMode("signup")}
      onGoToForgot={() => setMode("forgot")}
      cancelable={cancelable}
      onCancel={onCancel}
      googleEnabled={googleEnabled}
    />
  );
}
