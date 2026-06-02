import { Navigate, Outlet } from 'react-router-dom';
import { useStore } from '../lib/store';

export default function ProtectedRoute() {
  const { user, agency } = useStore();

  // 1. 🛡️ CONTROL DE ACCESO: Si no hay usuario logueado, directo al registro
  if (!user) {
    return <Navigate to="/register" replace />;
  }

  // 2. 💳 CONTROL DE MONETIZACIÓN: Si existe la agencia pero el estado no es activo, al plan
  // Ajusta 'agency.estado' o 'agency.plan' según cómo lo llames en tu base de datos
  if (!agency || agency.estado !== 'activo') {
    return <Navigate to="/register" replace />; 
    // O a tu ruta de precios específica si la tienes separada
  }

  // Si está autenticado y ha pagado, le permite ver la ruta correspondiente (Dashboard)
  return <Outlet />;
}
