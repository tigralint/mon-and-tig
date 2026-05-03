import { useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../ui/ToastProvider';
import './Layout.css';

const routeTitles = {
  '/dashboard': 'Главная',
  '/documents': 'Документы',
  '/flashcards': 'Карточки',
  '/flashcards/study': 'Повторение',
  '/search': 'Поиск',
  '/constellation': 'Созвездие',
  '/analytics': 'Аналитика',
  '/billing': 'Тарифы',
};

const Header = () => {
  const location = useLocation();
  const { addToast } = useToast();
  const title = routeTitles[location.pathname] || 'Lumea';

  // ─── Theme State ───
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('lumea-theme', next);
    setTheme(next);
  }, [theme]);

  // System theme change listener
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!localStorage.getItem('lumea-theme')) {
        const auto = e.matches ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', auto);
        setTheme(auto);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Document title
  useEffect(() => {
    document.title = `${title} — Lumea`;
  }, [title]);

  // ─── Backup Reminder ───
  useEffect(() => {
    if (window.__lumeaShowBackupReminder) {
      window.__lumeaShowBackupReminder = false;
      // Задержка, чтобы тост показался после mount
      setTimeout(() => {
        addToast('💾 Не забудьте сделать бэкап! Настройки → Экспорт данных', 'info', 8000);
      }, 3000);
    }
  }, [addToast]);

  return (
    <header className="header fade-in">
      <div className="header-logo-mobile">
        <span className="text-accent">Lu</span>mea
      </div>
      <div className="header-title">
        <h2>{title}</h2>
      </div>
      <div className="header-actions">
        <button
          className="theme-toggle interactive"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          aria-label="Переключить тему"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
};

export default Header;
