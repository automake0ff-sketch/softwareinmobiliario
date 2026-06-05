'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { guardarPaso2 } from './actions';

export default function OnboardingPaso2({ alCompletar }: { alCompletar: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [telefonoCorp, setTelefonoCorp] = useState('');
  const [telefonoPersonal, setTelefonoPersonal] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      const resultado = await guardarPaso2({
        nombreEmpresa,
        ciudad,
        telefonoCorp,
        telefonoPersonal,
      });
      if (resultado.success) {
        alCompletar();
      } else {
        setErrorMsg(resultado.error || 'Error inesperado');
      }
    });
  };

  return (
    <motion.div
      key="paso2-container"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Configura tu Inmobiliaria
        </h2>
        <p className="text-sm text-gray-500">
          Completa el perfil corporativo para personalizar tu entorno de IA.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Aquí puedes añadir el botón de Google si lo deseas */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
            Nombre Comercial de la Agencia
          </label>
          <input
            type="text"
            required
            placeholder="Ej. InmoSaaS Propiedades"
            disabled={isPending}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 transition"
            value={nombreEmpresa}
            onChange={(e) => setNombreEmpresa(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
            Ciudad Principal
          </label>
          <input
            type="text"
            required
            placeholder="Ej. Madrid o Barcelona"
            disabled={isPending}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 transition"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
            Teléfono Corporativo de Contacto
          </label>
          <input
            type="tel"
            required
            placeholder="Ej. +34 910 000 000"
            disabled={isPending}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 transition"
            value={telefonoCorp}
            onChange={(e) => setTelefonoCorp(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white font-medium p-2.5 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2 shadow-sm"
        >
          {isPending ? 'Guardando agencia...' : 'Continuar al Paso 3'}
        </button>
      </form>
    </motion.div>
  );
}
