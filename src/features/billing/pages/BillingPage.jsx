import { useState } from 'react';
import { useUserStore } from '../../../store/userStore';
import { PaymentService } from '../../../services/payment.service';
import './BillingPage.css';

const BillingPage = () => {
  const { tier, tokens, setTier, addTokens } = useUserStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePurchase = async (type, amount, price) => {
    setIsProcessing(true);
    try {
      // Имитация YooKassa
      const payment = await PaymentService.createPayment(price, `Оплата ${type}`);
      
      if (type === 'premium') {
        setTier('premium');
        alert('Спасибо за покупку! Premium активирован навсегда.');
      } else {
        addTokens(amount);
        alert(`Успешно начислено ${amount} токенов!`);
      }
    } catch (error) {
      alert('Ошибка при оплате');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="billing-page fade-in">
      <div className="billing-header">
        <h2>Разблокируйте ИИ-возможности</h2>
        <p className="text-muted">Инвестируйте в своё обучение с умными инструментами</p>
      </div>

      <div className="billing-status">
        <p>Текущий статус: <strong>{tier === 'premium' ? '👑 Premium' : 'Free'}</strong></p>
        {tier !== 'premium' && <p>Баланс токенов: <strong className="text-accent">{tokens}</strong></p>}
      </div>

      <div className="pricing-cards">
        
        {/* Карточка Токенов */}
        <div className="pricing-card">
          <h3>Пакет Токенов</h3>
          <div className="pricing-price">199 ₽</div>
          <p className="text-muted pricing-desc">Оплата за использование</p>
          <ul className="pricing-features">
            <li>✓ 10,000 AI-токенов</li>
            <li>✓ ~50 конспектов</li>
            <li>✓ Без срока действия</li>
          </ul>
          <button 
            className="btn-secondary interactive pricing-btn"
            onClick={() => handlePurchase('tokens', 10000, 199)}
            disabled={isProcessing}
          >
            Купить токены
          </button>
        </div>

        {/* Карточка Lifetime */}
        <div className="pricing-card premium-card">
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
          <button 
            className="btn-primary interactive pricing-btn"
            onClick={() => handlePurchase('premium', 0, 1490)}
            disabled={isProcessing || tier === 'premium'}
          >
            {tier === 'premium' ? 'Уже активно' : 'Купить навсегда'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default BillingPage;
