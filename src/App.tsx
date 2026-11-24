import { BrowserRouter } from 'react-router-dom'
import { conectarSupabase } from './data/supabase'
import { PantallaConfigurarSupabase } from './ui/PantallaConfigurarSupabase'
import { RutasFundacion } from './ui/RutasFundacion'

const servicios = conectarSupabase(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export default function App() {
  return (
    <BrowserRouter>
      <a href="#contenido" className="hogar-skip-link">
        Saltar al contenido principal
      </a>
      {servicios ? (
        <RutasFundacion servicios={servicios} />
      ) : (
        <PantallaConfigurarSupabase />
      )}
    </BrowserRouter>
  )
}
