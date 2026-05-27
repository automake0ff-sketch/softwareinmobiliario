import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">🔧</div>
            <h1 className="text-2xl font-bold text-white mb-2">Algo salió mal</h1>
            <p className="text-gray-400 mb-6">
              {this.state.error.message || 'Error inesperado al cargar la aplicación'}
            </p>
            <button
              onClick={() => {
                this.setState({ error: null })
                window.location.href = '/'
              }}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
