import type { ReactNode } from 'react'

export type TipoMedioVisual = 'efectivo' | 'cuenta' | 'tarjeta' | 'prestamo' | 'medio'

export type IdentidadVisual = {
  fondo: string
  gradiente: string
  texto: string
  bordeActivo: string
  acento: string
  brillo: string
  sombra: string
  Logo: (props: { className?: string }) => ReactNode
}

export type ComercioRapido = {
  id: string
  nombre: string
  fondo: string
  texto: string
  acento: string
  sombra: string
  categoriaSugerida: string
  Logo: (props: { className?: string }) => ReactNode
}

export type AtajoMedioSugerido = {
  nombre: string
  tipo: 'efectivo' | 'cuenta'
}

export const ATAJOS_MEDIOS_SUGERIDOS: readonly AtajoMedioSugerido[] = [
  { nombre: 'Nequi', tipo: 'cuenta' },
  { nombre: 'Bancolombia', tipo: 'cuenta' },
  { nombre: 'Bre-B', tipo: 'cuenta' },
  { nombre: 'Daviplata', tipo: 'cuenta' },
  { nombre: 'Nu', tipo: 'cuenta' },
  { nombre: 'Efectivo', tipo: 'efectivo' },
]

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function IconoCheckSvg({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function LogoNequi({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#DA0081" />
      <path d="M8 19V5l8 14V5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoBancolombia({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 8.5c5.5-3 12.5-3 18 0" stroke="#FDDA24" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M3 13c5.5-2.6 12.5-2.6 18 0" stroke="#0072CE" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M3 17.2c5.5-2.2 12.5-2.2 18 0" stroke="#EF3340" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function LogoBreB({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M13 3L5 14h6l-1 7 9-11h-6l0-7z" fill="#7EF29D" stroke="#7EF29D" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function LogoDaviplata({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 11.5L12 4l9 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V19h12v-8.5" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="12" cy="14.5" r="2" fill="#FCA5A5" />
    </svg>
  )
}

function LogoNu({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 17V9a3 3 0 0 1 6 0v8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 7v8a3 3 0 0 0 6 0V7" stroke="#E9D5FF" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function LogoRappi({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 13c2.5-4 5.5-4 9-1 3.5-3 6.5-3 9 1-2.5 3.5-5.5 4-9 1.5C8.5 17 5.5 16.5 3 13z" fill="currentColor" />
    </svg>
  )
}

function LogoBbva({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 7l5 10 5-10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 17l5-10 4 8" stroke="#7DD3FC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoBogota({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 3l7 3v5c0 4.8-3 8.4-7 10-4-1.6-7-5.2-7-10V6l7-3z" stroke="#FACC15" strokeWidth="2.2" fill="none" />
      <circle cx="12" cy="11.5" r="2.5" fill="currentColor" />
    </svg>
  )
}

function LogoFondoComun({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 10.5L12 3l9 7.5" stroke="#9BE8D0" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke="#9BE8D0" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function LogoEfectivo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="2.8" fill="#86EFAC" />
      <path d="M6.5 9.5v5M17.5 9.5v5" stroke="#86EFAC" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LogoVisa({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M7 10l3.2 5L17 9" stroke="#F7B600" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoMastercard({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="9.5" cy="12" r="5.5" fill="#EB001B" />
      <circle cx="14.5" cy="12" r="5.5" fill="#F79E1B" fillOpacity="0.9" />
    </svg>
  )
}

function LogoPrestamo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" stroke="#C7D2FE" strokeWidth="2.2" />
      <path d="M12 7.5v9M9.5 10.5c0-1.1 1.1-2 2.5-2s2.5.7 2.5 1.8c0 1.2-1.2 1.6-2.5 1.9-1.3.3-2.5.7-2.5 1.9 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LogoTarjetaGenerica({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2.1" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2.1" />
      <rect x="6" y="13.5" width="4" height="2.5" rx="0.6" fill="#CBD5E1" />
    </svg>
  )
}

function LogoCuentaGenerica({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 9l9-5 9 5H3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 12v5M10 12v5M14 12v5M18 12v5M3 19h18" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function MotivoTarjetaSvg({ className = 'size-12' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="36" cy="36" r="10" strokeOpacity="0.18" />
      <path d="M27 29a11 11 0 0 1 0 14" strokeOpacity="0.3" />
      <path d="M23 25a16 16 0 0 1 0 22" strokeOpacity="0.2" />
    </svg>
  )
}

export function identidadMedio(nombre: string, tipo: TipoMedioVisual): IdentidadVisual {
  const n = normalizar(nombre)
  if (n.includes('nequi')) {
    return {
      fondo: '#200020',
      gradiente: 'linear-gradient(135deg, #320036 0%, #170019 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#DA0081',
      acento: '#DA0081',
      brillo: 'rgba(218, 0, 129, 0.36)',
      sombra: '0 10px 22px -6px rgba(218, 0, 129, 0.42), 0 0 0 2px #DA0081',
      Logo: LogoNequi,
    }
  }
  if (n.includes('bancolombia')) {
    return {
      fondo: '#2C2A29',
      gradiente: 'linear-gradient(135deg, #383534 0%, #191817 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#FDDA24',
      acento: '#FDDA24',
      brillo: 'rgba(253, 218, 36, 0.28)',
      sombra: '0 10px 22px -6px rgba(20, 19, 18, 0.46), 0 0 0 2px #FDDA24',
      Logo: LogoBancolombia,
    }
  }
  if (n.includes('bre-b') || n.includes('breb') || n.includes('bre b') || n.includes('llave')) {
    return {
      fondo: '#004B3B',
      gradiente: 'linear-gradient(135deg, #006651 0%, #003328 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#7EF29D',
      acento: '#7EF29D',
      brillo: 'rgba(126, 242, 157, 0.30)',
      sombra: '0 10px 22px -6px rgba(0, 75, 59, 0.45), 0 0 0 2px #7EF29D',
      Logo: LogoBreB,
    }
  }
  if (n.includes('daviplata') || n.includes('davivienda')) {
    return {
      fondo: '#B91C1C',
      gradiente: 'linear-gradient(135deg, #DC2626 0%, #8C1111 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#FCA5A5',
      acento: '#FCA5A5',
      brillo: 'rgba(252, 165, 165, 0.28)',
      sombra: '0 10px 22px -6px rgba(185, 28, 28, 0.45), 0 0 0 2px #FCA5A5',
      Logo: LogoDaviplata,
    }
  }
  if (/\bnu\b/.test(n) || n.includes('nubank')) {
    return {
      fondo: '#820AD1',
      gradiente: 'linear-gradient(135deg, #981EEB 0%, #580594 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#E9D5FF',
      acento: '#E9D5FF',
      brillo: 'rgba(233, 213, 255, 0.30)',
      sombra: '0 10px 22px -6px rgba(130, 10, 209, 0.48), 0 0 0 2px #E9D5FF',
      Logo: LogoNu,
    }
  }
  if (n.includes('rappi')) {
    return {
      fondo: '#FF441F',
      gradiente: 'linear-gradient(135deg, #FF5B37 0%, #CC2604 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#FED7AA',
      acento: '#FED7AA',
      brillo: 'rgba(254, 215, 170, 0.28)',
      sombra: '0 10px 22px -6px rgba(255, 68, 31, 0.45), 0 0 0 2px #FED7AA',
      Logo: LogoRappi,
    }
  }
  if (n.includes('bbva')) {
    return {
      fondo: '#004481',
      gradiente: 'linear-gradient(135deg, #005AA8 0%, #002C57 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#7DD3FC',
      acento: '#7DD3FC',
      brillo: 'rgba(125, 211, 252, 0.28)',
      sombra: '0 10px 22px -6px rgba(0, 68, 129, 0.45), 0 0 0 2px #7DD3FC',
      Logo: LogoBbva,
    }
  }
  if (n.includes('bogota')) {
    return {
      fondo: '#0033A0',
      gradiente: 'linear-gradient(135deg, #0A46C2 0%, #00206B 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#FACC15',
      acento: '#FACC15',
      brillo: 'rgba(250, 204, 21, 0.26)',
      sombra: '0 10px 22px -6px rgba(0, 51, 160, 0.45), 0 0 0 2px #FACC15',
      Logo: LogoBogota,
    }
  }
  if (n.includes('visa')) {
    return {
      fondo: '#1A1F71',
      gradiente: 'linear-gradient(135deg, #252B94 0%, #111552 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#F7B600',
      acento: '#F7B600',
      brillo: 'rgba(247, 182, 0, 0.28)',
      sombra: '0 10px 22px -6px rgba(26, 31, 113, 0.45), 0 0 0 2px #F7B600',
      Logo: LogoVisa,
    }
  }
  if (n.includes('mastercard') || n.includes('master')) {
    return {
      fondo: '#1F242D',
      gradiente: 'linear-gradient(135deg, #2B323F 0%, #13171D 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#F79E1B',
      acento: '#F79E1B',
      brillo: 'rgba(247, 158, 27, 0.28)',
      sombra: '0 10px 22px -6px rgba(19, 23, 29, 0.48), 0 0 0 2px #F79E1B',
      Logo: LogoMastercard,
    }
  }
  if (n.includes('fondo') || n.includes('comun') || n.includes('hogar')) {
    return {
      fondo: '#0F5C48',
      gradiente: 'linear-gradient(135deg, #16765C 0%, #093E30 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#9BE8D0',
      acento: '#9BE8D0',
      brillo: 'rgba(155, 232, 208, 0.28)',
      sombra: '0 10px 22px -6px rgba(15, 92, 72, 0.46), 0 0 0 2px #9BE8D0',
      Logo: LogoFondoComun,
    }
  }
  if (n.includes('efectivo') || n.includes('cash') || n.includes('billete') || tipo === 'efectivo') {
    return {
      fondo: '#14532D',
      gradiente: 'linear-gradient(135deg, #1B6D3C 0%, #0E3B20 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#86EFAC',
      acento: '#86EFAC',
      brillo: 'rgba(134, 239, 172, 0.28)',
      sombra: '0 10px 22px -6px rgba(20, 83, 45, 0.46), 0 0 0 2px #86EFAC',
      Logo: LogoEfectivo,
    }
  }
  if (tipo === 'prestamo') {
    return {
      fondo: '#2D4387',
      gradiente: 'linear-gradient(135deg, #3A56AD 0%, #1F2F63 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#C7D2FE',
      acento: '#C7D2FE',
      brillo: 'rgba(199, 210, 254, 0.26)',
      sombra: '0 10px 22px -6px rgba(45, 67, 135, 0.45), 0 0 0 2px #C7D2FE',
      Logo: LogoPrestamo,
    }
  }
  if (tipo === 'tarjeta') {
    return {
      fondo: '#1E293B',
      gradiente: 'linear-gradient(135deg, #2B394F 0%, #121A26 100%)',
      texto: '#FFFFFF',
      bordeActivo: '#94A3B8',
      acento: '#CBD5E1',
      brillo: 'rgba(148, 163, 184, 0.26)',
      sombra: '0 10px 22px -6px rgba(18, 26, 38, 0.45), 0 0 0 2px #CBD5E1',
      Logo: LogoTarjetaGenerica,
    }
  }
  return {
    fondo: '#1F3A5F',
    gradiente: 'linear-gradient(135deg, #2A4E7D 0%, #152842 100%)',
    texto: '#FFFFFF',
    bordeActivo: '#93C5FD',
    acento: '#CBD5E1',
    brillo: 'rgba(147, 197, 253, 0.26)',
    sombra: '0 10px 22px -6px rgba(31, 58, 95, 0.45), 0 0 0 2px #93C5FD',
    Logo: LogoCuentaGenerica,
  }
}

function LogoCanasta({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 10h14l-1.5 9h-11L5 10z" />
      <path d="M9 10l3-5 3 5" />
    </svg>
  )
}

function LogoEstrella({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 3l2.6 5.6 6.2.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1-4.5-4.3 6.2-.8L12 3z" />
    </svg>
  )
}

function LogoHoja({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M19 4C11 4 5 9.5 5 17c4.5 0 14-1.5 14-13z" />
      <path d="M5 19l6-6" />
    </svg>
  )
}

function LogoAuto({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 14l1.5-5h11L19 14v4H5v-4z" />
      <circle cx="8" cy="18" r="1.5" fill="currentColor" />
      <circle cx="16" cy="18" r="1.5" fill="currentColor" />
    </svg>
  )
}

function LogoCruz({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z" />
    </svg>
  )
}

function LogoHuella({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="7.5" cy="9" r="1.8" />
      <circle cx="12" cy="7" r="1.8" />
      <circle cx="16.5" cy="9" r="1.8" />
      <path d="M7.5 16c0-2.2 2-3.8 4.5-3.8s4.5 1.6 4.5 3.8c0 1.7-1.3 3-3 3h-3c-1.7 0-3-1.3-3-3z" />
    </svg>
  )
}

function LogoTaza({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
      <path d="M16 10h2.5a2.5 2.5 0 0 1 0 5H16" />
    </svg>
  )
}

export const COMERCIOS_RAPIDOS: readonly ComercioRapido[] = [
  { id: 'd1', nombre: 'D1', fondo: '#D61F26', texto: '#FFFFFF', acento: '#FCA5A5', sombra: '0 6px 16px -4px rgba(214, 31, 38, 0.45)', categoriaSugerida: 'mercado', Logo: LogoCanasta },
  { id: 'exito', nombre: 'Éxito', fondo: '#FFE600', texto: '#161E1B', acento: '#161E1B', sombra: '0 6px 16px -4px rgba(234, 179, 8, 0.45)', categoriaSugerida: 'mercado', Logo: LogoEstrella },
  { id: 'ara', nombre: 'Ara', fondo: '#EA580C', texto: '#FFFFFF', acento: '#FED7AA', sombra: '0 6px 16px -4px rgba(234, 88, 12, 0.45)', categoriaSugerida: 'mercado', Logo: LogoCanasta },
  { id: 'carulla', nombre: 'Carulla', fondo: '#007A33', texto: '#FFFFFF', acento: '#BBF7D0', sombra: '0 6px 16px -4px rgba(0, 122, 51, 0.45)', categoriaSugerida: 'mercado', Logo: LogoHoja },
  { id: 'rappi', nombre: 'Rappi', fondo: '#FF441F', texto: '#FFFFFF', acento: '#FED7AA', sombra: '0 6px 16px -4px rgba(255, 68, 31, 0.45)', categoriaSugerida: 'mercado', Logo: LogoRappi },
  { id: 'uber', nombre: 'Uber', fondo: '#111827', texto: '#FFFFFF', acento: '#9CA3AF', sombra: '0 6px 16px -4px rgba(17, 24, 39, 0.42)', categoriaSugerida: 'transporte', Logo: LogoAuto },
  { id: 'farmatodo', nombre: 'Farmatodo', fondo: '#0057B8', texto: '#FFFFFF', acento: '#BFDBFE', sombra: '0 6px 16px -4px rgba(0, 87, 184, 0.45)', categoriaSugerida: 'salud', Logo: LogoCruz },
  { id: 'laika', nombre: 'Laika', fondo: '#6D28D9', texto: '#FFFFFF', acento: '#DDD6FE', sombra: '0 6px 16px -4px rgba(109, 40, 217, 0.45)', categoriaSugerida: 'mascotas', Logo: LogoHuella },
  { id: 'juan-valdez', nombre: 'Juan Valdez', fondo: '#4E2A1E', texto: '#FFF7ED', acento: '#FDBA74', sombra: '0 6px 16px -4px rgba(78, 42, 30, 0.45)', categoriaSugerida: 'entretenimiento', Logo: LogoTaza },
]

export function IconoCategoria({
  nombre,
  icono,
  className = 'size-4 shrink-0',
}: {
  nombre: string
  icono: string | null
  className?: string
}) {
  const clave = normalizar(`${icono ?? ''} ${nombre}`)
  if (clave.includes('mercado')) return <LogoCanasta className={className} />
  if (clave.includes('transporte')) return <LogoAuto className={className} />
  if (clave.includes('salud')) return <LogoCruz className={className} />
  if (clave.includes('mascota')) return <LogoHuella className={className} />
  if (clave.includes('entretenimiento')) return <LogoTaza className={className} />
  if (clave.includes('servicio')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M13 3L5 14h6l-1 7 9-11h-6V3z" />
      </svg>
    )
  }
  if (clave.includes('arriendo')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="8" cy="14" r="3.5" />
        <path d="M11.5 14H21v3M17.5 14v2.5" />
      </svg>
    )
  }
  if (clave.includes('hogar') || clave.includes('electro')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M6 10v9h12v-9" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}
