import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#0a0a0b',
          color: '#e8e6e3',
          fontFamily: "'Golos Text', 'Inter', system-ui, sans-serif",
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>😵</div>
          <h2 style={{ marginBottom: '12px', fontWeight: 500 }}>Что-то пошло не так</h2>
          <p style={{ color: '#8a8a8e', marginBottom: '24px', maxWidth: '400px', lineHeight: 1.5 }}>
            Произошла непредвиденная ошибка. Попробуйте обновить страницу.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#c4a77d',
                color: '#0a0a0b',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              Обновить страницу
            </button>
            <button 
              onClick={this.handleReset}
              style={{
                padding: '12px 24px',
                backgroundColor: 'transparent',
                color: '#e8e6e3',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                fontWeight: 500,
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              Попробовать снова
            </button>
          </div>
          {this.state.error && (
            <details style={{ marginTop: '32px', color: '#5e5e62', fontSize: '12px', maxWidth: '500px' }}>
              <summary style={{ cursor: 'pointer' }}>Детали ошибки</summary>
              <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', marginTop: '8px' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
