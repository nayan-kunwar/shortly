import type { Metadata } from 'next';
import { CreateUrlForm } from '../../features/urls/components/create-url-form';

export const metadata: Metadata = { title: 'Create URL — Shortly' };

export default function CreatePage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Create a short URL</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Links are created live against the Shortly API.
      </p>
      <div className="mt-6">
        <CreateUrlForm />
      </div>
    </div>
  );
}
