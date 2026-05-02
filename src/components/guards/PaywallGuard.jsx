import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';

export const PaywallGuard = ({ children, featureName = 'Эта функция', fallback }) => {
  const hasAIAccess = useUserStore(state => state.hasAIAccess());
  const navigate = useNavigate();

  if (hasAIAccess) {
    return children;
  }

  if (fallback) {
    return fallback;
  }

  return (
    <div className="paywall-container text-center slide-up" style={{ padding: '40px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-gold)' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
      <h3 style={{ marginBottom: '8px' }}>Премиум Функция</h3>
      <p className="text-muted" style={{ marginBottom: '24px' }}>
        {featureName} использует нейросети и требует Premium подписку или токены.
      </p>
      <button 
        className="btn-primary interactive"
        onClick={() => navigate('/billing')}
      >
        Открыть доступ
      </button>
    </div>
  );
};
