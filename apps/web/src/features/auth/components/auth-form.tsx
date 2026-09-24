'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { FieldError, TextInput } from '../../../components/ui/input';
import { ShortlyApiError } from '../../../lib/api/client';
import { useAuth } from '../auth-context';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72),
});

type FormValues = z.infer<typeof schema>;

export function AuthForm({ mode, subtitle }: { mode: 'login' | 'register'; subtitle?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues): Promise<void> {
    try {
      if (mode === 'login') await auth.login(values.email, values.password);
      else await auth.register(values.email, values.password);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ShortlyApiError && err.isUnauthorized) {
        setError('root', { message: 'Invalid email or password.' });
        return;
      }
      if (err instanceof ShortlyApiError && err.isConflict) {
        setError('email', { message: 'An account with this email already exists.' });
        return;
      }
      if (err instanceof ShortlyApiError && err.isRateLimited) {
        setError('root', { message: 'Too many attempts. Please try again later.' });
        return;
      }
      setError('root', {
        message: err instanceof Error ? err.message : 'Something went wrong.',
      });
    }
  }

  const title = mode === 'login' ? 'Sign in' : 'Create an account';

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      {subtitle !== undefined && (
        <p className="-mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
      <div>
        <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </label>
        <TextInput id="auth-email" type="email" autoComplete="email" {...register('email')} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password
        </label>
        <TextInput
          id="auth-password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          {...register('password')}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <FieldError message={errors.root?.message} />
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full justify-center">
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <Link href="/register" className="font-medium text-brand-600 hover:underline">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{' '}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
