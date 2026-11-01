import { registerRootComponent } from 'expo';
import App from './App';

// Expo entry point for native + web.
// Without this the bundle loads but renders nothing (blank page).
registerRootComponent(App);
