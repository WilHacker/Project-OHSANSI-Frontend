import { useEffect } from 'react';
import { useAuthStore } from '@/auth/login/stores/authStore';
import { useSistemaStore } from '@/features/sistema/stores/useSistemaStore';
import { sistemaService } from '@/features/sistema/services/sistemaService';
import { echo } from '@/lib/echo';

export const useSyncPermissions = () => {
  const user = useAuthStore((state) => state.user);
  const { 
    capabilities, 
    setCapabilities, 
    setCapabilitiesLoading, 
    setCapabilitiesError 
  } = useSistemaStore();

  useEffect(() => {
    const sync = async () => {
      // 1. Si no hay usuario logueado, no hacemos nada.
      if (!user?.id_usuario) return;

      // CORRECCIÓN CRÍTICA:
      // Solo omitimos la petición si el ID de usuario coincide Y ya tenemos acciones cargadas.
      // Si el array de acciones_permitidas está vacío o no existe, forzamos la carga.
      const tieneAcciones = capabilities?.acciones_permitidas && capabilities.acciones_permitidas.length > 0;
      
      if (capabilities?.user_id === user.id_usuario && tieneAcciones) {
        return;
      }

      try {
        setCapabilitiesLoading(true);
        // Llamada a la API para obtener los permisos reales del backend
        const data = await sistemaService.obtenerCapacidadesUsuario(user.id_usuario);
        setCapabilities(data);
      } catch (error) {
        console.error('Error sincronizando permisos (HTTP):', error);
        setCapabilitiesError('Fallo al cargar permisos iniciales');
      } finally {
        setCapabilitiesLoading(false);
      }
    };

    sync();
    // Añadimos la longitud del array a las dependencias para que el hook 
    // reaccione si los permisos se limpian.
  }, [
    user?.id_usuario, 
    capabilities?.user_id, 
    capabilities?.acciones_permitidas?.length, 
    setCapabilities, 
    setCapabilitiesLoading, 
    setCapabilitiesError
  ]);

  useEffect(() => {
    if (!user?.id_usuario) return;

    const canalPrivado = `usuario.${user.id_usuario}`;

    console.log(`🔌 Suscribiéndose a cambios en tiempo real: ${canalPrivado}`);
    const channel = echo.private(canalPrivado);

    channel.listen('.MisAccionesActualizadas', (e: any) => {
        console.log('⚡ [WebSocket] Permisos actualizados en caliente:', e);
        // Asegúrate de que el backend envíe en 'e.acciones' el objeto completo 
        // de capacidades (UserCapabilities) y no solo el array.
        if (e.acciones) {
            setCapabilities(e.acciones);
        }
    });

    return () => {
      console.log(`🔌 Desconectando canal: ${canalPrivado}`);
      channel.stopListening('.MisAccionesActualizadas');
      echo.leave(canalPrivado);
    };
  }, [user?.id_usuario, setCapabilities]); 
};