import { NavLink } from 'react-router-dom';
import { Home, FileText, Layers, Search, Sparkles } from 'lucide-react';
import './BottomNav.css';

const BottomNav = () => {
  return (
    <nav className="bottom-nav">
      <NavLink to="/dashboard" className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <Home size={22} />
        <span>Главная</span>
      </NavLink>
      <NavLink to="/documents" className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <FileText size={22} />
        <span>Доки</span>
      </NavLink>
      <NavLink to="/flashcards" className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <Layers size={22} />
        <span>Карточки</span>
      </NavLink>
      <NavLink to="/search" className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <Search size={22} />
        <span>Поиск</span>
      </NavLink>
      <NavLink to="/constellation" className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <Sparkles size={22} />
        <span>Звёзды</span>
      </NavLink>
    </nav>
  );
};

export default BottomNav;
