import { useSignUp } from '@clerk/nextjs';
import { useState } from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  const { isLoaded, signUp } = useSignUp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registrarConGoogle = () => {
    if (!isLoaded) return;
    signUp.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: '/register/verify-email',
      redirectUrlComplete: '/onboarding',
    });
  };

  const registrarConEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const [firstName, ...rest] = fullName.split(' ');
      await signUp.create({
        firstName,
        lastName: rest.join(' '),
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });
      window.location.href = '/register/verify-email';
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-[#09090b] min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121214] border border-[#1a1a1e] rounded-lg p-8">
        {/* Steps indicator */}
        <div className="flex justify-evenly mb-8">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-semibold shadow-sm">
              1
            </div>
            <span className="text-gray-300">Crear tu agencia</span>
          </div>
          <div className="w-4 h-1 bg-gray-500" />
          <div className="flex items-center space-x-2 opacity-50">
            <div className="w-6 h-6 rounded-full border border-gray-500 flex items-center justify-center text-sm font-semibold">
              2
            </div>
            <span className="text-gray-400">Datos empresa</span>
          </div>
          <div className="w-4 h-1 bg-gray-500 opacity-50" />
          <div className="flex items-center space-x-2 opacity-50">
            <div className="w-6 h-6 rounded-full border border-gray-500 flex items-center justify-center text-sm font-semibold">
              3
            </div>
            <span className="text-gray-400">Cuenta</span>
          </div>
        </div>

        {/* Google button */}
        <button
          type="button"
          onClick={registrarConGoogle}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2 rounded-lg bg-[#25262d] text-white hover:bg-[#2f3039] transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Registrarse con Google
        </button>

        {/* Divider */}
        <div className="flex items-center relative my-6 text-[11px] text-gray-300">
          <span className="flex-1 border-t border-[#1a1a1e]" />
          <span className="px-3">o regístrate con correo</span>
          <span className="flex-1 border-t border-[#1a1a1e]" />
        </div>

        {/* Form */}
        {error && (
          <div className="text-red-400 text-xs mb-2 text-center">{error}</div>
        )}
        <form onSubmit={registrarConEmail} className="space-y-4">
          <input
            type="text"
            placeholder="Nombre completo"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            className="w-full p-2.5 bg-[#1a1a1e] border border-[#1a1a1e] rounded-lg text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none"
          />
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full p-2.5 bg-[#1a1a1e] border border-[#1a1a1e] rounded-lg text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full p-2.5 bg-[#1a1a1e] border border-[#1a1a1e] rounded-lg text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none"
          />
          <input
            type="tel"
            placeholder="Teléfono"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            className="w-full p-2.5 bg-[#1a1a1e] border border-[#1a1a1e] rounded-lg text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[#2d3748] text-white font-medium text-sm hover:bg-[#4a5568] transition-colors disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Siguiente'}
          </button>
        </form>

        {/* Sign‑in link */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          Ya tienes una cuenta?{' '}
          <Link href="/login" className="text-purple-400 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
