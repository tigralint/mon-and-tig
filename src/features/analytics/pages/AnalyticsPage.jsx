import { useState, useEffect } from 'react';
import { AnalyticsService } from '../../../services/analytics.service';
import './AnalyticsPage.css';

const AnalyticsPage = () => {
  const [stats, setStats] = useState(null);
  const [streak, setStreak] = useState(null);
  const [activity, setActivity] = useState([]);
  const [retention, setRetention] = useState([]);
  const [topics, setTopics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, st, a, r, t] = await Promise.all([
          AnalyticsService.getOverviewStats(),
          AnalyticsService.getStreak(),
          AnalyticsService.getActivityData(180),
          AnalyticsService.getRetentionTrend(12),
          AnalyticsService.getTopicStrength(),
        ]);
        setStats(s);
        setStreak(st);
        setActivity(a);
        setRetention(r);
        setTopics(t);
      } catch (e) {
        console.error('Analytics error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="analytics-page fade-in">
        <div className="analytics-loading">
          <div className="spinner" />
          <p className="text-muted">Загрузка аналитики...</p>
        </div>
      </div>
    );
  }

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}с`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}мин`;
    return `${Math.round(seconds / 3600)}ч ${Math.round((seconds % 3600) / 60)}мин`;
  };

  return (
    <div className="analytics-page fade-in">
      <div className="analytics-header">
        <h2>Аналитика обучения</h2>
        <p className="text-muted">Ваш прогресс и статистика</p>
      </div>

      {/* Overview Stats */}
      <div className="analytics-stats-row">
        <div className="analytics-stat-card">
          <div className="stat-emoji">🔥</div>
          <div className="stat-value">{streak?.currentStreak || 0}</div>
          <div className="stat-label">Стрик (дней)</div>
          {streak?.longestStreak > 0 && (
            <div className="stat-sub">Рекорд: {streak.longestStreak}</div>
          )}
        </div>
        <div className="analytics-stat-card">
          <div className="stat-emoji">📝</div>
          <div className="stat-value">{stats?.totalCards || 0}</div>
          <div className="stat-label">Карточек</div>
          {stats?.dueNow > 0 && (
            <div className="stat-sub stat-due">{stats.dueNow} к повторению</div>
          )}
        </div>
        <div className="analytics-stat-card">
          <div className="stat-emoji">✅</div>
          <div className="stat-value">{stats?.totalReviews || 0}</div>
          <div className="stat-label">Повторений</div>
        </div>
        <div className="analytics-stat-card">
          <div className="stat-emoji">⏱️</div>
          <div className="stat-value">{formatTime(stats?.totalStudyTime || 0)}</div>
          <div className="stat-label">Время учёбы</div>
        </div>
      </div>

      {/* Activity Heatmap */}
      <div className="analytics-card">
        <h3 className="analytics-card-title">📅 Активность за 6 месяцев</h3>
        <ActivityHeatmap data={activity} />
      </div>

      {/* Retention Trend + Topic Strength */}
      <div className="analytics-two-col">
        <div className="analytics-card">
          <h3 className="analytics-card-title">📈 Тренд усвоения</h3>
          <RetentionChart data={retention} />
        </div>
        <div className="analytics-card">
          <h3 className="analytics-card-title">🎯 Сила по темам</h3>
          <TopicBars data={topics} />
        </div>
      </div>
    </div>
  );
};

/**
 * GitHub-style Activity Heatmap (SVG)
 */
const ActivityHeatmap = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-muted text-small text-center">Пока нет данных</p>;
  }

  const cellSize = 12;
  const gap = 2;
  const size = cellSize + gap;

  // Группируем по неделям
  const weeks = [];
  let currentWeek = [];
  const firstDay = new Date(data[0].date).getDay();

  // Padding для первого дня
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    currentWeek.push(null);
  }

  for (const day of data) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const maxCount = Math.max(1, ...data.map(d => d.count));

  const getColor = (count) => {
    if (count === 0) return 'var(--bg-tertiary)';
    const intensity = Math.min(count / maxCount, 1);
    if (intensity < 0.25) return 'rgba(196, 167, 125, 0.2)';
    if (intensity < 0.5) return 'rgba(196, 167, 125, 0.4)';
    if (intensity < 0.75) return 'rgba(196, 167, 125, 0.65)';
    return 'rgba(196, 167, 125, 0.9)';
  };

  const width = weeks.length * size + 4;
  const height = 7 * size + 20;

  return (
    <div className="heatmap-container">
      <svg width={width} height={height} className="heatmap-svg">
        {weeks.map((week, wi) =>
          week.map((day, di) => {
            if (!day) return null;
            return (
              <rect
                key={`${wi}-${di}`}
                x={wi * size + 2}
                y={di * size + 2}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={getColor(day.count)}
                className="heatmap-cell"
              >
                <title>{day.date}: {day.count} повторений</title>
              </rect>
            );
          })
        )}
      </svg>
      <div className="heatmap-legend">
        <span className="text-muted text-small">Меньше</span>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
          <span
            key={i}
            className="heatmap-legend-cell"
            style={{
              background: intensity === 0 ? 'var(--bg-tertiary)' : `rgba(196, 167, 125, ${0.2 + intensity * 0.7})`,
            }}
          />
        ))}
        <span className="text-muted text-small">Больше</span>
      </div>
    </div>
  );
};

/**
 * Retention Trend — simple line/bar chart (SVG)
 */
const RetentionChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-muted text-small text-center">Пока нет данных о повторениях</p>;
  }

  const width = 400;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 30, left: 35 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(10, ...data.map(d => d.retention));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="retention-svg">
      {/* Y axis labels */}
      {[0, 25, 50, 75, 100].map(v => {
        if (v > maxVal + 10) return null;
        const y = padding.top + chartH - (v / maxVal) * chartH;
        return (
          <g key={v}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y}
              stroke="var(--border-subtle)" strokeDasharray="2,4" />
            <text x={padding.left - 5} y={y + 4} textAnchor="end"
              fill="var(--text-muted)" fontSize="10">{v}%</text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barW = Math.max(8, chartW / data.length - 4);
        const x = padding.left + (i / data.length) * chartW + 2;
        const barH = (d.retention / maxVal) * chartH;
        const y = padding.top + chartH - barH;

        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH}
              rx={3} fill="var(--accent-gold)" opacity={0.7 + (d.retention / maxVal) * 0.3}
              className="retention-bar">
              <title>Неделя {d.week}: {d.retention}% ({d.reviewed}/{d.total})</title>
            </rect>
            {/* Week label (every 2nd) */}
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={height - 5} textAnchor="middle"
                fill="var(--text-muted)" fontSize="9">
                {d.week.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Topic Strength — horizontal bar chart
 */
const TopicBars = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-muted text-small text-center">Создайте карточки из документов</p>;
  }

  return (
    <div className="topic-bars">
      {data.map((topic, i) => (
        <div key={i} className="topic-bar-item">
          <div className="topic-bar-header">
            <span className="topic-name">{topic.name.length > 25 ? topic.name.slice(0, 22) + '...' : topic.name}</span>
            <span className="topic-stat text-muted text-small">{topic.mastered}/{topic.total} ({topic.strength}%)</span>
          </div>
          <div className="topic-bar-track">
            <div className="topic-bar-fill"
              style={{ width: `${topic.strength}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default AnalyticsPage;
