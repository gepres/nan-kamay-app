// Registrar el background task ANTES de que Expo Router arranque.
// TaskManager.defineTask() DEBE ejecutarse en el scope global del entry point.
import '@infrastructure/services/GpsServiceImpl';

// Cargar Expo Router normalmente
import 'expo-router/entry';
