import { useState, useEffect } from 'react';
import { FileText, Network, Maximize } from 'lucide-react';

const OnboardingOverlay = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('constellation_onboarding_done')) setShow(true);
  }, []);

  if (!show) return null;

  const close = () => {
    localStorage.setItem('constellation_onboarding_done', 'true');
    setShow(false);
  };

  return (
    <div className="constellation-onboarding">
      <div className="onboarding-icon">✨</div>
      <h3>Добро пожаловать в Созвездие</h3>
      <ul>
        <li><FileText size={16} /> Каждая звезда — это ваш документ</li>
        <li><Network size={16} /> Линии показывают смысловые связи между ними</li>
        <li><Maximize size={16} /> Вращайте, приближайте колёсиком мыши</li>
        <li>✨ Кликайте на звёзды и линии, чтобы исследовать связи</li>
      </ul>
      <button className="constellation-onboarding-btn" onClick={close}>Начать исследование</button>
    </div>
  );
};

export default OnboardingOverlay;
