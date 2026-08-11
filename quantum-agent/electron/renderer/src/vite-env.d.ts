/// <reference types="vite/client" />

declare global {
  interface Window {
    quantumAPI: import("../preload.ts").QuantumAPI;
  }
}

export {};
