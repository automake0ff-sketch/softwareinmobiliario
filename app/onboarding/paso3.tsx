'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { guardarPaso3 } from './actions';

export default function OnboardingPaso3() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados del formulario
  const [whatsappToken, setWhatsappToken] = useState('');
  const [whatsappPhoneId, setWhatsappPhoneId] = useState('');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPass, setSmtpPass] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const resultado = await guardarPaso3({
        whatsappToken,
        whatsappPhoneId,
        smtpEmail,
        smtpPass,
      });

          if (resultado.success) {
            const authData = {
              state: {
                user: {
                  id: resultado.user.id,
                  email: resultado.user.email,
                  name: resultado.user.name,
                  role: 'admin',
                  agency_id: resultado.user.agency_id,
                  token: resultado.token
                },
                agency: resultado.agency
              },
              version: 0
            };
            localStorage.setItem('crm-inmobiliario-store', JSON.stringify(authData));
            router.push('/dashboard');
          } else {
            setErrorMsg(resultado.error || 'Ocurrió un error al guardar los datos.');
          }
    });
  };

  return (
    <motion.div
      key="paso3-container"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Canales y Conexiones de IA
        </h2>
        <p className="text-sm text-gray-500">
          Enlaza tus herramientas para que el asistente de IA responda correos y mensajes de clientes de forma automatizada.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* BLOQUE DE CONFIGURACIÓN DE WHATSAPP */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h3 className="font-semibold text-sm text-gray-800">WhatsApp Cloud API (Meta)</h3>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Phone Number ID
            </label>
            <input
              type="text"
              required
              placeholder="Ej. 10928374656473"
              disabled={isPending}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition"
              value={whatsappPhoneId}
              onChange={(e) => setWhatsappPhoneId(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Token de Acceso Permanente
            </label>
            <input
              type="password"
              required
              placeholder="Escribe o pega el token de Meta"
              disabled={isPending}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition"
              value={whatsappToken}
              onChange={(e) => setWhatsappToken(e.target.value)}
            />
          </div>
        </div>

        {/* BLOQUE DE CONFIGURACIÓN DE CORREO SMTP */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">✉️</span>
            <h3 className="font-semibold text-sm text-gray-800">Correo Electrónico Inmobiliario (SMTP)</h3>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Correo Remitente (Usuario SMTP)
            </label>
            <input
              type="email"
              required
              placeholder="info@tuagenciainmobiliaria.com"
              disabled={isPending}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition"
              value={smtpEmail}
              onChange={(e) => setSmtpEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Contraseña de Aplicación / SMTP
            </label>
            <input
              type="password"
              required
              placeholder="Contraseña segura o token de correo"
              disabled={isPending}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-emerald-600 text-white font-medium p-2.5 rounded-lg hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2 shadow-sm"
        >
          {isPending ? (
            'Configurando canales de IA...'
          ) : (
            <>Finalizar configuración e Ir al Panel 🚀</>
          )}
        </button>
      </form>
    </motion.div>
  );
}
