import { NavLink } from 'react-router-dom';
import './Sidebar.css'; // Будет создан позже, пока инлайним стили или используем tokens

const Sidebar = () => {
  return (
    <aside className="sidebar fade-in">
      <div className="sidebar-logo">
        <span className="text-accent">Lu</span>mea
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link interactive'}>
          Главная
        </NavLink>
        <NavLink to="/documents" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link interactive'}>
          Документы
        </NavLink>
        <NavLink to="/flashcards" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link interactive'}>
          Карточки
        </NavLink>
        <NavLink to="/search" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link interactive'}>
          Поиск
        </NavLink>
        <NavLink to="/constellation" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link interactive'}>
          Созвездие
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <NavLink to="/billing" className="nav-link interactive upgrade-link">
          Тарифы
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
