import { AuthForm } from '../../features/auth/components/auth-form';
import { AuthSplit } from '../../features/auth/components/auth-split';

export default function LoginPage() {
  return (
    <AuthSplit kicker="Welcome back">
      <AuthForm mode="login" subtitle="Sign in to manage your links and analytics." />
    </AuthSplit>
  );
}
