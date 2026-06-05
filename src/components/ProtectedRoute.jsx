import { Navigate, Outlet } from 'react-router-dom';
import { useStore } from '../lib/store';

export default function ProtectedRoute() {
  const { user, agency } = useStore();

  // 1. 🛡️ CONTROL DE ACCESO: Si no hay usuario logueado, directo al registro
  if (!user) {
    return <Navigate to="/register" replace />;
  }

  const status = agency?.plan_status || agency?.estado;
  const isPaidOrTrial = status === 'active' || status === 'activo' || status === 'trialing';

  if (!agency || !isPaidOrTrial) {
    return <Navigate to="/register" replace />; 
    // O a tu ruta de precios específica si la tienes separada
  }

  // Si está autenticado y ha pagado, le permite ver la ruta correspondiente (Dashboard)
  return <Outlet />;
}
