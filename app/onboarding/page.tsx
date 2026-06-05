'use client';

import { useState, useEffect } from 'react';
import { useUser, useSignUp } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import OnboardingPaso2 from './paso2';
import OnboardingPaso3 from './paso3';

function Paso1Custom() {
  const { isLoaded, signUp } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // 1. FUNCIÓN OBLIGATORIA PARA INICIAR SESIÓN CON GOOGLE
  const registrarConGoogle = () => {
    if (!isLoaded) return;
    signUp.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: '#', // Se queda en la misma ruta para que el useEffect detecte el login
      redirectUrlComplete: '#',
    });
  };

  // 2. FUNCIÓN PARA EL REGISTRO TRADICIONAL
  const registrarConEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    try {
      // Separamos nombre y apellido sutilmente para Clerk
      const [firstName, ...lastName] = fullName.split(' ');
      
      await signUp.create({
        emailAddress: email,
        password: password,
        firstName: firstName,
        lastName: lastName.join(' '),
      });

      // Envía el código de verificación por correo (paso nativo de Clerk si usas contraseña)
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      
      alert('Te hemos enviado un código a tu correo para validar la cuenta');
    } catch (err: any) {
      console.error(err.errors?.[0]?.message || 'Error al registrar');
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* BOTÓN DE GOOGLE FORZADO */}
      <button
        type="button"
        onClick={registrarConGoogle}
        className="w-full flex items-center justify-center gap-2 bg-[#1a1a1e] hover:bg-[#222227] border border-gray-800 text-white font-medium p-2.5 rounded-lg transition text-sm shadow-sm"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Registrarse con Google
      </button>

      <div className="flex items-center my-3 text-xs text-gray-600 before:flex-1 before:border-t before:border-gray-800 before:me-3 after:flex-1 after:border-t after:border-gray-800 after:ms-3">
        o continúa con correo
      </div>

      {/* TU FORMULARIO CON TUS INPUTS OSCUROS */}
      <form onSubmit={registrarConEmail} className="space-y-3">
        <input 
          type="text" 
          placeholder="Nombre completo" 
          required 
          className="w-full px-3 py-2 bg-[#1a1a1e] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none transition"
          value={fullName} 
          onChange={e => setFullName(e.target.value)} 
        />
        <input 
          type="email" 
          placeholder="Correo electrónico" 
          required 
          className="w-full px-3 py-2 bg-[#1a1a1e] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none transition"
          value={email} 
          onChange={e => setEmail(e.target.value)} 
        />
        <input 
          type="password" 
          placeholder="Contraseña" 
          required 
          className="w-full px-3 py-2 bg-[#1a1a1e] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none transition"
          value={password} 
          onChange={e => setPassword(e.target.value)} 
        />
        <input 
          type="tel" 
          placeholder="Teléfono" 
          required 
          className="w-full px-3 py-2 bg-[#1a1a1e] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-purple-600 focus:outline-none transition"
          value={phone} 
          onChange={e => setPhone(e.target.value)} 
        />

        <button 
          type="submit" 
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium p-2.5 rounded-lg text-sm shadow-md transition mt-2"
        >
          Siguiente
        </button>
      </form>
    </div>
  );
}

const variantesDeslizamiento = {
  enter: (direction) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction < 0 ? 100 : -100,
    opacity: 0,
  }),
};

export default function OnboardingContainer() {
  const { isLoaded, isSignedIn } = useUser();
  const [step, setStep] = useState(1);
  const [direccion, setDireccion] = useState(1);

  useEffect(() => {
    if (isLoaded && isSignedIn && step === 1) {
      navegarA(2);
    }
  }, [isLoaded, isSignedIn, step]);

  const navegarA = (nuevoPaso) => {
    setDireccion(nuevoPaso > step ? 1 : -1);
    setStep(nuevoPaso);
  };

  if (!isLoaded) {
    return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-gray-400">Cargando PropIA...</div>;
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4 selection:bg-purple-500/30">
      <div className="w-full max-w-[500px] bg-[#121214] border border-gray-900 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {step === 1 && 'Crear tu agencia en PropIA'}
            {step === 2 && 'Configuración de la Agencia'}
            {step === 3 && 'Integración de Canales de IA'}
          </h1>
          <div className="flex items-center justify-center gap-3 mt-4">
            {[1, 2, 3].map((num) => (
              <div
                key={num}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border transition-all duration-300 ${
                  step === num
                    ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.4)]'
                    : step > num
                    ? 'bg-purple-950 text-purple-300 border-purple-800'
                    : 'bg-[#1a1a1e] text-gray-500 border-gray-800'
                }`}
              >
                {num}
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-h-[380px]">
          <AnimatePresence mode="wait" initial={false} custom={direccion}>
            {step === 1 && (
              <motion.div
                key="paso1"
                custom={direccion}
                variants={variantesDeslizamiento}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-4"
              >
                <Paso1Custom />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div
                key="paso2"
                custom={direccion}
                variants={variantesDeslizamiento}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <OnboardingPaso2 alCompletar={() => navegarA(3)} />
              </motion.div>
            )}
            {step === 3 && (
              <motion.div
                key="paso3"
                custom={direccion}
                variants={variantesDeslizamiento}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <OnboardingPaso3 />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

