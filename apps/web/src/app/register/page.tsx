import { AuthForm } from '../../features/auth/components/auth-form';
import { AuthSplit } from '../../features/auth/components/auth-split';

export default function RegisterPage() {
  return (
    <AuthSplit kicker="Get started">
      <AuthForm mode="register" subtitle="Create an account to shorten links in seconds." />
    </AuthSplit>
  );
}
