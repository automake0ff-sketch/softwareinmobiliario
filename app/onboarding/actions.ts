'use server';

import crypto from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Inicializamos el cliente de Supabase usando la clave de servicio (Service Role)
// para asegurarnos de que el servidor tenga permisos de escritura.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Paso2Data {
  nombreEmpresa: string;
  ciudad: string;
  telefonoCorp: string;
  telefonoPersonal?: string; // Opcional, solo si el usuario usó Google
}

export async function guardarPaso2(data: Paso2Data) {
  // 1. Verificar que el usuario esté autenticado en Clerk
  const { userId } = auth();
  
  if (!userId) {
    return { success: false, error: 'Usuario no autenticado' };
  }

  try {
    // 2. Insertar la nueva agencia inmobiliaria en la tabla 'empresas'
    const { data: nuevaEmpresa, error: errorEmpresa } = await supabase
      .from('empresas')
      .insert({
        nombre_empresa: data.nombreEmpresa,
        ciudad: data.ciudad,
        telefono_corporativo: data.telefonoCorp,
      })
      .select('id')
      .single();

    if (errorEmpresa || !nuevaEmpresa) {
      console.error('Error al crear la empresa:', errorEmpresa);
      return { success: false, error: 'No se pudo crear el registro de la empresa' };
    }

    // 3. Preparar los datos de actualización del usuario
    const updateData: any = {
      empresa_id: nuevaEmpresa.id,
      onboarding_paso: 3, // Avanzamos el flujo de pantallas
    };

    // Si el usuario se registró con Google, no tendrá teléfono guardado. 
    // Lo guardamos en este momento si viene en los datos del formulario.
    if (data.telefonoPersonal) {
      updateData.telefono = data.telefonoPersonal;
    }

    // 4. Actualizar el registro del usuario vinculándolo a la empresa
    const { error: errorUsuario } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('clerk_id', userId);

    if (errorUsuario) {
      console.error('Error al actualizar el usuario:', errorUsuario);
      return { success: false, error: 'No se pudo vincular el usuario a la empresa' };
    }

    return { success: true };

  } catch (error) {
    console.error('Error interno del servidor:', error);
    return { success: false, error: 'Ocurrió un error inesperado' };
  }
}

function cifrarTexto(texto: string): string {
  const ALGORITMO = 'aes-256-gcm';
  const CLAVE = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8');
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv(ALGORITMO, CLAVE, iv);
  let encrypted = cipher.update(texto, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

interface Paso3Data {
  whatsappToken: string;
  whatsappPhoneId: string;
  smtpEmail: string;
  smtpPass: string;
}

export async function guardarPaso3(data: Paso3Data) {
  const { userId } = auth();
  if (!userId) return { success: false, error: 'Usuario no autenticado' };

  try {
    const { data: usuario, error: errorUser } = await supabase
      .from('usuarios')
      .select('empresa_id')
      .eq('clerk_id', userId)
      .single();

    if (errorUser || !usuario?.empresa_id) {
      return { success: false, error: 'No se encontró la empresa del usuario' };
    }

    const tokenWhatsAppCifrado = cifrarTexto(data.whatsappToken);
    const passwordSmtpCifrada = cifrarTexto(data.smtpPass);

    const { error: errorEmpresa } = await supabase
      .from('empresas')
      .update({
        whatsapp_token: tokenWhatsAppCifrado,
        whatsapp_phone_id: data.whatsappPhoneId,
        smtp_email: data.smtpEmail,
        smtp_password: passwordSmtpCifrada,
      })
      .eq('id', usuario.empresa_id);

    if (errorEmpresa) {
      console.error('Error al guardar credenciales:', errorEmpresa);
      return { success: false, error: 'Error al almacenar las integraciones' };
    }

    const { error: errorFinalizar } = await supabase
      .from('usuarios')
      .update({ onboarding_paso: 4 })
      .eq('clerk_id', userId);

    if (errorFinalizar) {
      return { success: false, error: 'Error al finalizar el registro' };
    }

    return { success: true };

  } catch (error) {
    console.error('Error interno en Paso 3:', error);
    return { success: false, error: 'Ocurrió un error inesperado' };
  }
}