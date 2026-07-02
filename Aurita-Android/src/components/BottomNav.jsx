import { NavLink } from 'react-router-dom';
import { Home, Search, Library, Heart } from 'lucide-react';

const TABS = [
  { to: '/',           Icon: Home,    label: 'Inicio'    },
  { to: '/buscar',     Icon: Search,  label: 'Buscar'    },
  { to: '/biblioteca', Icon: Library, label: 'Biblioteca'},
  { to: '/favoritos',  Icon: Heart,   label: 'Me gusta'  },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
          `bottom-nav__tab ${isActive ? 'bottom-nav__tab--active' : ''}`
        }>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
