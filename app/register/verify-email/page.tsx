import { useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const { signUp, isLoaded } = useSignUp();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signUp.attemptEmailAddressVerification({ code });
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-[#09090b] min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121214] border border-[#1a1a1e] rounded-lg p-8">
        <h2 className="text-lg font-medium text-white mb-4">
          Verifica tu correo electrónico
        </h2>
        <p className="text-sm text-gray-400 mb-8">
          Hemos enviado un código de 6 dígitos a tu email.
        </p>
        {error && (
          <div className="text-red-400 text-xs mb-2 text-center">{error}</div>
        )}
        <form onSubmit={handleVerify} className="space-y-4">
          <input
            type="text"
            placeholder="Código de verificación"
            value={code}
            onChange={e => setCode(e.target.value)}
            required
            maxLength={6}
            className="w-full p-2.5 bg-[#1a1a1e] border border-[#1a1a1e] rounded-lg text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none text-center"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[#2d3748] text-white font-medium text-sm hover:bg-[#4a5568] transition-colors disabled:opacity-50"
          >
            {loading ? 'Verificando...' : 'Verificar'}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-4 text-center">
          ¿No recibiste el código?{' '}
          <Link href="/register" className="text-purple-400 hover:underline">
            Regresar a registrarte
          </Link>
        </p>
      </div>
    </main>
  );
}
