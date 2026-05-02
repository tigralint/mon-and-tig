import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import './Layout.css';

const routeTitles = {
  '/dashboard': 'Главная',
  '/documents': 'Документы',
  '/flashcards': 'Карточки',
  '/flashcards/study': 'Повторение',
  '/search': 'Поиск',
  '/constellation': 'Созвездие',
  '/billing': 'Тарифы',
};

const Header = () => {
  const location = useLocation();
  const title = routeTitles[location.pathname] || 'Lumea';

  useEffect(() => {
    document.title = `${title} — Lumea`;
  }, [title]);

  return (
    <header className="header fade-in">
      <div className="header-logo-mobile">
        <span className="text-accent">Lu</span>mea
      </div>
      <div className="header-title">
        <h2>{title}</h2>
      </div>
      <div className="header-actions">
        {/* Будущие действия */}
      </div>
    </header>
  );
};

export default Header;
