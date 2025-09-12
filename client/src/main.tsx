import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered successfully:', {
          scope: registration.scope,
          state: registration.installing?.state || registration.waiting?.state || registration.active?.state,
          updatefound: !!registration.installing
        });
      })
      .catch((registrationError) => {
        console.error('SW registration failed:', {
          name: registrationError.name,
          message: registrationError.message,
          stack: registrationError.stack,
          toString: registrationError.toString()
        });
        
        // Fallback: Try to fetch the service worker file manually to diagnose
        fetch('/sw.js')
          .then(response => {
            console.error('SW file fetch result:', {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries())
            });
          })
          .catch(fetchError => {
            console.error('SW file not accessible:', fetchError.message);
          });
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
