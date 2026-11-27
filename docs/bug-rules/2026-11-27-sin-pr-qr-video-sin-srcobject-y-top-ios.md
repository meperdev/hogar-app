# El visor QR montaba el video tarde y el header quedaba muy pegado al borde superior en iPhone

- Síntoma: en iPhone Safari, al abrir `/compra/escanear` y aceptar el permiso de cámara, el visor permanecía negro sin mostrar video ni decodificar el QR; además el título del header quedaba muy pegado al borde superior / isla dinámica en PWA.
- Causa: `PantallaEscanearFactura.tsx` renderizaba `<video ref={videoRef}>` solo cuando `camaraActiva === true`, por lo que `videoRef.current` era `null` en el instante en que resolvía `getUserMedia` y nunca recibía `srcObject`; `.hogar-header` solo sumaba `0.625rem` (`0.5rem` en compacto) sobre `env(safe-area-inset-top, 0px)`.
- Prevención: `<video ref={videoRef}>` permanece montado durante `paso === 'leyendo'` (con `streamRef` + `useEffect` de respaldo y `inversionAttempts: 'attemptBoth'`), `.hogar-header` suma `1.5rem` (`1.25rem` compacto) al `safe-area-inset-top`, y el test de `src/ui/compraRapida/CompraRapida.test.tsx` afirma `expect(video?.srcObject).toBe(mediaStream)` antes de simular dimensiones de video.
- PR: sin PR aún (rama `fix/qr-video-top-safe-area`).
