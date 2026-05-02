import { useState } from 'react';
import { useUserStore } from '../../../store/userStore';
import { useToast } from '../../../components/ui/ToastProvider';
import './BillingPage.css';

const BillingPage = () => {
  const { tier, activatedPromo, activatePromo } = useUserStore();
  const { addToast } = useToast();
  const [promoCode, setPromoCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);

  const handleActivatePromo = async (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    
    setIsActivating(true);
    // Имитация задержки (как будто проверяем на сервере)
    await new Promise(r => setTimeout(r, 600));
    
    const result = activatePromo(promoCode);
    
    if (result.success) {
      addToast(result.message, 'success');
      setPromoCode('');
    } else {
      addToast(result.message, 'error');
    }
    setIsActivating(false);
  };

  return (
    <div className="billing-page fade-in">
      <div className="billing-header">
        <h2>Тарифы и доступ</h2>
        <p className="text-muted">AI-функции Lumea требуют подписку</p>
      </div>

      {/* Текущий статус */}
      <div className="billing-status" style={{ 
        padding: '20px', 
        backgroundColor: 'var(--bg-secondary)', 
        borderRadius: 'var(--radius-md)', 
        border: `1px solid ${tier === 'premium' ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
        marginBottom: '32px'
      }}>
        <p style={{ fontSize: '18px', marginBottom: '4px' }}>
          Статус: <strong style={{ color: tier === 'premium' ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
            {tier === 'premium' ? '👑 Premium' : 'Free'}
          </strong>
        </p>
        {activatedPromo && (
          <p className="text-muted text-small">Промокод: {activatedPromo}</p>
        )}
      </div>

      {/* Промокод */}
      {tier !== 'premium' && (
        <div style={{ 
          padding: '24px', 
          backgroundColor: 'var(--bg-secondary)', 
          borderRadius: 'var(--radius-md)', 
          border: '1px solid var(--border-subtle)',
          marginBottom: '32px'
        }}>
          <h3 style={{ marginBottom: '8px' }}>🎟️ Есть промокод?</h3>
          <p className="text-muted text-small" style={{ marginBottom: '16px' }}>
            Введите промокод для активации Premium-доступа
          </p>
          <form onSubmit={handleActivatePromo} style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              value={promoCode} 
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Введите промокод"
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '15px',
              }}
            />
            <button 
              type="submit" 
              className="btn-primary interactive"
              disabled={isActivating || !promoCode.trim()}
            >
              {isActivating ? '...' : 'Активировать'}
            </button>
          </form>
        </div>
      )}

      {/* Тарифные планы — превью */}
      <div className="pricing-cards">
        <div className="pricing-card" style={{ opacity: 0.6 }}>
          <h3>Пакет Токенов</h3>
          <div className="pricing-price">199 ₽</div>
          <p className="text-muted pricing-desc">Оплата за использование</p>
          <ul className="pricing-features">
            <li>✓ 10,000 AI-токенов</li>
            <li>✓ ~50 конспектов</li>
            <li>✓ Без срока действия</li>
          </ul>
          <button className="btn-secondary pricing-btn" disabled>
            Скоро
          </button>
        </div>

        <div className="pricing-card premium-card" style={{ opacity: 0.6 }}>
          <div className="pricing-badge">ВЫГОДНО</div>
          <h3>Lifetime Premium</h3>
          <div className="pricing-price text-accent">1,490 ₽</div>
          <p className="text-muted pricing-desc">Разовая оплата. Навсегда.</p>
          <ul className="pricing-features">
            <li>✓ Безлимитные конспекты</li>
            <li>✓ Безлимитные флеш-карточки</li>
            <li>✓ Семантический поиск</li>
            <li>✓ Приоритетная поддержка</li>
          </ul>
          <button className="btn-secondary pricing-btn" disabled>
            Скоро
          </button>
        </div>
      </div>

      <p className="text-muted text-small text-center" style={{ marginTop: '24px' }}>
        Оплата через ЮKassa будет доступна в ближайшее время.
      </p>
    </div>
  );
};

export default BillingPage;
