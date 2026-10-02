import { AuthForm } from '../../src/components/auth-form';
import '../live.css';
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const query = await searchParams;
  return <AuthForm mode="sign-in" confirmationFailed={query.error === 'confirmation'} />;
}
