'use client';

import { useState, useEffect } from 'react';
import { useUser, SignUp } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import OnboardingPaso2 from './paso2';
import OnboardingPaso3 from './paso3';

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
                <SignUp
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: 'w-full',
                      cardBox: 'bg-transparent border-0 shadow-none p-0 w-full',
                      header: 'hidden',
                      footer: 'w-full text-center mt-4',
                      formButtonPrimary: 'w-full bg-purple-600 hover:bg-purple-700 text-white font-medium p-2.5 rounded-lg shadow-sm transition-all border-0 text-sm',
                      formFieldInput: 'w-full px-3 py-2.5 bg-[#1a1a1e] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition text-sm',
                      formFieldLabel: 'text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1',
                      socialButtonsBlockButton: 'w-full flex items-center justify-center gap-2 bg-[#1a1a1e] hover:bg-[#222227] border border-gray-800 text-white font-medium p-2.5 rounded-lg transition mb-2 text-sm',
                      dividerRow: 'hidden',
                    },
                  }}
                />
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
